# 🛡️ InfraWatch v0.1

Минимальная рабочая версия платформы мониторинга.

## 🚀 Быстрый старт

```bash
# 1. Запуск всех сервисов
docker-compose up -d

# 2. Открыть в браузере
#    Frontend: http://localhost:3000
#    Backend:  http://localhost:8000
#    API Docs: http://localhost:8000/docs

# 3. Запустить агент (в отдельном терминале)
cd agent
go run cmd/agent/main.go

- **Light UI**: a trimmed‑down version of the dashboard lives in `light.html` and is bootstrapped by `src/main.light.tsx`. To launch the light frontend on a separate port use the helper script:

```bash
cd frontend
npm run dev:light   # opens http://localhost:5176/light.html automatically
```

You can still visit `/light.html` manually in any running dev server instance if you just want to preview the light skin without a second process.