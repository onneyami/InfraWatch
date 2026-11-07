# 🔐 Аутентификация и авторизация InfraWatch

## Overview

Начиная с версии 2.6, InfraWatch использует токенную аутентификацию для защиты API endpoints.

## Архитектура

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Agent     │ ───► │   Backend    │ ◄──► │   SQLite    │
│  (Go)       │      │   (FastAPI)  │      │   (Tokens)  │
└─────────────┘      └──────────────┘      └─────────────┘
     │                      │
     │ 1. POST /register    │
     │ ◄─────────────────   │
     │    token: "abc123"   │
     │                      │
     │ 2. POST /metrics     │
     │    X-Agent-ID        │
     │    X-Agent-Token     │
     │───────────────────►  │
     │                      │
     │ 3. Verify token      │
     │    Check SQLite      │
     │───────────────────►  │
     │    200 OK / 401      │
     │ ◄─────────────────   │
```

## Безопасность

### Что защищено:
- ✅ `POST /api/v1/metrics` - приём метрик
- ✅ `POST /api/v1/agents/register` - регистрация агентов
- ✅ `GET /api/v1/docker/*` - Docker endpoints
- ✅ `POST /api/v1/docker/container/{id}/*` - управление контейнерами
- ✅ `DELETE /api/v1/docker/*` - удаление Docker ресурсов
- ✅ `GET /api/v1/process/*` - информация о процессах
- ✅ `POST /api/v1/process/{pid}/stop` - управление процессами

### Что открыто:
- `GET /api/v1/health` - health check
- `GET /api/v1/agents` - список агентов (можно защитить в будущем)
- `GET /` - root endpoint
- `GET /docs` - API documentation

## Регистрация агента

### 1. Первый запуск

Агент автоматически регистрируется при первом запуске:

```bash
cd agent/cmd/agent
go run .
```

**Ответ сервера:**
```json
{
  "status": "registered",
  "agent_id": "agent-myserver",
  "token": "a1b2c3d4e5f6...",
  "message": "Agent registered successfully. Save your token!",
  "warning": "Store this token securely. It will not be shown again."
}
```

### 2. Сохранение токена

Токен автоматически сохраняется в файле `/tmp/infrawatch_agent_token`:

```
agent_id=agent-myserver
token=a1b2c3d4e5f6...
```

**Важно:** Файл имеет права `0600` (только владелец).

### 3. Повторная регистрация

Если агент уже зарегистрирован:

```json
{
  "status": "already_registered",
  "agent_id": "agent-myserver",
  "message": "Agent already registered. Use the token from initial registration.",
  "info": {...}
}
```

Агент загрузит токен из файла и продолжит работу.

## Использование токена

### Формат запроса

Все запросы от агента включают заголовки:

```http
POST /api/v1/metrics HTTP/1.1
Host: backend.infrawatch.local
Content-Type: application/json
X-Agent-ID: agent-myserver
X-Agent-Token: a1b2c3d4e5f6...

{
  "agent_id": "agent-myserver",
  "timestamp": 1234567890,
  "cpu": {...}
}
```

### Проверка токена

Backend проверяет токен через SQLite:

1. Хэширует полученный токен (SHA-256)
2. Ищет в БД пару `(agent_id, token_hash)`
3. Проверяет флаг `is_active`
4. Обновляет `last_seen` при успешной проверке

### Ошибки аутентификации

**401 Unauthorized:**
```json
{
  "detail": "Missing authentication headers. Required: X-Agent-ID, X-Agent-Token"
}
```

```json
{
  "detail": "Invalid agent token or agent_id"
}
```

**429 Too Many Requests:**
```json
{
  "detail": "Rate limit exceeded. Maximum 60 requests per minute."
}
```

## Rate Limiting

### Лимиты

- **60 запросов в минуту** на один endpoint для одного агента
- **Скользящее окно** в 60 секунд
- **Персонально** для каждого `(agent_id, endpoint)`

### Реализация

Rate limiting реализуется через:
1. SQLite таблицу `rate_limits`
2. Middleware проверку перед обработкой запроса
3. Автоматическую очистку старых записей (> 60 сек)

## CORS

### Настройка

CORS настраивается через переменные окружения:

```bash
# Вариант 1: Явный список доменов
export ALLOWED_ORIGINS="https://app.infrawatch.com,https://staging.infrawatch.com"

# Вариант 2: Предустановленная конфигурация
export ENVIRONMENT=dev      # localhost:3000, localhost:5173, ...
export ENVIRONMENT=staging  # https://staging.infrawatch.example.com
export ENVIRONMENT=prod     # https://infrawatch.example.com
```

### Значения по умолчанию

**Development:**
```
http://localhost:3000
http://localhost:5173
http://localhost:5174
http://localhost:5176
```

**Production:**
```
https://infrawatch.example.com
https://app.infrawatch.example.com
```

## Хранение токенов

### SQLite Schema

```sql
CREATE TABLE agents (
    agent_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,      -- SHA-256 хэш токена
    token_plain TEXT NOT NULL,     -- Plain-текст (возвращается 1 раз)
    hostname TEXT,
    ip_address TEXT,
    version TEXT,
    tags TEXT,                     -- JSON массив
    created_at TIMESTAMP,
    last_seen TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

CREATE TABLE rate_limits (
    agent_id TEXT,
    endpoint TEXT,
    timestamp REAL,
    PRIMARY KEY (agent_id, endpoint, timestamp)
);
```

### Файл БД

- **Путь:** `backend/src/agents.db`
- **Переживает рестарт** бэкенда
- **Создаётся автоматически** при первом запуске

## Отмена токена

### Деактивация агента

```python
from backend.src.auth import auth_db

# Отозвать токен
auth_db.deactivate_agent("agent-myserver")
```

После этого все запросы с этим токеном будут возвращать `401`.

### Перевыпуск токена

Для перевыпуска токена нужно:
1. Деактивировать старого агента
2. Удалить запись из БД
3. Зарегистрировать агента заново

```sql
DELETE FROM agents WHERE agent_id = 'agent-myserver';
```

## Миграция со старой версии

### Версии < 2.6 (без аутентификации)

1. **Обновите backend** - агенты продолжат работать без токена (режим обратной совместимости)
2. **Перезапустите агентов** - они автоматически зарегистрируются и получат токены
3. **Проверьте логи** - убедитесь, что токены сохранены

### Если что-то пошло не так

**Агент не может отправить метрики:**
```
❌ Authentication failed. Check token. Status: 401
```

**Решение:**
1. Очистите файл токена: `rm /tmp/infrawatch_agent_token`
2. Перезапустите агента
3. Проверьте, что агент зарегистрировался и получил новый токен

## Testing

### Ручная проверка

```bash
# 1. Зарегистрировать агента
curl -X POST http://localhost:8000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "test-agent", "hostname": "test"}'

# 2. Сохранить токен
TOKEN="a1b2c3d4..."

# 3. Отправить метрики с токеном
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -H "X-Agent-ID: test-agent" \
  -H "X-Agent-Token: $TOKEN" \
  -d '{"agent_id": "test-agent", "timestamp": 1234567890, ...}'

# 4. Попробовать без токена (должно вернуть 401)
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "test-agent", ...}'
```

### Автоматические тесты

```python
import pytest
from backend.src.auth import create_agent_token, verify_agent_token

def test_token_creation():
    token = create_agent_token("test-agent", "test-host")
    assert token is not None
    assert len(token) == 64  # 32 bytes hex

def test_token_verification():
    token = create_agent_token("test-agent", "test-host")
    assert verify_agent_token("test-agent", token) is True
    assert verify_agent_token("test-agent", "wrong-token") is False
```

## Security Best Practices

### Для разработчиков

1. **Никогда не коммитьте токены** в git
2. **Используйте HTTPS** в production
3. **Регулярно обновляйте токены** (раз в 90 дней)
4. **Мониторьте suspicious activity** в логах

### Для операторов

1. **Ограничьте доступ** к файлу токена (`0600`)
2. **Используйте firewall** для ограничения доступа к API
3. **Настройте alerts** на 401 ошибки
4. **Регулярно аудируйте** активных агентов

## Troubleshooting

### Агент не регистрируется

**Симптомы:**
```
Warning: Could not register agent: Connection refused
```

**Решение:**
1. Проверьте, что backend запущен
2. Проверьте `BACKEND_URL` в конфиге агента
3. Проверьте firewall/сеть

### Токен не принимается

**Симптомы:**
```
❌ Authentication failed. Check token. Status: 401
```

**Решение:**
1. Проверьте файл токена: `cat /tmp/infrawatch_agent_token`
2. Удалите файл и перезапустите агента
3. Проверьте, что `agent_id` совпадает

### Rate limit exceeded

**Симптомы:**
```
Rate limit exceeded. Maximum 60 requests per minute.
```

**Решение:**
1. Увеличьте интервал сбора метрик в конфиге агента
2. Проверьте, нет ли дублирования агентов
3. Очистите таблицу `rate_limits` если нужно

## Future Enhancements

- [ ] JWT tokens для user authentication
- [ ] OAuth2 integration
- [ ] RBAC (Role-Based Access Control)
- [ ] Audit logging
- [ ] Token rotation API
- [ ] Multi-tenant support

---

**Version:** 2.6.0  
**Last Updated:** 2026-01-21
