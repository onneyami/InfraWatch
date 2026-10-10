# 🔑 Quick Start: Аутентификация

## Первый запуск

### 1. Запустите backend

```bash
cd backend/src
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend автоматически:
- ✅ Создаст SQLite БД `agents.db`
- ✅ Сгенерирует токены при регистрации агентов
- ✅ Включит CORS для localhost

### 2. Запустите агент

```bash
cd agent/cmd/agent
go run .
```

Агент автоматически:
- ✅ Зарегистрируется на backend
- ✅ Получит токен
- ✅ Сохранит токен в `/tmp/ahova_agent_token`
- ✅ Начнёт отправлять метрики с токеном

### 3. Проверьте работу

```bash
# Проверка токена в логах агента
✅ Agent registered: agent-myserver, token saved
📈 Basic metrics sent. CPU: 5.2%, Memory: 42.1%

# Проверка на backend
curl http://localhost:8000/api/v1/agents
```

## Проверка аутентификации

### ✅ С токеном (200 OK)

```bash
TOKEN=$(grep token= /tmp/ahova_agent_token | cut -d= -f2)
AGENT_ID=$(grep agent_id= /tmp/ahova_agent_token | cut -d= -f2)

curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -H "X-Agent-ID: $AGENT_ID" \
  -H "X-Agent-Token: $TOKEN" \
  -d '{"agent_id": "'$AGENT_ID'", "timestamp": '$(date +%s)', "cpu": {"usage": 5.0}, "memory": {"used_percent": 50.0}, "system": {"hostname": "test", "os": "test", "platform": "test", "kernel_version": "test", "uptime": 100, "boot_time": 100, "num_goroutine": 1, "num_cpu": 1}}'
```

### ❌ Без токена (401 Unauthorized)

```bash
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "test", "timestamp": 1234567890}'

# Ответ:
# {"detail": "Missing authentication headers. Required: X-Agent-ID, X-Agent-Token"}
```

## Переменные окружения

### CORS

```bash
# Development (по умолчанию)
export ENVIRONMENT=dev

# Production
export ENVIRONMENT=prod
export ALLOWED_ORIGINS="https://app.ahova.com"
```

### Backend port

```bash
export BACKEND_PORT=9000
python3 -m uvicorn main:app --port $BACKEND_PORT
```

## Troubleshooting

### Ошибка: "Authentication failed"

```bash
# 1. Проверьте файл токена
cat /tmp/ahova_agent_token

# 2. Если файл пустой или старый - удалите
rm /tmp/ahova_agent_token

# 3. Перезапустите агента
go run .
```

### Ошибка: "Database locked"

```bash
# SQLite БД заблокирована - убейте процессы backend
pkill -f "uvicorn main:app"

# Удалите БД (токены будут перевыпущены)
rm backend/src/agents.db

# Перезапустите backend
```

### Ошибка: "Rate limit exceeded"

```bash
# Уменьшите частоту отправки метрик
export AGENT_INTERVAL=10  # 10 секунд вместо 5

# Или очистите таблицу rate limits
sqlite3 backend/src/agents.db "DELETE FROM rate_limits;"
```

## Проверка токенов в БД

```bash
# Посмотреть всех агентов
sqlite3 backend/src/agents.db "SELECT agent_id, hostname, created_at, last_seen FROM agents;"

# Проверить токен конкретного агента
sqlite3 backend/src/agents.db "SELECT agent_id, token_plain FROM agents WHERE agent_id='agent-myserver';"

# Деактивировать агента
sqlite3 backend/src/agents.db "UPDATE agents SET is_active=0 WHERE agent_id='agent-myserver';"
```

---

**Документация:** [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md)
