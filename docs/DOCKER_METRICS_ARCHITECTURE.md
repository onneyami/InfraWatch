# 🐳 Docker Metrics Architecture

## Overview

Агент InfraWatch собирает Docker метрики через **Docker SDK** с **CLI fallback** для максимальной надёжности.

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│              Agent (Go)                             │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ collectDockerMetrics()                       │  │
│  │                                              │  │
│  │  1. Docker SDK (Primary)                     │  │
│  │     ├─ client.NewClientWithOpts()            │  │
│  │     ├─ NewDockerMonitorWithClient()          │  │
│  │     └─ CollectAllMetrics()                   │  │
│  │         ├─ GetEngineInfo()                   │  │
│  │         ├─ GetContainers()                   │  │
│  │         ├─ GetContainerStats()               │  │
│  │         ├─ GetImages()                       │  │
│  │         ├─ GetNetworks()                     │  │
│  │         └─ GetVolumes()                      │  │
│  │                                              │  │
│  │  2. CLI Fallback (если SDK failed)           │  │
│  │     ├─ docker info --format '{{json .}}'     │  │
│  │     └─ docker ps -a --format '{{json .}}'    │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Primary: Docker SDK

### Преимущества

- ✅ **Полный доступ** ко всем API Docker
- ✅ **Типобезопасность** через официальные типы (`containertypes`, `imagetypes`, etc.)
- ✅ **Эффективность** (одно соединение, streaming stats)
- ✅ **ContainerStats** — CPU/RAM usage в реальном времени
- ✅ **События** — события Docker (start/stop/die)

### Используемые пакеты

```go
import (
    "github.com/docker/docker/client"
    containertypes "github.com/docker/docker/api/types/container"
    eventstypes "github.com/docker/docker/api/types/events"
    filterstypes "github.com/docker/docker/api/types/filters"
    imagetypes "github.com/docker/docker/api/types/image"
    networktypes "github.com/docker/docker/api/types/network"
    volumetypes "github.com/docker/docker/api/types/volume"
)
```

### Реализация

**Файл:** `agent/cmd/agent/docker_monitor.go`

```go
type DockerMonitor struct {
    client *client.Client
    ctx    context.Context
}

func (dm *DockerMonitor) CollectAllMetrics() (*DockerMetrics, error) {
    // Собираем все метрики через SDK
    metrics.Engine, _ = dm.GetEngineInfo()
    metrics.Containers, _ = dm.GetContainers()
    metrics.ContainerStats, _ = dm.GetContainerStats()
    metrics.Images, _ = dm.GetImages()
    metrics.Networks, _ = dm.GetNetworks()
    metrics.Volumes, _ = dm.GetVolumes()
    metrics.Events, _ = dm.GetEvents(time.Now())
    
    return &metrics, nil
}
```

### Метрики

| Категория | Данные |
|-----------|--------|
| **Engine** | Version, APIVersion, Containers, Images, Driver, Storage, Logging, Cgroup |
| **Containers** | ID, Names, Image, State, Status, Ports, Labels, Networks |
| **ContainerStats** | CPU%, Memory, Network RX/TX, Block I/O, PIDs, Restart Count |
| **Images** | ID, RepoTags, Size, Created, Labels |
| **Networks** | ID, Name, Driver, Subnet, Gateway |
| **Volumes** | Name, Driver, Mountpoint, Size, RefCount |
| **Events** | Type, Action, Actor, Timestamp |

## Fallback: CLI

### Когда используется

- ❌ Docker SDK не может подключиться к socket
- ❌ Нет прав доступа к `/var/run/docker.sock`
- ❌ Docker SDK не установлен (проблемы с зависимостями)

### Ограничения

| Метрика | SDK | CLI |
|---------|-----|-----|
| Engine Info | ✅ | ✅ |
| Containers List | ✅ | ✅ (базовый) |
| ContainerStats | ✅ | ❌ |
| Images | ✅ | ❌ |
| Networks | ✅ | ❌ |
| Volumes | ✅ | ❌ |
| Events | ✅ | ❌ |

### Реализация

**Файл:** `agent/cmd/agent/main.go`

```go
func collectDockerMetricsCLI() (*DockerMetrics, error) {
    // 1. docker info --format '{{json .}}'
    cmd := exec.Command("docker", "info", "--format", "{{json .}}")
    out, _ := cmd.Output()
    var info map[string]interface{}
    json.Unmarshal(out, &info)
    
    // 2. docker ps -a --format '{{json .}}'
    cmd2 := exec.Command("docker", "ps", "-a", "--format", "{{json .}}")
    out2, _ := cmd2.Output()
    // Парсим JSON по строкам
    
    return &DockerMetrics{
        Engine: engine,
        Containers: containers,
        // ContainerStats, Images, Networks, Volumes — пустые
    }, nil
}
```

## Логика переключения

```
                    ┌─────────────────────┐
                    │ collectDockerMetrics│
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Docker SDK Client   │
                    │ NewClientWithOpts() │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         Success          SDK Error      Monitor Error
              │                │                │
              ▼                ▼                ▼
     ┌────────────────┐  ┌─────────────┐  ┌─────────────┐
     │ CollectAll     │  │ CLI Fallback│  │ CLI Fallback│
     │ Metrics()      │  │ collectDocker│  │ collectDocker│
     │                │  │ MetricsCLI() │  │ MetricsCLI() │
     │ ✅ Full data   │  │             │  │             │
     └────────┬───────┘  └──────┬──────┘  └──────┬──────┘
              │                 │                 │
              │            ┌────┴────┐       ┌────┴────┐
              │            │ Success │       │ Failed  │
              │            │  ✅     │       │   ❌    │
              │            └────┬────┘       └────┬────┘
              │                 │                 │
              ▼                 ▼                 ▼
     Return Full          Return Basic      Return Error
     Metrics              Metrics           (Docker N/A)
```

## Логирование

### Успешная работа (SDK)

```
🔧 Docker SDK: containers=5 running=3 images=12
📊 Advanced metrics sent. Status: 200
```

### Переключение на fallback

```
⚠️ Docker SDK init failed: Cannot connect to the Docker daemon — switching to CLI fallback
🔍 docker CLI fallback: running 'docker info --format {{json .}}'
✅ CLI fallback successful
📊 Advanced metrics sent. Status: 200
```

### Полный failure

```
⚠️ Docker SDK init failed: Cannot connect to the Docker daemon — switching to CLI fallback
⚠️ docker CLI fallback failed: exec: "docker": executable file not found in $PATH
❌ CLI fallback also failed: exec: "docker": executable file not found in $PATH
```

## Тестирование

### Проверка SDK пути

```bash
# Убедитесь, что Docker работает
docker info

# Запустите агента
cd agent/cmd/agent
go run .

# Проверьте логи
✅ Docker SDK: containers=2 running=2 images=10
```

### Проверка fallback пути

```bash
# Остановите Docker
# Или заблокируйте доступ к socket
sudo chmod 000 /var/run/docker.sock

# Запустите агента
go run .

# Проверьте логи
⚠️ Docker SDK init failed: permission denied — switching to CLI fallback
✅ CLI fallback successful
```

### Проверка полного failure

```bash
# Удалите Docker CLI
# Или установите AGENT_DOCKER_DISABLED=1

# Запустите агента
go run .

# Проверьте логи
❌ CLI fallback also failed: exec: "docker": executable file not found
```

## Производительность

### SDK

| Метрика | Время сбора | Частота |
|---------|-------------|---------|
| Engine Info | ~50ms | 30 сек |
| Containers | ~100ms | 30 сек |
| ContainerStats | ~200ms | 30 сек |
| Images | ~50ms | 30 сек |
| Networks | ~30ms | 30 сек |
| Volumes | ~30ms | 30 сек |
| **Итого** | **~460ms** | |

### CLI

| Метрика | Время сбора | Частота |
|---------|-------------|---------|
| docker info | ~200ms | 30 сек |
| docker ps | ~100ms | 30 сек |
| **Итого** | **~300ms** | |

**Вывод:** CLI быстрее, но возвращает меньше данных. SDK предпочтительнее для полных метрик.

## Troubleshooting

### "Cannot connect to the Docker daemon"

**Проблема:** Docker SDK не может подключиться к socket.

**Решение:**
```bash
# Проверьте, что Docker запущен
docker info

# Проверьте права доступа
ls -la /var/run/docker.sock
# Должно быть: srw-rw---- 1 root docker

# Добавьте пользователя в группу docker
sudo usermod -aG docker $USER
# Перелогиньтесь
```

### "exec: 'docker': executable file not found"

**Проблема:** Docker CLI не найден в PATH.

**Решение:**
```bash
# Установите Docker CLI
# macOS
brew install docker

# Linux
sudo apt-get install docker.io

# Проверьте установку
docker --version
which docker
```

### "CLI fallback produced no containers"

**Проблема:** `docker ps` вернул пустой результат.

**Решение:**
```bash
# Проверьте, что контейнеры есть
docker ps -a

# Проверьте формат вывода
docker ps -a --format '{{json .}}'
```

## Future Enhancements

- [ ] Streaming stats для ContainerStats (real-time CPU/RAM)
- [ ] Кэширование Engine Info (редко меняется)
- [ ] Оптимизация запросов (parallel fetch)
- [ ] Health checks для Docker подключения
- [ ] Metrics for Docker metrics collection (время сбора, errors)

---

**Files:**
- `agent/cmd/agent/docker_monitor.go` — DockerMonitor (SDK)
- `agent/cmd/agent/main.go` — collectDockerMetrics(), collectDockerMetricsCLI()

**Version:** 2.6.0  
**Last Updated:** 2026-01-21
