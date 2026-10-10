# Ahova

**Ahova** (formerly *InfraWatch*) is an infrastructure observability platform aimed at
junior DevOps engineers and developers who want simple, real server and Docker monitoring
without first standing up Prometheus, Grafana, or any other heavyweight stack.

> "Know your server. Instantly."

This document is the entry point for engineers joining the project. It gives you the
big picture and points you to the rest of `docs/` for depth. Read this first, then:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the three components fit together
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) — backend REST API, endpoint by endpoint
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local setup, the `ahova` CLI, verification workflow
- [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) — real bugs we already hit, and how to avoid repeating them

## What Ahova does today

- **Real-time host metrics** — CPU, memory, disk, network, collected by a lightweight Go
  agent and pushed to the backend on a short interval.
- **Docker management** — container list with live CPU/memory, start/stop/restart/delete,
  log viewing (including a live tail via Server-Sent Events), image/network/volume
  management, image vulnerability scanning (Trivy).
- **Security** — CIS Docker Benchmark scanning, triggered manually (it is expensive; see
  [Known Issues](docs/KNOWN_ISSUES.md)).
- **Process management** — list, inspect, stop (SIGTERM) or kill (SIGKILL) processes on
  the host the backend runs on.
- **Accounts** — real user registration/login (PBKDF2-hashed passwords, server-side
  session tokens), layered on top of the dashboard-wide access token (see
  [Architecture → Authentication](docs/ARCHITECTURE.md#authentication-three-layers)).
- **Alerts & Activity** — a live feed of actions taken through the UI (container
  restarted, process killed, scan started, etc.) plus optional desktop notifications and
  a sound. There is **no automated, threshold-based alerting engine yet** — this is the
  biggest gap between what the Overview page visually promises and what the product
  does today. See [Known Issues](docs/KNOWN_ISSUES.md) and "Suggested next steps" below.
- **Branded Welcome Screen** with a Northern Star / horizon motif, scroll-linked
  parallax and reveal animations, shown before the main app on every page load.
- **Themes** — dark, light, and "system" (follows the OS), switched at runtime through
  CSS variables.

## Tech stack

| Component | Stack |
|---|---|
| Agent | Go, [gopsutil](https://github.com/shirou/gopsutil), Docker SDK with a CLI fallback |
| Backend | Python, FastAPI, SQLite via the standard-library `sqlite3` (no ORM) |
| Frontend | React + TypeScript, Vite, Zustand (state), Recharts (charts), Lucide (icons) |
| CLI | Python (`ahova_cli.py`), installed as a console script through `setup.py` |

There is intentionally no Redis, no message queue, no Postgres. This is a single-host,
single-team tool right now. See [Architecture → Storage](docs/ARCHITECTURE.md#storage)
for what that does and does not mean for data durability.

## Repository layout

```
Ahova/
├── agent/cmd/agent/main.go     # Go agent: collects and pushes metrics
├── backend/
│   ├── src/
│   │   ├── main.py             # FastAPI app assembly: middleware + routers only
│   │   ├── middleware.py       # Dashboard/agent token gate
│   │   ├── auth.py             # Agent registration and tokens (agents.db)
│   │   ├── user_auth.py        # User accounts and sessions (users.db)
│   │   ├── docker_simple.py    # Docker CLI-based metrics collector
│   │   ├── cis_scanner.py      # CIS Docker Benchmark checks
│   │   ├── trivy_scanner.py    # Trivy vulnerability scanning wrapper
│   │   ├── core/config.py      # Env-driven configuration, DB paths
│   │   └── routers/            # metrics, docker, process, security, system, auth
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── store/appStore.ts   # The single Zustand store: all app state lives here
│       ├── services/api.ts     # httpClient (axios) + every backend call, in one place
│       ├── pages/              # Overview, Hosts, Docker, Processes, Metrics, Security, Alerts, Settings
│       ├── components/         # layout/ (Sidebar, TopBar, CommandPalette), ui/ (AhovaCard, AhovaTable, ...)
│       └── theme/              # tokens.ts, global.css, applyTheme.ts (dark/light/system)
├── ahova_cli.py                # implementation of the `ahova` command
├── setup.py                    # packages ahova_cli.py as the `ahova` console script
├── run-dev.sh                  # what `make start` actually runs
└── Makefile                    # start/stop/status/logs/install/build-agent; the CLI wraps this
```

## Quick start

```bash
cd Ahova
pip3 install -e .          # installs the `ahova` command (see docs/DEVELOPMENT.md if this misbehaves)
make install               # backend + frontend dependencies
make build-agent           # compiles the Go agent binary
ahova start                # starts backend, frontend and agent together
```

Then open `http://localhost:5173`. Full detail, including how to read logs and recover
from the common CLI install failures, is in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Suggested next steps for this team

In rough priority order. See [Known Issues](docs/KNOWN_ISSUES.md) for the reasoning
behind each.

1. **Automated tests.** None exist today. Verification so far has been manual:
   `tsc --noEmit` for the frontend, `python3 -m py_compile` plus ad-hoc functional smoke
   scripts for the backend. That caught real bugs, but it does not scale to a team and
   will not catch regressions. Start with pytest integration tests for the auth and
   Docker/metrics routers and a handful of end-to-end tests (Overview loads, Docker
   table renders, login works).
2. **CI.** Wire `tsc --noEmit`, `py_compile` (later pytest) and `go build` into GitHub
   Actions before anything more ambitious.
3. **A real alerting engine.** Thresholds, persistence, and a backend that generates
   alerts from actual metric conditions, rather than the frontend only logging its own
   user-triggered actions.
4. **Persist metrics history.** It currently lives in backend memory and is lost on
   restart. A SQLite table with a retention window would close this gap.
5. **Decide on the public read endpoints.** Several read-only endpoints are reachable
   with no credential at all (listed in [API_REFERENCE.md](docs/API_REFERENCE.md)). Fine
   for localhost development, worth closing before any other kind of deployment.

## License

Ahova © 2026. All rights reserved.
