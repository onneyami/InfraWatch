# API Reference

Base URL in local development: `http://localhost:8000/api/v1`. The frontend's Vite dev
server proxies `/api` to the backend, so from the browser everything is relative to
`/api/v1`. That is the `baseURL` of `httpClient` in `services/api.ts`.

This list was produced by reading `routers/*.py` and `middleware.py` directly, not from
memory. The distinction matters on this project: see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md#response-envelopes-are-inconsistent-across-endpoints).
If this file ever disagrees with the code, trust the code and fix this file.

## Authentication per request

Everything under `/api/v1/` is **denied by default**. The browser authenticates with the
`ahova_session` cookie set at login (see
[ARCHITECTURE.md](ARCHITECTURE.md#authentication)); `httpClient` sends it automatically.
Unsafe requests (POST/PUT/PATCH/DELETE) with the cookie must also send
`X-Requested-With: XMLHttpRequest`, otherwise the response is `403 Missing CSRF header`.
`EventSource` (the log stream) sends the cookie by itself; there is no token in any URL.

| Access | Routes |
|---|---|
| **Public** (no credential) | `GET /`, `GET /docs`, `GET /redoc`, `GET /openapi.json`, `GET /api/v1/health`, `POST /api/v1/agents/register`, and the `/api/v1/auth/*` endpoints below (they enforce their own rules) |
| **Agent token** (`X-Agent-ID` + `X-Agent-Token`) | `POST /api/v1/metrics` only |
| **Signed-in user** (session cookie) | every other `/api/v1/` route, including `/system`, `/docker/metrics`, `/docker/images` and the CIS scan endpoints, which used to be public |

An agent token is rejected on every route except the metrics push. Rate limits: 300
requests/minute per user and endpoint, 60 per agent and endpoint (`429` beyond that).

## Metrics and agents (`metrics_router.py`, prefix `/api/v1`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/agents/register` | Public. Returns a per-agent token. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md#agent-registration-is-open-and-can-overwrite-an-existing-agent). |
| `POST` | `/metrics` | The agent pushes its snapshot here. Requires the agent token. |
| `GET` | `/metrics/latest` | Returns `{ [agentId]: AgentMetrics }`, a bare object keyed by agent ID, **not** wrapped in `{ agents: {...} }`. |
| `GET` | `/metrics/history` | Query: `agent_id`, `metric_type` (a dotted path into the raw payload, e.g. `cpu.usage`), `limit`, `timeframe` (seconds; pass it explicitly). |
| `GET` | `/metrics/summary` | |
| `GET` | `/agents` | Registered agents. |

`metric_type` is a literal dotted-path lookup into whatever the agent posted, not a fixed
enum. Fields nested inside arrays, such as `network.interfaces[].bytes_sent`, are not
reachable that way unless the agent first aggregates them to a top-level field; see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md#network-metrics-need-aggregation-the-agent-doesnt-do-for-you).

## Docker (`docker_router.py`, prefix `/api/v1`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/docker/metrics` | Full snapshot: containers, images, networks, volumes, engine info. The main data source for the Docker pages. |
| `GET` | `/docker/simple` | Lighter alternative to `/docker/metrics`. |
| `GET` | `/docker/images` | Image list only. |
| `GET` | `/docker/container/{container_id}/logs` | Logs as **one newline-joined string**, not an array. Split client-side. |
| `GET` | `/docker/container/{container_id}/logs/stream` | Server-Sent Events live tail. Authenticated by the session cookie; open it with `new EventSource(url, { withCredentials: true })`. |
| `POST` | `/docker/container/{container_id}/start` | |
| `POST` | `/docker/container/{container_id}/stop` | Can take up to Docker's graceful-shutdown window (about 10 s) to respond. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md#container-actions-can-time-out-on-the-client-while-still-succeeding). |
| `POST` | `/docker/container/{container_id}/restart` | Same timeout caveat as `/stop`. |
| `DELETE` | `/docker/container/{container_id}` | |
| `DELETE` | `/docker/image/{image_id}` | |
| `DELETE` | `/docker/volume/{volume_id}` | |
| `DELETE` | `/docker/network/{network_id}` | |

Container CPU/memory percentages come from `docker stats --no-stream`, run fresh on each
call to `/docker/metrics`. Nothing keeps a cache warm, so latency grows with the number
of containers.

## Processes (`process_router.py`, prefix `/api/v1`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/processes` | Process list of the host the **backend** runs on (see [ARCHITECTURE.md](ARCHITECTURE.md#data-flow-end-to-end)). |
| `GET` | `/process/{pid}` | One process. Singular `process`, unlike the list route. |
| `GET` | `/process/{pid}/tree` | Process tree rooted at `pid`. |
| `POST` | `/process/{pid}/stop?force=true\|false` | One endpoint for both: `force=false` (default) sends SIGTERM, `force=true` sends SIGKILL. There is no separate kill route. |
| `GET` | `/process/{pid}/history` | |

## Security (`security_router.py`, prefix `/api/v1`, routes under `/docker/...`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/docker/cis/scan` | Runs the full CIS Docker Benchmark. **Expensive**: dozens of inspection calls. Never call it on a timer or on page load; it must be an explicit user action, with an extended client timeout (60 s). |
| `GET` | `/docker/cis/categories` | CIS check categories. |
| `GET` | `/docker/image/{image_id}/vulnerabilities` | Trivy scan of one image, ID in the path. |
| `POST` | `/docker/image/scan` | Trivy scan; the image is identified in the **request body**. Check the Pydantic model in the router before wiring a client. |
| `POST` | `/docker/image/secrets-scan` | Secrets scan, same body-based pattern. |

**Response shape warning.** The CIS result comes back as
`{ status, scan_type, result: { score, checks: [...] } }`. The data is under `result`,
not at the top level. A past bug shipped because a component read fields off the top
level; the compiler did not catch it because the response was typed as `any`. Type the
actual envelope when you add a typed client.

## System (`system_router.py`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | Public. Root. |
| `GET` | `/api/v1/health` | Public. Liveness only; it does not check the agent, Docker or the databases. |
| `GET` | `/api/v1/system` | CPU/memory/disk/battery of the **backend host**, not of a monitored agent. Easy to confuse with agent-reported metrics if the two ever run on different machines. |

This router's decorators carry the full `/api/v1/...` path instead of using a shared
prefix, which is worth knowing when you search for where a route is defined.

## Auth (`auth_router.py`, prefix `/api/v1/auth`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/auth/status` | Public. `{ "setup_required": bool, "registration_open": bool }`. `setup_required` is true while no account exists. |
| `POST` | `/auth/register` | Public. Body: username, email, password (8-128 characters). The first account is always allowed; later ones need `ALLOW_REGISTRATION=true`, otherwise `403`. Sets the session cookie; the body is `{ "user": ... }` with no token. Limited to 10 attempts/hour per IP. |
| `POST` | `/auth/login` | Public. Body: `username_or_email`, `password`. Sets a fresh session cookie and ends any session the request already carried. `401` on bad credentials; `429` with `Retry-After` after repeated failures. |
| `POST` | `/auth/logout` | Ends the session in the cookie and clears it. Idempotent. Needs the CSRF header when a cookie is present. |
| `GET` | `/auth/me` | Current user from the cookie; `401` if missing or expired. |

Session tokens are opaque random strings; only their SHA-256 hash is stored in
`users.db`. There is no JWT. Lifetime is a fixed 30 days from sign-in.
