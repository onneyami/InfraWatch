# Known Issues and Lessons Learned

Every entry here is a real bug or gap that was found from a concrete symptom, with a
specific fix or workaround. The goal is that nobody has to rediscover them.

## Response envelopes are inconsistent across endpoints

The most common bug class in this project's history is the frontend assuming a response
shape it never checked against the backend.

- The CIS scan wraps its payload as `{ status, scan_type, result: {...} }`. A component
  once read fields off the top level and silently rendered nothing useful, because the
  fields were `undefined` instead of throwing.
- Container logs come back as one string (`{ logs: "line1\nline2\n..." }`), not an array.
  A component called `.map()` on it and crashed with `logs.map is not a function`. The
  literal error text led straight to the cause: the value is not an array.
- `/metrics/latest` returns a bare object keyed by agent ID, not `{ agents: {...} }`.

**Rule:** before writing a frontend call, read the router function's `return` statement.
Do not infer the shape from the endpoint name or copy it from a neighboring endpoint;
these differences exist because endpoints were built at different times with different
conventions. Prefer typing the real envelope over `any`.

## Several read endpoints are fully public

`middleware.py` has a hardcoded list of paths that skip authentication entirely. Besides
health, agent registration and user register/login, it includes `/api/v1/system`,
`/api/v1/docker/metrics`, `/api/v1/docker/images`, `/api/v1/docker/cis/scan` and
`/api/v1/docker/cis/categories`. Anyone who can reach the backend port can read host
stats, the container and image inventory, and run a CIS scan without any token. That is
acceptable for local development and not for any shared or exposed deployment. The
full list is in [API_REFERENCE.md](API_REFERENCE.md#authentication-per-request). Remove
entries from that list (and have the frontend send its token, which it already does) as
part of hardening.

## macOS disk reporting is not what it looks like

`disk.Partitions(true)` on macOS returns several mount points (`/`,
`/System/Volumes/Data`, `/System/Volumes/VM`, `/System/Volumes/Preboot`, ...) that are all
views of the **same APFS container** and report the same free space. Summing free space
across them multiplied the real figure several times over.

The fix in `main.go` has two parts:

1. Deduplicate disks whose `(total, free)` pair matches within a small tolerance.
2. Explicitly skip any mount path containing `/AppTranslocation/`. That is a Gatekeeper
   mechanism for running unverified downloaded apps; it creates a phantom mount with the
   same total but a *different* free value (a couple of GB off), which slips past the
   tolerance-based dedup. It is not a real disk and has to be filtered by path.

If disk numbers look implausible again, enable the agent's debug logging (see
[DEVELOPMENT.md](DEVELOPMENT.md#logs-and-debugging)) and look at the raw partition list
before suspecting the frontend.

## Agent was hardcoded to localhost

For a long stretch the agent's backend URL was a compile-time constant pointing at
`127.0.0.1`, so it could only ever monitor the machine the backend ran on, a silent and
serious limitation for a remote-monitoring tool. It now reads `BACKEND_URL` (and
`AGENT_ID`) from the environment. If a remote host shows nothing, first confirm those
variables actually reached the process: a missing variable silently falls back to
localhost.

## Network metrics need aggregation the agent doesn't do for you

The raw payload nests network counters per interface
(`network.interfaces[].bytes_sent` / `bytes_recv`). The agent now also adds summed
top-level `bytes_sent` / `bytes_recv` with loopback (`lo`, `lo0`) excluded. Any new
consumer that wants a single number must do the same, or loopback traffic inflates it.
Remember that `/metrics/history` can only chart fields reachable by a dotted path, which
excludes anything inside an array.

## Container actions can time out on the client while still succeeding

`docker stop` and `docker restart` give the container a grace period (about 10 seconds by
default) before a forced kill. A client timeout shorter than that makes the request look
failed while the container stops moments later, producing "it says it failed but it
worked" reports.

**Rule:** any caller of `/docker/container/{id}/stop` or `/restart` needs a timeout
comfortably above the grace period. The frontend uses 20 s against the 10 s grace plus
backend overhead.

## The CIS scan must never run automatically

It performs a large number of sequential inspection calls and can take tens of seconds.
It used to run on page load and again on a timer, which made the Security page look
permanently "loading" and loaded Docker needlessly. It is now strictly user-triggered, and
the frontend gives that one call a 60 s timeout instead of the app default.

## Metrics history, alerts and events are not persisted

Metrics history lives in backend memory and is lost on restart. Alerts and the activity
feed live in the frontend store (alerts are seeded with demo data on load) and are lost on
page refresh. There is no backend component that evaluates metrics against thresholds, so
there are no automatically generated alerts: today's alerts and activity entries come from
actions taken in the UI. See the README's suggested next steps.

## User accounts do not scope data

Registration, login and sessions are real, but `X-User-Token` is used only for the
profile menu. Every user, and every anonymous dashboard session, sees the same agents,
containers and metrics. Treat accounts as a foundation for multi-tenancy, not as a
finished feature.

## The Docker collector used to have two independent implementations

The agent once contained both an SDK-based and a CLI-based Docker collector, written at
different times and never reconciled, so edits to one could have no effect if the other
was what actually ran. It is now one collector that tries the Docker SDK first and falls
back to the `docker` CLI only if the SDK path fails. When debugging a Docker data
discrepancy, confirm which path actually executed before changing either.

## Editable pip installs break when the project moves

`pip3 install -e .` records an absolute path. Moving or renaming the repo, or resetting
the Python environment, leaves the `ahova` command pointing at a directory without the
module and produces `ModuleNotFoundError: No module named 'ahova_cli'`. Reinstalling from
the project's current location fixes it every time. See
[DEVELOPMENT.md](DEVELOPMENT.md#when-the-ahova-command-misbehaves).

## Agent changes need a real build

Several agent changes (disk deduplication, network aggregation, environment-based
config) were written without a Go compiler available at authoring time. They have since
been built and run on a real machine, but the lesson stands: after touching `main.go`,
run `make build-agent`, read the compiler output, and restart so the new binary is used.

## Welcome Screen visibility is currently "every load"

The Welcome Screen is shown on every page load while its design is being iterated. A
`sessionStorage` gate (once per browser tab session) was removed because a stale flag made
design changes look like they had no effect. Re-adding it is a one-line change in
`App.tsx` once the design settles.
