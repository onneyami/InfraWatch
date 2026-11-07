# API Reference

Base URL in local development: `http://localhost:8000/api/v1`. The frontend's Vite dev
server proxies `/api` to the backend, so from the browser everything is relative to
`/api/v1`. That is the `baseURL` of `httpClient` in `services/api.ts`.

This list was produced by reading `routers/*.py` and `middleware.py` directly, not from
memory. The distinction matters on this project: see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md#response-envelopes-are-inconsistent-across-endpoints).
If this file ever disagrees with the code, trust the code and fix this file.

## Authentication per request

Most endpoints require `X-Dashboard-Token`, which `httpClient` attaches automatically
(see [ARCHITECTURE.md](ARCHITECTURE.md#authentication-three-layers)). The same token is
also accepted as a `?dashboard_token=` query parameter on **any** endpoint, for clients
that cannot set custom headers, such as the browser's `EventSource` used for the log
stream.

These paths skip the token check entirely and need no credential:

- `GET /` and `GET /api/v1/health`
- `GET /api/v1/system`
- `GET /api/v1/docker/images` and `GET /api/v1/docker/metrics`
- `GET /api/v1/docker/cis/scan` and `GET /api/v1/docker/cis/categories`
- `POST /api/v1/agents/register`
- `POST /api/v1/auth/register` and `POST /api/v1/auth/login`

Everything else needs a valid dashboard token (or an agent token, for the metrics push).
Note that several of the public paths expose real host and Docker data; see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md#several-read-endpoints-are-fully-public).

## Metrics and agents (`metrics_router.py`, prefix `/api/v1`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/agents/register` | Public. Returns a per-agent token. |
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
| `GET` | `/docker/metrics` | Full snapshot: containers, images, networks, volumes, engine info. Public. The main data source for the Docker pages. |
| `GET` | `/docker/simple` | Lighter alternative to `/docker/metrics`. |
| `GET` | `/docker/images` | Image list only. Public. |
| `GET` | `/docker/container/{container_id}/logs` | Logs as **one newline-joined string**, not an array. Split client-side. |
| `GET` | `/docker/container/{container_id}/logs/stream` | Server-Sent Events live tail. Send the token as `?dashboard_token=`. |
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
| `GET` | `/docker/cis/scan` | Runs the full CIS Docker Benchmark. Public. **Expensive**: dozens of inspection calls. Never call it on a timer or on page load; it must be an explicit user action, with an extended client timeout (60 s). |
| `GET` | `/docker/cis/categories` | Public. CIS check categories. |
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
| `GET` | `/api/v1/system` | Public. CPU/memory/disk/battery of the **backend host**, not of a monitored agent. Easy to confuse with agent-reported metrics if the two ever run on different machines. |

This router's decorators carry the full `/api/v1/...` path instead of using a shared
prefix, which is worth knowing when you search for where a route is defined.

## Auth (`auth_router.py`, prefix `/api/v1/auth`)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/register` | Public. Body: username, email, password. The password is hashed with PBKDF2-HMAC-SHA256 (260k iterations) before storage. Returns a session token. |
| `POST` | `/auth/login` | Public. Returns a session token. |
| `POST` | `/auth/logout` | Invalidates the session token sent in `X-User-Token`. |
| `GET` | `/auth/me` | Current user from `X-User-Token`; 401 if missing or expired. |

Session tokens are opaque random strings stored server-side in `users.db`. There is no
JWT. Read `user_auth.py` for the current lifetime behavior before relying on it.
