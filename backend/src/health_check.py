# backend/src/health_check.py
from fastapi import APIRouter, HTTPException
import psutil
import docker
import subprocess
import platform

router = APIRouter()

@router.get("/health")
async def health_check():
    """Проверка здоровья системы"""
    system_info = {
        "status": "healthy",
        "services": {},
        "system": {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "cpu_usage": psutil.cpu_percent(),
            "memory_usage": psutil.virtual_memory().percent,
        }
    }
    
    # Проверка Docker
    try:
        client = docker.from_env()
        client.ping()
        system_info["services"]["docker"] = {
            "status": "running",
            "version": client.version()["Version"]
        }
    except Exception as e:
        system_info["services"]["docker"] = {
            "status": "not_available",
            "error": str(e)
        }
    
    # Проверка других сервисов
    services = [
        ("backend", "http://localhost:8000/docs"),
        ("frontend", "http://localhost:5173"),
        ("agent", "http://localhost:8080/metrics"),
    ]
    
    for name, url in services:
        try:
            import requests
            response = requests.get(url, timeout=2)
            system_info["services"][name] = {
                "status": "running" if response.status_code < 500 else "error",
                "status_code": response.status_code
            }
        except:
            system_info["services"][name] = {
                "status": "not_available",
                "status_code": None
            }
    
    return system_info