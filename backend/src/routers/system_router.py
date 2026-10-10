"""
System and Health router.

Endpoints:
- GET / - root endpoint
- GET /api/v1/health - health check
- GET /api/v1/system - system information
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from datetime import datetime
import psutil
import socket
import platform
import time

router = APIRouter(tags=["System", "Health"])


@router.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Ahova API v2.6",
        "version": "2.6.0",
        "endpoints": {
            "health": "/api/v1/health",
            "metrics": "/api/v1/metrics",
            "agents": "/api/v1/agents",
            "system": "/api/v1/system",
            "docker": "/api/v1/docker/metrics"
        }
    }


@router.get("/api/v1/health")
async def health_check():
    """Получение полного статуса системы"""
    try:
        # Системные метрики хоста
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return {
            "status": "healthy",
            "service": "Ahova API v2.6",
            "version": "2.6.0",
            "hostname": socket.gethostname(),
            "timestamp": datetime.now().isoformat(),
            "system": {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "memory_total": memory.total,
                "memory_used": memory.used,
                "disk_total": disk.total,
                "disk_used": disk.used,
                "disk_percent": disk.percent,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error collecting system metrics: {str(e)}")


@router.get("/api/v1/system")
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

        # Батарея (есть не на всех хостах — на серверах её обычно нет,
        # тогда возвращаем null, фронтенд уже это ожидает и обрабатывает)
        battery_info = None
        try:
            battery = psutil.sensors_battery()
            if battery is not None:
                battery_info = {
                    "percent": battery.percent,
                    "seconds_left": battery.secsleft if battery.secsleft not in (psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN) else None,
                    "power_plugged": battery.power_plugged,
                }
        except Exception:
            # sensors_battery() не реализован на некоторых платформах (часть Linux-серверов) —
            # это ожидаемо, не считаем ошибкой всего запроса
            battery_info = None

        return {
            "system": {
                "hostname": socket.gethostname(),
                "platform": platform.platform(),
                "boot_time": psutil.boot_time(),
                "uptime": time.time() - psutil.boot_time(),
            },
            "cpu": {
                "count": cpu_count,
                "percent": psutil.cpu_percent(interval=0.1),
                "frequency": cpu_freq.current if cpu_freq else None,
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
            },
            "battery": battery_info,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error collecting system info: {str(e)}")
