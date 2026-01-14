from fastapi import APIRouter
from datetime import datetime
import psutil
import socket

router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "InfraWatch API",
        "hostname": socket.gethostname(),
        "system": {
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_usage": psutil.disk_usage("/").percent if hasattr(psutil, "disk_usage") else None
        }
    }

@router.get("/health/simple")
async def simple_health():
    """Simple health check"""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}