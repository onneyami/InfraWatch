# Development Guide

## Prerequisites

- Go, to build the agent
- Python 3.8+ (developed against 3.12 and 3.13)
- Node.js and npm, for the frontend
- Docker, for the Docker features to have anything to show

## First-time setup

```bash
cd Ahova
pip3 install -e .          # installs the `ahova` command
make install               # backend + frontend + agent dependencies
make build-agent           # compiles agent/cmd/agent/main.go
```

On a recent macOS/Python you may need `pip3 install -e . --break-system-packages`.

### When the `ahova` command misbehaves

`pip3 install -e .` is an **editable install**: it records the absolute path of this
directory. If you move or rename the project folder, or reset your Python environment
(reinstalling an IDE has done this), the installed command fails with
`ModuleNotFoundError: No module named 'ahova_cli'`. The fix is always the same: run
`pip3 install -e .` again from where the project lives now.

If the install succeeds but the shell says `ahova: command not found`, the script landed
in a directory that is not on that shell's `PATH` (seen on macOS with the python.org
framework build). Check where it went with `pip3 show -f ahova`, then symlink it into
`/usr/local/bin`, which is on `PATH` for both bash and zsh by default:

```bash
sudo ln -sf "$(python3 -c 'import sysconfig; print(sysconfig.get_path("scripts"))')/ahova" /usr/local/bin/ahova
```

The CLI is only a thin wrapper around `Makefile` targets. If it is broken, call `make`
directly while you fix it.

## Running the app

```bash
ahova start        # backend + frontend + agent
ahova stop
ahova restart
ahova status
ahova logs [backend|frontend|agent]
```

Other commands: `install`, `install-backend`, `install-frontend`, `install-agent`,
`setup`, `clean [--all]`, `build-agent`, `dev`, `version`, `info`.

Once running:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`, interactive docs at `/docs`

`ahova start` needs Docker Desktop running. The start script tries to open it and waits,
but starting it yourself first avoids a slow first launch.

## Logs and debugging

`run-dev.sh` writes one log per service into `logs/`: `backend.log`, `frontend.log`,
`agent.log`. It starts the agent with `AGENT_DEBUG=1`, so `agent.log` contains verbose
output. The disk collector, for example, logs every partition before and after
deduplication:

```bash
grep "disk before dedupe\|disk after dedupe" logs/agent.log
```

When something looks wrong, get the literal error text and the relevant log lines before
theorizing. That has been the fastest route to a fix every time on this project.

If the Overview page sits on "Waiting for an agent to connect", check in this order:
whether the agent process exists (`ps aux | grep agent`), the tail of `logs/agent.log`
(did it register? is it getting HTTP errors?), and the tail of `logs/backend.log`.

## Verification workflow

**There is no automated test suite yet.** Until there is one, this is the minimum bar
before calling a change done. It has repeatedly caught real bugs before a human saw them.

**Backend**

```bash
cd backend/src
python3 -m py_compile main.py middleware.py auth.py user_auth.py docker_simple.py \
  trivy_scanner.py cis_scanner.py core/config.py routers/*.py api/health.py \
  models.py stores.py
```

This catches syntax errors only. For anything touching request/response shapes or
business logic, also write a throwaway script that imports the module and asserts on real
inputs and outputs. `user_auth.py` was verified that way: register, duplicate rejected,
weak password rejected, bad email rejected, login by username and by email, wrong
password rejected, session created, session resolves to the user, logout invalidates it,
unknown token returns nothing. Note the import root: the app runs as `src.main:app` from
`backend/`, so scripts should run from `backend/` and import `src.user_auth`, not run
from inside `src/`.

**Frontend**

```bash
cd frontend
npx tsc --noEmit
```

Run it after every frontend change. The compiled app has no runtime type safety, so a
mistyped prop or a renamed store field is otherwise invisible until it crashes in the
browser. If `node_modules` is missing and you have no network, you cannot run it. Say so
explicitly instead of skipping it silently.

**Agent**

```bash
make build-agent
```

Do this after any change to `main.go`. The compiled binary is git-ignored, and
`ahova start` uses whatever was last built, so forgetting to rebuild after an agent
change is an easy trap. Watch the build output for compile errors.

### Database location

The SQLite files live in `backend/` (`backend/agents.db`, `backend/users.db`). Until
recently a path bug put them in `backend/src/`. On the first start after that fix the
backend moves an existing `backend/src/*.db` to `backend/` automatically and logs a
warning. If both locations contain a file it uses `backend/`, never overwrites anything,
and warns, so remove the stale `backend/src/` copy once you have checked it.

### CI

`.github/workflows/ci.yml` runs this same bar on every push to `main`/`master` and on every
pull request: `tsc --noEmit` and a production `vite build` (frontend), `py_compile` plus an
import smoke test of `src.main:app` (backend), and `go build ./...` (agent). It is the
automated floor, not a test suite: it still catches nothing about behaviour.

A production `vite build` fails unless `VITE_DASHBOARD_TOKEN` is set to a real secret
(not the development placeholder). Set it in your build environment, with the same value
as the backend's `DASHBOARD_API_TOKEN`.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `BACKEND_URL` | Agent | Where to register and push metrics. Default `http://127.0.0.1:8000`. |
| `AGENT_ID` | Agent | Overrides the default `agent-<hostname>`. |
| `AGENT_DEBUG` | Agent | `1` enables verbose logging. `run-dev.sh` sets it. |
| `DASHBOARD_API_TOKEN` | Backend | The shared token every dashboard request must present. Defaults to an insecure placeholder; set a real value before exposing the backend beyond localhost. |
| `VITE_DASHBOARD_TOKEN` | Frontend (`frontend/.env`) | Must equal the backend's `DASHBOARD_API_TOKEN`. |
| `AGENTS_DB_PATH` / `USERS_DB_PATH` | Backend | Override the SQLite file locations (default `backend/agents.db`, `backend/users.db`). |
