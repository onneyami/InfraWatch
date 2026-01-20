from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import psutil
import socket
import asyncio
import time
import json
from collections import defaultdict
import statistics
import docker
import subprocess
from .health_check import router as health_router
from .docker_simple import SimpleDockerMetrics
from .trivy_scanner import trivy_scanner, TrivyScanner

app = FastAPI(
    title="InfraWatch API v2.5",
    description="Advanced Infrastructure Monitoring System",
    version="2.5.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.include_router(health_router)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Временно для разработки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализируем Docker клиент
try:
    docker_client = docker.from_env()
    DOCKER_AVAILABLE = True
    print("✅ Docker client initialized successfully")
except Exception as e:
    docker_client = None
    DOCKER_AVAILABLE = False
    print(f"⚠️ Docker client initialization failed: {e}")

# Модели данных для расширенных метрик
class SystemInfo(BaseModel):
    hostname: str
    os: str
    platform: str
    kernel_version: str
    uptime: int
    boot_time: int
    num_goroutine: int
    num_cpu: int

class CPUMetrics(BaseModel):
    usage: float
    per_core: Optional[List[float]] = None
    frequency: Optional[float] = None
    load_avg: Optional[Dict[str, float]] = None
    cpu_times: Optional[List[Dict[str, Any]]] = None

class MemoryMetrics(BaseModel):
    total: int
    available: int
    used: int
    used_percent: float
    free: int
    active: Optional[int] = None
    inactive: Optional[int] = None
    buffers: Optional[int] = None
    cached: Optional[int] = None
    shared: Optional[int] = None

class DiskMetrics(BaseModel):
    device: str
    mountpoint: str
    fstype: str
    total: int
    free: int
    used: int
    used_percent: float
    inodes_total: Optional[int] = None
    inodes_used: Optional[int] = None
    inodes_free: Optional[int] = None
    io_stats: Optional[Dict[str, int]] = None

class NetworkInterface(BaseModel):
    name: str
    bytes_sent: int
    bytes_recv: int
    packets_sent: int
    packets_recv: int
    err_in: int
    err_out: int
    drop_in: int
    drop_out: int
    fifo_in: int
    fifo_out: int
    mtu: Optional[int] = None
    flags: Optional[List[str]] = None

class NetworkMetrics(BaseModel):
    interfaces: List[NetworkInterface]
    connections: Optional[List[Dict[str, Any]]] = None
    proto_counters: Optional[List[Dict[str, Any]]] = None

class TemperatureSensor(BaseModel):
    sensor_key: str
    temperature: float
    high: Optional[float] = None
    critical: Optional[float] = None

class ProcessMetrics(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float
    memory_rss: int
    memory_vms: int
    status: str
    create_time: int
    num_threads: int
    num_fds: Optional[int] = None
    username: Optional[str] = None
    command_line: Optional[str] = None

class DockerMetrics(BaseModel):
    containers_running: int
    containers_stopped: int
    containers_paused: int
    containers_total: int
    images: int

class AgentMetrics(BaseModel):
    agent_id: str
    timestamp: int
    system: SystemInfo
    cpu: CPUMetrics
    memory: MemoryMetrics
    disks: Optional[List[DiskMetrics]] = None
    network: Optional[NetworkMetrics] = None
    temperatures: Optional[List[TemperatureSensor]] = None
    processes: Optional[List[ProcessMetrics]] = None
    docker: Optional[DockerMetrics] = None

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    hostname: str
    timestamp: datetime
    system: Dict[str, Any]
    agents: Optional[List[Dict[str, Any]]] = None
    metrics_summary: Optional[Dict[str, Any]] = None

# Добавляем новые модели Pydantic
class ContainerDetail(BaseModel):
    id: str
    names: List[str]
    image: str
    image_id: str
    command: str
    created: int
    state: str
    status: str
    ports: Optional[List[Dict[str, Any]]] = None
    labels: Optional[Dict[str, str]] = None
    network_settings: Optional[Dict[str, Any]] = None

class ContainerStats(BaseModel):
    id: str
    name: str
    cpu_percent: float
    memory_usage: int
    memory_limit: int
    memory_percent: float
    network_rx: int
    network_tx: int
    block_read: int
    block_write: int
    pids: int
    restart_count: int
    uptime: int

class DockerEngineInfo(BaseModel):
    version: str
    api_version: str
    arch: str
    os_type: str
    kernel_version: str
    containers: int
    containers_running: int
    containers_paused: int
    containers_stopped: int
    images: int
    driver: str
    storage_driver: str
    logging_driver: str
    cgroup_driver: str
    n_events_listener: int
    n_fd: int
    n_goroutines: int
    mem_total: int
    n_cpu: int
    operating_system: str
    labels: Optional[List[str]] = None
    server_version: str
    cluster_store: Optional[str] = None
    cluster_advertise: Optional[str] = None
    default_runtime: str
    live_restore_enabled: bool
    isolation: Optional[str] = None
    init_binary: str
    product_license: Optional[str] = None
    warnings: Optional[List[str]] = None

class ImageInfo(BaseModel):
    id: str
    repo_tags: List[str]
    repo_digests: List[str]
    parent_id: Optional[str] = None
    created: int
    size: int
    content_size: Optional[int] = None
    disk_usage: Optional[int] = None
    shared_size: int
    virtual_size: int
    labels: Optional[Dict[str, str]] = None
    containers: int

class NetworkInfo(BaseModel):
    id: str
    name: str
    created: str
    scope: str
    driver: str
    enable_ipv6: bool
    ipam: Dict[str, Any]
    internal: bool
    attachable: bool
    ingress: bool
    config_from: Optional[Dict[str, str]] = None
    config_only: bool
    containers: Dict[str, Any]
    options: Optional[Dict[str, str]] = None
    labels: Optional[Dict[str, str]] = None

class VolumeInfo(BaseModel):
    name: str
    driver: str
    mountpoint: str
    created_at: str
    status: Optional[Dict[str, str]] = None
    labels: Optional[Dict[str, str]] = None
    scope: str
    options: Optional[Dict[str, str]] = None
    usage_data: Optional[Dict[str, Any]] = None

class DockerEvent(BaseModel):
    type: str
    action: str
    actor: Dict[str, Any]
    time: int
    time_nano: int

# Обновляем DockerMetrics
class ExtendedDockerMetrics(BaseModel):
    engine: DockerEngineInfo
    containers: List[ContainerDetail]
    container_stats: List[ContainerStats]
    images: List[ImageInfo]
    networks: List[NetworkInfo]
    volumes: List[VolumeInfo]
    events: Optional[List[DockerEvent]] = None

# Хранилище данных
metrics_history = defaultdict(list)
agents_registry = {}
agent_last_seen = {}

# Предыдущее состояние системных сетевых счётчиков для расчёта скорости (bytes/sec)
system_net_prev = {
    "ts": time.time(),
    "bytes_sent": 0,
    "bytes_recv": 0,
}

# Конфигурация
MAX_HISTORY = 1000  # Максимальное количество записей в истории
CLEANUP_INTERVAL = 300  # Очистка старых данных каждые 5 минут

async def cleanup_old_metrics():
    """Очистка старых метрик"""
    while True:
        try:
            current_time = time.time()
            cutoff_time = current_time - 3600  # 1 час
            
            for agent_id in list(metrics_history.keys()):
                # Очищаем старые записи
                metrics_history[agent_id] = [
                    m for m in metrics_history[agent_id]
                    if m.get('timestamp', 0) > cutoff_time
                ]
                
                # Удаляем пустые списки
                if not metrics_history[agent_id]:
                    del metrics_history[agent_id]
            
            # Очищаем неактивных агентов
            for agent_id in list(agent_last_seen.keys()):
                if agent_last_seen[agent_id] < cutoff_time:
                    del agents_registry[agent_id]
                    del agent_last_seen[agent_id]
                    
        except Exception as e:
            print(f"Error during cleanup: {e}")
        
        await asyncio.sleep(CLEANUP_INTERVAL)

@app.on_event("startup")
async def startup_event():
    """Запуск фоновых задач при старте"""
    asyncio.create_task(cleanup_old_metrics())
    print("InfraWatch API v2.5 started")
    print(f"API Documentation: http://localhost:8000/docs")

@app.get("/", tags=["Root"])
async def root():
    """Корневой эндпоинт"""
    return {
        "message": "Welcome to InfraWatch API v2.5",
        "version": "2.5.0",
        "endpoints": {
            "health": "/api/v1/health",
            "metrics": "/api/v1/metrics",
            "agents": "/api/v1/agents",
            "history": "/api/v1/metrics/history",
            "system": "/api/v1/system",
            "docker": "/api/v1/docker/metrics"
        }
    }

@app.post("/api/v1/metrics", tags=["Metrics"])
async def receive_metrics(request: Request):
    """Прием метрик от агента (с логированием тела для отладки)"""
    try:
        body_bytes = await request.body()
        body_text = body_bytes.decode('utf-8', errors='replace')
        print("[DEBUG] /api/v1/metrics raw body:", body_text)

        try:
            payload = json.loads(body_text) if body_text else {}
            metrics = AgentMetrics.model_validate(payload)
        except Exception as e:
            print(f"[DEBUG] Failed to parse AgentMetrics: {e}")
            raise HTTPException(status_code=422, detail=f"Invalid metrics payload: {e}")

        agent_id = metrics.agent_id
        
        # Обновляем время последней активности
        agent_last_seen[agent_id] = time.time()
        
        # Сохраняем метрики в истории
        metrics_dict = metrics.dict()
        metrics_dict['received_at'] = datetime.now().isoformat()
        
        if agent_id not in metrics_history:
            metrics_history[agent_id] = []
        
        metrics_history[agent_id].append(metrics_dict)
        
        # Ограничиваем историю
        if len(metrics_history[agent_id]) > MAX_HISTORY:
            metrics_history[agent_id] = metrics_history[agent_id][-MAX_HISTORY:]
        
        # Логируем получение метрик
        print(f"📊 Received metrics from {agent_id}: "
              f"CPU={metrics.cpu.usage:.1f}%, "
              f"Memory={metrics.memory.used_percent:.1f}%, "
              f"Disks={len(metrics.disks or [])}, "
              f"Processes={len(metrics.processes or [])}")
        
        return {
            "status": "received",
            "agent_id": agent_id,
            "timestamp": datetime.now().isoformat(),
            "metrics_received": {
                "cpu": True,
                "memory": True,
                "disks": len(metrics.disks or []),
                "network": metrics.network is not None,
                "processes": len(metrics.processes or []),
                "docker": metrics.docker is not None
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing metrics: {str(e)}")

@app.get("/api/v1/metrics/latest", tags=["Metrics"])
async def get_latest_metrics(agent_id: Optional[str] = None):
    """Получение последних метрик"""
    if not metrics_history:
        return {"message": "No metrics available"}
    
    if agent_id:
        if agent_id in metrics_history and metrics_history[agent_id]:
            return metrics_history[agent_id][-1]
        return {"error": "Agent not found or no metrics"}
    
    # Возвращаем последние метрики всех агентов
    latest = {}
    for aid, metrics_list in metrics_history.items():
        if metrics_list:
            latest[aid] = metrics_list[-1]
    return latest

@app.get("/api/v1/metrics/history", tags=["Metrics"])
async def get_metrics_history(
    agent_id: str,
    metric_type: str = "cpu.usage",
    limit: int = 100,
    timeframe: int = 3600
):
    """Получение истории метрик"""
    if agent_id not in metrics_history:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Фильтрация по времени
    cutoff_time = time.time() - timeframe
    history = [
        m for m in metrics_history[agent_id]
        if m.get('timestamp', 0) > cutoff_time
    ][-limit:]
    
    # Извлечение конкретной метрики
    data_points = []
    for entry in history:
        timestamp = entry.get('timestamp')
        value = None
        
        # Извлекаем значение по пути metric_type
        keys = metric_type.split('.')
        current = entry
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                current = None
                break
        
        if current is not None and timestamp is not None:
            data_points.append({
                "timestamp": timestamp,
                "value": current,
                "time": datetime.fromtimestamp(timestamp).isoformat()
            })
    
    return {
        "agent_id": agent_id,
        "metric_type": metric_type,
        "data_points": data_points,
        "count": len(data_points),
        "timeframe": timeframe,
        "statistics": {
            "min": min([dp['value'] for dp in data_points]) if data_points else None,
            "max": max([dp['value'] for dp in data_points]) if data_points else None,
            "avg": statistics.mean([dp['value'] for dp in data_points]) if data_points else None,
            "last": data_points[-1]['value'] if data_points else None
        }
    }

@app.get("/api/v1/health", response_model=HealthResponse, tags=["Monitoring"])
async def health_check():
    """Получение полного статуса системы"""
    try:
        # Системные метрики хоста
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Собираем статистику по агентам
        active_agents = []
        for agent_id, last_seen in agent_last_seen.items():
            if time.time() - last_seen < 60:  # Активен в последние 60 секунд
                agent_info = agents_registry.get(agent_id, {})
                active_agents.append({
                    "id": agent_id,
                    "last_seen": last_seen,
                    "status": "active",
                    "hostname": agent_info.get("hostname", "unknown"),
                    "features": agent_info.get("features", {})
                })
        
        # Сводка по метрикам
        metrics_summary = {}
        for agent_id in metrics_history:
            if metrics_history[agent_id]:
                latest = metrics_history[agent_id][-1]
                metrics_summary[agent_id] = {
                    "cpu": latest.get('cpu', {}).get('usage'),
                    "memory": latest.get('memory', {}).get('used_percent'),
                    "disks": len(latest.get('disks', [])),
                    "timestamp": latest.get('timestamp')
                }
        
        # Получаем кумулятивные счётчики сети (общее количество передано/получено с момента включения)
        try:
            current_net = psutil.net_io_counters()
            # Используем общие кумулятивные значения (количество данных за всё время работы системы)
            total_sent = current_net.bytes_sent
            total_recv = current_net.bytes_recv
        except Exception:
            total_sent = 0
            total_recv = 0

        return HealthResponse(
            status="healthy",
            service="InfraWatch API v2.5",
            version="2.5.0",
            hostname=socket.gethostname(),
            timestamp=datetime.now(),
            system={
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "memory_total": memory.total,
                "memory_used": memory.used,
                "disk_total": disk.total,
                "disk_used": disk.used,
                "disk_percent": disk.percent,
                # Возвращаем кумулятивные данные (общее количество Upload/Download за всё время)
                "network_sent": total_sent,
                "network_recv": total_recv,
            },
            agents=active_agents,
            metrics_summary=metrics_summary
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error collecting system metrics: {str(e)}")

@app.get("/api/v1/agents", tags=["Agents"])
async def list_agents(status: Optional[str] = None):
    """Список всех агентов"""
    agents = []
    for agent_id, last_seen in agent_last_seen.items():
        agent_status = "active" if time.time() - last_seen < 60 else "inactive"
        
        if status and agent_status != status:
            continue
        
        agent_info = agents_registry.get(agent_id, {})
        agents.append({
            "id": agent_id,
            "status": agent_status,
            "last_seen": last_seen,
            "last_seen_human": datetime.fromtimestamp(last_seen).isoformat(),
            "hostname": agent_info.get("hostname", "unknown"),
            "version": agent_info.get("version", "unknown"),
            "features": agent_info.get("features", {}),
            "metrics_count": len(metrics_history.get(agent_id, []))
        })
    
    return {
        "count": len(agents),
        "agents": agents,
        "active_count": sum(1 for a in agents if a["status"] == "active")
    }

@app.post("/api/v1/agents/register", tags=["Agents"])
async def register_agent(data: Dict[str, Any]):
    """Регистрация нового агента"""
    agent_id = data.get("agent_id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    
    agents_registry[agent_id] = data
    agent_last_seen[agent_id] = time.time()
    
    print(f"✅ Agent registered: {agent_id}")
    
    return {
        "status": "registered",
        "agent_id": agent_id,
        "message": f"Agent {agent_id} registered successfully",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/v1/system", tags=["System"])
async def get_system_info():
    """Полная системная информация"""
    try:
        # CPU информация
        cpu_count = psutil.cpu_count()
        cpu_freq = psutil.cpu_freq()
        
        # Память
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        # Диски
        disks = []
        for partition in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    "device": partition.device,
                    "mountpoint": partition.mountpoint,
                    "fstype": partition.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent
                })
            except:
                continue
        
        # Сеть
        net_io = psutil.net_io_counters()
        net_if_addrs = psutil.net_if_addrs()
        net_if_stats = psutil.net_if_stats()
        
        # Процессы
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                processes.append(proc.info)
            except:
                continue
        
        # Температура (если доступно)
        temps = []
        try:
            temps = psutil.sensors_temperatures()
        except:
            pass
        
        return {
            "system": {
                "hostname": socket.gethostname(),
                "platform": psutil.platform(),
                "boot_time": psutil.boot_time(),
                "uptime": time.time() - psutil.boot_time(),
            },
            "cpu": {
                "count": cpu_count,
                "percent": psutil.cpu_percent(interval=0.1),
                "frequency": cpu_freq.current if cpu_freq else None,
                "load_avg": psutil.getloadavg() if hasattr(psutil, 'getloadavg') else None,
            },
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "used": memory.used,
                "percent": memory.percent,
                "swap_total": swap.total,
                "swap_used": swap.used,
                "swap_percent": swap.percent,
            },
            "disks": {
                "count": len(disks),
                "partitions": disks,
            },
            "network": {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
                "interfaces": len(net_if_addrs),
            },
            "processes": {
                "count": len(processes),
                "top_cpu": sorted(processes, key=lambda x: x.get('cpu_percent', 0), reverse=True)[:5],
                "top_memory": sorted(processes, key=lambda x: x.get('memory_percent', 0), reverse=True)[:5],
            },
            "temperatures": temps,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error collecting system info: {str(e)}")

@app.get("/api/v1/metrics/summary", tags=["Metrics"])
async def get_metrics_summary(timeframe: int = 3600):
    """Сводная статистика по метрикам"""
    summary = {}
    
    for agent_id, history in metrics_history.items():
        if not history:
            continue
        
        # Фильтруем по timeframe
        cutoff_time = time.time() - timeframe
        recent_history = [m for m in history if m.get('timestamp', 0) > cutoff_time]
        
        if not recent_history:
            continue
        
        # Собираем статистику
        cpu_values = [m.get('cpu', {}).get('usage', 0) for m in recent_history]
        memory_values = [m.get('memory', {}).get('used_percent', 0) for m in recent_history]
        
        summary[agent_id] = {
            "metrics_count": len(recent_history),
            "time_range": {
                "from": datetime.fromtimestamp(min([m.get('timestamp', 0) for m in recent_history])).isoformat(),
                "to": datetime.fromtimestamp(max([m.get('timestamp', 0) for m in recent_history])).isoformat(),
            },
            "cpu": {
                "min": min(cpu_values) if cpu_values else 0,
                "max": max(cpu_values) if cpu_values else 0,
                "avg": statistics.mean(cpu_values) if cpu_values else 0,
                "current": cpu_values[-1] if cpu_values else 0,
            },
            "memory": {
                "min": min(memory_values) if memory_values else 0,
                "max": max(memory_values) if memory_values else 0,
                "avg": statistics.mean(memory_values) if memory_values else 0,
                "current": memory_values[-1] if memory_values else 0,
            }
        }
    
    return {
        "timeframe": timeframe,
        "agents_count": len(summary),
        "summary": summary
    }

@app.get("/api/v1/docker/metrics", response_model=ExtendedDockerMetrics, tags=["Docker"])
async def get_docker_metrics():
    """Получение Docker метрик через CLI"""
    try:
        metrics = SimpleDockerMetrics.get_metrics()
        
        if not metrics.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Docker error: {metrics.get('error', 'Unknown error')}"
            )
        
        return ExtendedDockerMetrics(
            engine=DockerEngineInfo(**metrics["engine"]),
            containers=metrics["containers"],
            container_stats=metrics["container_stats"],
            images=metrics["images"],
            networks=metrics["networks"],
            volumes=metrics["volumes"],
            events=metrics["events"]
        )
        
    except Exception as e:
        print(f"❌ Docker metrics error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        raise HTTPException(
            status_code=500,
            detail=f"Docker error: {str(e)}"
        )

@app.get("/api/v1/docker/simple")
async def docker_simple():
    """Простой Docker эндпоинт через CLI"""
    return SimpleDockerMetrics.get_metrics()

@app.get("/api/v1/docker/debug")
async def docker_debug():
    """Отладка Docker подключения"""
    import subprocess
    
    results = {
        "timestamp": datetime.now().isoformat(),
        "docker_cli": False,
        "docker_version": "",
        "containers": [],
        "paths": {},
        "system": {}
    }
    
    # Проверка Docker CLI
    try:
        result = subprocess.run(["docker", "--version"], capture_output=True, text=True)
        results["docker_cli"] = result.returncode == 0
        results["docker_version"] = result.stdout.strip() if result.returncode == 0 else result.stderr
        
        # Проверка docker info
        info_result = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"], 
                                    capture_output=True, text=True)
        if info_result.returncode == 0:
            results["docker_info"] = info_result.stdout.strip()
            
        # Проверка контейнеров
        ps_result = subprocess.run(["docker", "ps", "-a", "--format", "{{.Names}}"], 
                                  capture_output=True, text=True)
        if ps_result.returncode == 0:
            results["containers"] = [c for c in ps_result.stdout.strip().split('\n') if c]
            
    except Exception as e:
        results["docker_cli_error"] = str(e)
    
    # Проверка путей
    import os
    socket_paths = [
        ("/var/run/docker.sock", "symlink"),
        ("/Users/mac/.docker/run/docker.sock", "user"),
    ]
    
    for path, name in socket_paths:
        exists = os.path.exists(path)
        results["paths"][name] = {
            "exists": exists,
            "path": path,
        }
        if exists:
            results["paths"][name]["is_socket"] = os.path.isfile(path) and os.access(path, os.R_OK)
    
    # Системная информация
    import platform
    results["system"] = {
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "user": os.environ.get("USER", "unknown"),
    }
    
    return results
        
@app.get("/api/v1/docker/test", response_model=ExtendedDockerMetrics)
async def test_docker_format():
    """Тестовый эндпоинт для проверки формата данных"""
    return ExtendedDockerMetrics(
        engine=DockerEngineInfo(
            version="test-version",
            api_version="1.52",
            arch="amd64",
            os_type="linux",
            kernel_version="5.10.0",
            containers=2,
            containers_running=2,
            containers_paused=0,
            containers_stopped=0,
            images=10,
            driver="overlay2",
            storage_driver="overlay2",
            logging_driver="json-file",
            cgroup_driver="cgroupfs",
            n_events_listener=1,
            n_fd=30,
            n_goroutines=45,
            mem_total=17179869184,
            n_cpu=4,
            operating_system="Docker Desktop",
            labels=[],
            server_version="20.10.0",
            cluster_store="",
            cluster_advertise="",
            default_runtime="runc",
            live_restore_enabled=True,
            isolation="default",
            init_binary="",
            product_license="",
            warnings=[]
        ),
        containers=[
            {
                "id": "e020e91f3150",
                "names": ["/auth-phpmyadmin"],
                "image": "phpmyadmin/phpmyadmin",
                "image_id": "sha256:abc123",
                "command": ["/docker-entrypoint.sh"],
                "created": "2024-01-01T12:00:00Z",
                "status": "running",
                "state": {
                    "status": "running",
                    "running": True,
                    "paused": False,
                    "restarting": False,
                    "oom_killed": False,
                    "dead": False,
                    "pid": 1234,
                    "exit_code": 0,
                    "error": "",
                    "started_at": "2024-01-01T12:00:00Z",
                    "finished_at": "",
                    "health": {}
                },
                "ports": [
                    {
                        "IP": "0.0.0.0",
                        "PrivatePort": 80,
                        "PublicPort": 8081,
                        "Type": "tcp"
                    }
                ],
                "labels": {},
                "size_rw": 0,
                "size_root_fs": 0,
                "host_config": {},
                "network_settings": {},
                "mounts": []
            },
            {
                "id": "667e13702545",
                "names": ["/auth-mysql"],
                "image": "mysql:8.0",
                "image_id": "sha256:def456",
                "command": ["docker-entrypoint.sh"],
                "created": "2024-01-01T12:00:00Z",
                "status": "running",
                "state": {
                    "status": "running",
                    "running": True,
                    "paused": False,
                    "restarting": False,
                    "oom_killed": False,
                    "dead": False,
                    "pid": 1235,
                    "exit_code": 0,
                    "error": "",
                    "started_at": "2024-01-01T12:00:00Z",
                    "finished_at": "",
                    "health": {}
                },
                "ports": [
                    {
                        "IP": "0.0.0.0",
                        "PrivatePort": 3306,
                        "PublicPort": 3306,
                        "Type": "tcp"
                    }
                ],
                "labels": {},
                "size_rw": 0,
                "size_root_fs": 0,
                "host_config": {},
                "network_settings": {},
                "mounts": []
            }
        ],
        container_stats=[],
        images=[],
        networks=[],
        volumes=[],
        events=[]
    )        
        
@app.get("/api/v1/docker/info")
async def get_docker_info():
    """Проверка подключения к Docker"""
    try:
        import docker
        
        client = None
        # Пробуем подключиться
        try:
            client = docker.from_env()
        except:
            try:
                client = docker.DockerClient(base_url='unix:///var/run/docker.sock')
            except:
                client = docker.DockerClient(base_url='unix:///Users/mac/.docker/run/docker.sock')
        
        if client:
            info = client.info()
            return {
                "status": "connected",
                "version": info.get('ServerVersion'),
                "containers_total": info.get('Containers', 0),
                "containers_running": info.get('ContainersRunning', 0),
                "api_version": info.get('ApiVersion'),
                "os": info.get('OSType'),
                "arch": info.get('Architecture')
            }
        else:
            return {"status": "not_connected", "error": "Could not connect"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
        
# В backend/src/main.py добавьте
@app.get("/api/v1/docker/fixed")
async def docker_fixed():
    """Исправленная версия Docker метрик"""
    try:
        # Просто возвращаем данные из docker_simple.py без валидации
        from .docker_simple import SimpleDockerMetrics
        return SimpleDockerMetrics.get_metrics()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/v1/docker/container/{container_id}/start", tags=["Docker"])
async def start_container(container_id: str):
    """Запуск контейнера"""
    try:
        result = subprocess.run(
            ["docker", "start", container_id],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            return {
                "status": "success",
                "action": "start",
                "container_id": container_id,
                "message": f"Container {container_id} started successfully"
            }
        else:
            return {
                "status": "error",
                "action": "start",
                "container_id": container_id,
                "error": result.stderr
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error starting container: {str(e)}")

@app.post("/api/v1/docker/container/{container_id}/stop", tags=["Docker"])
async def stop_container(container_id: str, timeout: int = 10):
    """Остановка контейнера"""
    try:
        result = subprocess.run(
            ["docker", "stop", "-t", str(timeout), container_id],
            capture_output=True,
            text=True,
            timeout=timeout + 5
        )
        
        if result.returncode == 0:
            return {
                "status": "success",
                "action": "stop",
                "container_id": container_id,
                "message": f"Container {container_id} stopped successfully"
            }
        else:
            return {
                "status": "error",
                "action": "stop",
                "container_id": container_id,
                "error": result.stderr
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error stopping container: {str(e)}")

@app.post("/api/v1/docker/container/{container_id}/restart", tags=["Docker"])
async def restart_container(container_id: str, timeout: int = 10):
    """Перезагрузка контейнера"""
    try:
        result = subprocess.run(
            ["docker", "restart", "-t", str(timeout), container_id],
            capture_output=True,
            text=True,
            timeout=timeout + 5
        )
        
        if result.returncode == 0:
            return {
                "status": "success",
                "action": "restart",
                "container_id": container_id,
                "message": f"Container {container_id} restarted successfully"
            }
        else:
            return {
                "status": "error",
                "action": "restart",
                "container_id": container_id,
                "error": result.stderr
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error restarting container: {str(e)}")

@app.delete("/api/v1/docker/image/{image_id}")
async def delete_docker_image(image_id: str):
    """Delete a Docker image by ID"""
    try:
        docker_client.images.remove(image_id, force=True)
        return {
            "status": "success",
            "action": "delete",
            "resource_type": "image",
            "image_id": image_id,
            "message": f"Image {image_id} deleted successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting image: {str(e)}")

@app.delete("/api/v1/docker/volume/{volume_id}")
async def delete_docker_volume(volume_id: str):
    """Delete a Docker volume by ID"""
    try:
        docker_client.volumes.get(volume_id).remove(force=True)
        return {
            "status": "success",
            "action": "delete",
            "resource_type": "volume",
            "volume_id": volume_id,
            "message": f"Volume {volume_id} deleted successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting volume: {str(e)}")

@app.get("/api/v1/docker/image/{image_id}/vulnerabilities")
async def scan_image_vulnerabilities(image_id: str):
    """
    Сканирует Docker образ на уязвимости с помощью Trivy
    
    Args:
        image_id: Имя или ID образа
    
    Returns:
        Результаты сканирования с найденными уязвимостями
    """
    try:
        # Проверяем доступность Trivy
        if not TrivyScanner.check_trivy_installed():
            return {
                "status": "warning",
                "image": image_id,
                "message": "Trivy is not installed. Install with: brew install trivy (macOS) or apt-get install trivy (Linux)",
                "trivy_available": False
            }
        
        # Запускаем сканирование
        result = trivy_scanner.scan_image(image_id)
        
        return result
    
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error scanning image vulnerabilities: {str(e)}"
        )


@app.get("/api/v1/docker/images")
async def get_available_images():
    """
    Получает список доступных для сканирования Docker образов
    
    Returns:
        Список локальных образов
    """
    try:
        images = trivy_scanner.get_local_images()
        return {
            "status": "success",
            "images": images,
            "total": len(images)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching images: {str(e)}"
        )


@app.post("/api/v1/docker/image/scan")
async def scan_image_by_name(request_data: Dict[str, str], background_tasks: BackgroundTasks):
    """
    Сканирует Docker образ по имени
    
    Payload:
        {
            "image_name": "nginx:latest"  # или любое другое имя образа
        }
    
    Returns:
        Результаты сканирования
    """
    try:
        image_name = request_data.get("image_name", "").strip()
        
        if not image_name:
            raise HTTPException(status_code=400, detail="image_name is required")
        
        # Проверяем доступность Trivy
        if not TrivyScanner.check_trivy_installed():
            return {
                "status": "warning",
                "image": image_name,
                "message": "Trivy is not installed",
                "trivy_available": False
            }
        
        # Запускаем сканирование
        result = trivy_scanner.scan_image(image_name)
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error during scan: {str(e)}"
        )

@app.post("/api/v1/process/{pid}/stop", tags=["System"])
async def stop_process(pid: int, force: bool = False):
    """
    Остановить процесс по PID
    
    Args:
        pid: Process ID
        force: Использовать SIGKILL вместо SIGTERM
    
    Returns:
        Статус операции
    """
    try:
        import signal
        import os
        
        # Проверяем что процесс существует
        try:
            proc = psutil.Process(pid)
            process_name = proc.name()
        except psutil.NoSuchProcess:
            raise HTTPException(status_code=404, detail=f"Process with PID {pid} not found")
        
        # Пытаемся завершить процесс
        if force:
            os.kill(pid, signal.SIGKILL)
            action = "killed"
        else:
            os.kill(pid, signal.SIGTERM)
            action = "terminated"
        
        return {
            "status": "success",
            "action": action,
            "pid": pid,
            "process_name": process_name,
            "message": f"Process {process_name} (PID: {pid}) {action} successfully"
        }
    
    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied to terminate process {pid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error terminating process: {str(e)}")

        
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )