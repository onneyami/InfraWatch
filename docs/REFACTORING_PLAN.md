# 📐 Backend Refactoring Plan

## Current State

**File:** `backend/src/main.py`  
**Size:** ~1855 lines  
**Endpoints:** ~35

### Problems

- ❌ Монолитный файл (1855 строк)
- ❌ Дублирование endpoint'ов (`/docker/metrics`, `/docker/simple`, `/docker/debug`, `/docker/test`, `/docker/fixed`, `/docker/info`)
- ❌ Нет разделения по доменам
- ❌ Сложно тестировать
- ❌ Сложно поддерживать

## Target Architecture

### Router Structure

```
backend/src/
├── main.py (150 строк)
│   ├── App initialization
│   ├── Middleware setup
│   └── Router includes
│
├── routers/
│   ├── __init__.py
│   ├── metrics_router.py      # /api/v1/metrics, /api/v1/agents
│   ├── docker_router.py       # /api/v1/docker/*
│   ├── process_router.py      # /api/v1/process/*
│   ├── security_router.py     # /api/v1/docker/cis/*, /api/v1/docker/image/*
│   └── system_router.py       # /api/v1/system, /api/v1/health
│
├── auth.py                    # Аутентификация
├── middleware.py              # Middleware
├── models.py                  # Pydantic models (вынести из main.py)
└── stores.py                  # In-memory хранилища (metrics_history, etc.)
```

## Router Breakdown

### 1. Metrics Router (`routers/metrics_router.py`)

**Endpoints:**
- `POST /api/v1/metrics` - приём метрик
- `GET /api/v1/metrics/latest` - последние метрики
- `GET /api/v1/metrics/history` - история метрик
- `GET /api/v1/metrics/summary` - сводка

**Dependencies:**
- `metrics_history` (shared state)
- `process_history` (shared state)

**Size:** ~200 lines

### 2. Agents Router (`routers/agents_router.py`)

**Endpoints:**
- `GET /api/v1/agents` - список агентов
- `POST /api/v1/agents/register` - регистрация (с токеном)

**Dependencies:**
- `agents_registry` (shared state)
- `agent_last_seen` (shared state)
- `auth_db` (SQLite)

**Size:** ~100 lines

### 3. Docker Router (`routers/docker_router.py`)

**Endpoints:**
- `GET /api/v1/docker/metrics` - полные метрики
- `GET /api/v1/docker/container/{id}/logs` - логи контейнера
- `GET /api/v1/docker/container/{id}/logs/stream` - streaming logs
- `POST /api/v1/docker/container/{id}/start` - старт
- `POST /api/v1/docker/container/{id}/stop` - стоп
- `POST /api/v1/docker/container/{id}/restart` - рестарт
- `DELETE /api/v1/docker/image/{id}` - удаление образа
- `DELETE /api/v1/docker/volume/{id}` - удаление тома
- `DELETE /api/v1/docker/network/{id}` - удаление сети

**Remove (debug/test endpoints):**
- ❌ `GET /api/v1/docker/simple`
- ❌ `GET /api/v1/docker/debug`
- ❌ `GET /api/v1/docker/test`
- ❌ `GET /api/v1/docker/fixed`
- ❌ `GET /api/v1/docker/info`

**Dependencies:**
- `docker_client` (global)
- `SimpleDockerMetrics`

**Size:** ~400 lines

### 4. Process Router (`routers/process_router.py`)

**Endpoints:**
- `GET /api/v1/process/{pid}` - детали процесса
- `GET /api/v1/process/{pid}/tree` - дерево процессов
- `POST /api/v1/process/{pid}/stop` - остановить
- `POST /api/v1/process/{pid}/priority` - изменить приоритет
- `GET /api/v1/process/{pid}/history` - история ресурсов

**Dependencies:**
- `process_history` (shared state)
- `psutil`

**Size:** ~250 lines

### 5. Security Router (`routers/security_router.py`)

**Endpoints:**
- `GET /api/v1/docker/cis/scan` - CIS benchmark
- `GET /api/v1/docker/cis/categories` - CIS категории
- `GET /api/v1/docker/image/{id}/vulnerabilities` - Trivy scan
- `GET /api/v1/docker/images` - список образов
- `POST /api/v1/docker/image/scan` - scan by name
- `POST /api/v1/docker/image/secrets-scan` - secrets scan

**Dependencies:**
- `trivy_scanner`
- `run_cis_scan`

**Size:** ~200 lines

### 6. System Router (`routers/system_router.py`)

**Endpoints:**
- `GET /api/v1/health` - health check
- `GET /api/v1/system` - системная информация
- `GET /` - root

**Dependencies:**
- `psutil`
- `platform`
- `socket`

**Size:** ~150 lines

## Shared State

**File:** `backend/src/stores.py`

```python
from typing import Dict, List, Any
from collections import defaultdict

# Metrics storage
metrics_history: Dict[str, List[Dict]] = defaultdict(list)
MAX_HISTORY = 1000

# Agents storage
agents_registry: Dict[str, Dict] = {}
agent_last_seen: Dict[str, float] = {}

# Process history
process_history: Dict[int, List[Dict]] = defaultdict(list)

# System network counters
system_net_prev = {
    "ts": 0,
    "bytes_sent": 0,
    "bytes_recv": 0,
}
```

## Pydantic Models

**File:** `backend/src/models.py`

Вынести все модели из `main.py`:
- `SystemInfo`
- `CPUMetrics`
- `MemoryMetrics`
- `DiskMetrics`
- `NetworkMetrics`
- `ProcessMetrics`
- `DockerMetrics`
- `ContainerDetail`
- `ContainerStats`
- `ExtendedDockerMetrics`
- ... и т.д.

**Size:** ~400 lines

## Updated main.py

**Target size:** ~150 lines

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .middleware import verify_agent_middleware, get_allowed_origins, limiter
from .routers import metrics, agents, docker, processes, security, system

app = FastAPI(...)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware
app.middleware("http")(verify_agent_middleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(metrics.router)
app.include_router(agents.router)
app.include_router(docker.router)
app.include_router(processes.router)
app.include_router(security.router)
app.include_router(system.router)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_old_metrics())
    print("InfraWatch API started")

@app.get("/")
async def root():
    return {"message": "Welcome to InfraWatch API"}
```

## Migration Steps

### Phase 1: Preparation (1-2 hours)

1. ✅ Создать `stores.py` - вынести shared state
2. ✅ Создать `models.py` - вынести Pydantic models
3. ✅ Создать структуру `routers/`

### Phase 2: Create Routers (4-6 hours)

1. ⏳ `metrics_router.py` - перенести endpoints
2. ⏳ `agents_router.py` - перенести endpoints
3. ⏳ `docker_router.py` - перенести + удалить debug
4. ⏳ `process_router.py` - перенести endpoints
5. ⏳ `security_router.py` - перенести endpoints
6. ⏳ `system_router.py` - перенести endpoints

### Phase 3: Update main.py (1 hour)

1. ⏳ Удалить перенесённый код
2. ⏳ Добавить импорты routers
3. ⏳ Подключить routers через `include_router`
4. ⏳ Оставить только initialization code

### Phase 4: Testing (2-3 hours)

1. ⏳ Запустить backend
2. ⏳ Проверить все endpoints через `/docs`
3. ⏳ Проверить agent connection
4. ⏳ Проверить frontend integration

### Phase 5: Cleanup (30 min)

1. ⏳ Удалить unused imports
2. ⏳ Запустить linter (flake8, black)
3. ⏳ Обновить документацию

## Benefits

### Before

| Metric | Value |
|--------|-------|
| **Lines of code** | 1855 |
| **Files** | 1 |
| **Cyclomatic complexity** | High |
| **Testability** | Poor |
| **Maintainability** | Poor |

### After

| Metric | Value |
|--------|-------|
| **Lines of code (main.py)** | ~150 |
| **Files** | 10+ |
| **Cyclomatic complexity** | Low (per file) |
| **Testability** | Good |
| **Maintainability** | Good |

## Debug Endpoints Removal

**Remove these endpoints:**

1. `GET /api/v1/docker/simple` - дублирует `/metrics`
2. `GET /api/v1/docker/debug` - отладка, не нужна в prod
3. `GET /api/v1/docker/test` - тестовый endpoint
4. `GET /api/v1/docker/fixed` - временный fix
5. `GET /api/v1/docker/info` - упрощённая проверка

**Why:**
- Не используются фронтендом
- Дублируют функциональность
- Создают confusion
- Security risk (expose debug info)

## API Documentation

После рефакторинга:
- `/docs` - автоматически сгенерированная Swagger документация
- Каждый router будет иметь свой tag
- Чёткая группировка endpoints по доменам

## Rollback Plan

Если что-то пойдёт не так:

```bash
# 1. Вернуть старый main.py из git
git checkout HEAD -- backend/src/main.py

# 2. Удалить новые файлы
rm -rf backend/src/routers/
rm backend/src/stores.py
rm backend/src/models.py

# 3. Перезапустить backend
```

## Next Steps

1. [ ] Реализовать Phase 1-2 (создать routers)
2. [ ] Реализовать Phase 3 (обновить main.py)
3. [ ] Реализовать Phase 4 (тестирование)
4. [ ] Реализовать Phase 5 (cleanup)
5. [ ] Update documentation
6. [ ] Code review

---

**Status:** Planning complete, implementation pending  
**Priority:** High (technical debt)  
**Estimated Time:** 8-12 hours
