# Architecture

Ahova has three components that run as separate processes, started together by the
`ahova` CLI / `Makefile` (see [DEVELOPMENT.md](DEVELOPMENT.md)):

```
┌─────────────┐   metrics push (HTTP)   ┌──────────────────┐   HTTP    ┌──────────────┐
│  Go Agent   │ ──────────────────────► │  FastAPI Backend │ ◄──────── │  React SPA   │
│ (per host)  │ ◄────────────────────── │  (single host)   │ ────────► │  (browser)   │
└─────────────┘   registration/token    └──────────────────┘   data    └──────────────┘
                                                 │
                                                 ▼
                                        agents.db / users.db
                                          (SQLite, local disk)
```

Everything talks to the backend over plain HTTP on `localhost` by default. There is no
message broker, no shared cache and no separate database server. See [Storage](#storage)
for what that means in practice.

## Go Agent

`agent/cmd/agent/main.go` is a single Go binary, one process per monitored host.

On startup it:

1. Reads `BACKEND_URL` and `AGENT_ID` from the environment, falling back to
   `http://127.0.0.1:8000` and `agent-<hostname>`. The backend URL used to be hardcoded
   to localhost; see [Known Issues](KNOWN_ISSUES.md#agent-was-hardcoded-to-localhost).
2. Registers with the backend (`POST /api/v1/agents/register`) and receives a per-agent
   token, cached at `/tmp/ahova_agent_token` so a restart does not re-register.
3. Starts a background heartbeat goroutine.
4. On a loop (default every 5 seconds) collects and pushes metrics:
   - CPU and memory via `gopsutil`.
   - Disk usage, **deduplicated and filtered**. This is not optional on macOS; see
     [Known Issues](KNOWN_ISSUES.md#macos-disk-reporting-is-not-what-it-looks-like).
   - Network counters. They live *per interface* inside the payload; the agent adds
     summed top-level `bytes_sent` / `bytes_recv` (loopback excluded).
   - Docker, through the official Docker SDK first, with a fallback to the `docker` CLI
     if the SDK path fails. Earlier there were two independent, never-reconciled
     implementations; they are now one primary/fallback pair.

The agent has no persistence beyond the token file and no config file, only environment
variables. That makes it trivial to run on a new host, but it can only report to one
backend at a time.

## Backend

FastAPI app in `backend/src/`. `main.py` is deliberately thin: app setup, middleware and
`include_router()` calls. Logic lives in `routers/*.py`:

| Router | Responsibility |
|---|---|
| `metrics_router.py` | Agent registration, metrics ingestion, latest snapshot, history, summary |
| `docker_router.py` | Container/image/network/volume listing and management, logs, SSE live tail |
| `process_router.py` | Process listing, detail, tree, stop/kill |
| `security_router.py` | CIS Docker Benchmark scan, Trivy image vulnerability and secrets scans |
| `system_router.py` | Root, health check, host-level system info of the machine the *backend* runs on |
| `auth_router.py` | User registration, login, logout, current-user lookup |

Supporting modules:

- `auth.py`: agent token issuance and verification, backed by `agents.db`.
- `user_auth.py`: user accounts and sessions, backed by `users.db`. Passwords are hashed
  with **PBKDF2-HMAC-SHA256, 260,000 iterations**, using only the standard library
  because no bcrypt/passlib was available when this was built. Migrating later is
  reasonable, but this is not a defect as-is.
- `docker_simple.py`: the Docker CLI parsing and formatting behind `docker_router.py`.
  For a Docker-data bug, start here rather than in the router.
- `cis_scanner.py` / `trivy_scanner.py`: the two security scanners.
- `middleware.py`: the access policy (public / agent / user), CSRF check and rate limits,
  described below.
- `login_throttle.py`: in-memory failure throttle used by login and registration.
- `core/config.py`: every environment-driven setting, including the SQLite paths and the
  session-cookie and registration settings.

### Authentication

Two credential types, for two kinds of caller. They are not interchangeable.

1. **User session** (browser dashboard). Signing in (or creating the first account) makes
   the backend set an **HttpOnly, SameSite=Lax cookie** (`ahova_session`, `Secure` outside
   `ENVIRONMENT=dev`, path `/api`). The token is never in a response body, never in
   `localStorage` and never in a URL, so page JavaScript cannot read it. Only a SHA-256
   hash of it is stored in `users.db`. Sessions last 30 days, fixed.
2. **Agent token** (`X-Agent-ID` + `X-Agent-Token`). Issued to one agent at registration.
   It is accepted **only** on `POST /api/v1/metrics`; everywhere else it is rejected. A
   compromised monitored host can push its own metrics and nothing more.

`middleware.py` applies a **default-deny** policy to everything under `/api/v1/`. A request
is public only if it is on a short explicit allowlist: `GET /api/v1/health`, the five
`/api/v1/auth/*` endpoints (which enforce their own rules), and `POST /api/v1/agents/register`
(an agent has no token before it registers). Every other route needs a valid session. The
full table is in [API_REFERENCE.md](API_REFERENCE.md#authentication-per-request), and
`backend/tests/test_api_auth.py` fails if a route becomes public or agent-accessible
without the test's expected list being updated on purpose.

**CSRF.** An unsafe request (POST/PUT/PATCH/DELETE) that carries the session cookie must
also send `X-Requested-With: XMLHttpRequest`, which `services/api.ts` always does. A page
on another site cannot add that header without passing CORS, and the cookie is
`SameSite=Lax`, so it cannot make an authenticated state-changing request.

**Registration.** The first account can always be created (first-run setup). After that
sign-up is closed unless `ALLOW_REGISTRATION=true`. `GET /api/v1/auth/status` tells the UI
which screen to show. The UI shows a full-screen sign-in whenever there is no session.

**What accounts still do not do:** scope data. Every signed-in user sees every agent and
container and can run every action. That is the next piece of work; until it lands, keep
registration closed.

### Storage

Two SQLite files, created on first run in `backend/`:

- `agents.db`: registered agents, their tokens, and lightweight rate-limit bookkeeping.
- `users.db`: user accounts and sessions.

**Metrics history is not persisted anywhere.** It lives in backend process memory and is
lost on every restart. That was a scope cut, not an oversight, and it is the first thing
to fix if data must survive a deploy. Alerts and activity events are likewise ephemeral:
they live in the frontend's Zustand store, seeded with demo alerts on load, and have no
backend counterpart.

## Frontend

React + TypeScript SPA built with Vite. There is no React Router: navigation is a single
`currentPage` string in the Zustand store and `App.tsx` switches on it. There is no Redux
and no React Query: `store/appStore.ts` is the only state container and
`services/api.ts` is the only code that talks to the backend.

- **`store/appStore.ts`**: agents, Docker info, alerts, events, CIS result, current user,
  theme, notification settings, and the cross-page "deep link" fields (for example
  `selectedContainerId`, which makes a click on a container in the Overview topology
  open the Docker page with that container's drawer already open).
- **`services/api.ts`**: one axios `httpClient` (cookie credentials, CSRF header, and a
  401 hook that returns the user to the sign-in screen), and one function per backend call. If a page fetches data some other
  way, treat that as a smell: this file is the single place to fix when the contract with
  the backend drifts.
- **`pages/`**: one file per sidebar destination.
- **`components/ui/`**: design-system primitives (`AhovaCard`, `AhovaButton`,
  `AhovaBadge`, `AhovaTable`, `AhovaDrawer`, `AhovaMetric`, `AuthDrawer`). Build new UI
  from these first.
- **`theme/`**: `tokens.ts` exports a `theme` object whose values are CSS variable
  references (`var(--ahova-bg-primary)`), not hex codes. That is what makes runtime theme
  switching work: `global.css` defines the variables per theme and `applyTheme.ts`
  resolves `dark` / `light` / `system` (via `matchMedia`) and sets
  `data-ahova-theme` on `<html>`. A color that bypasses the variables will not follow the
  theme.
- **`components/WelcomeScreen.tsx`**: the pre-app landing screen. It runs its own
  internal scroll container because `body` is `overflow: hidden` for the rest of the app.

## Data flow, end to end

1. The agent registers once and caches its token.
2. Every few seconds it pushes a snapshot to `POST /api/v1/metrics`.
3. The backend keeps the latest snapshot per agent plus a rolling in-memory history for
   `/metrics/history`.
4. The frontend polls `/api/v1/metrics/latest` (and other endpoints), updates the store,
   and pages re-render from it.
5. Actions started from the UI (stop a container, kill a process, run a CIS scan) go
   straight from the frontend to the backend, which talks to the local Docker daemon or
   the local OS. The agent takes no part in *actions*, only in *metrics collection*. So
   the Docker and process endpoints operate on the machine the **backend** runs on, not
   on the machine an agent reports from. With a single host the two are the same and this
   is invisible; it stops being invisible the moment you monitor a remote host.
