"""
Docker router.

Endpoints:
- GET /api/v1/docker/metrics - полные Docker метрики
- GET /api/v1/docker/simple - упрощённые метрики
- GET /api/v1/docker/images - список Docker-образов
- GET /api/v1/docker/container/{id}/logs - логи контейнера
- GET /api/v1/docker/container/{id}/logs/stream - логи контейнера в реальном времени (SSE)
- POST /api/v1/docker/container/{id}/start - старт контейнера
- POST /api/v1/docker/container/{id}/stop - остановка контейнера
- POST /api/v1/docker/container/{id}/restart - рестарт контейнера
- DELETE /api/v1/docker/image/{id} - удаление образа
- DELETE /api/v1/docker/volume/{id} - удаление тома
- DELETE /api/v1/docker/network/{id} - удаление сети
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import subprocess
import asyncio
import docker.errors

from ..docker_simple import SimpleDockerMetrics

router = APIRouter(prefix="/api/v1", tags=["Docker"])


def _clean_docker_error(e: Exception, resource: str) -> tuple:
    """
    Docker-py кидает исключения с сырым HTTP-ответом Docker Engine внутри
    текста (например: '409 Client Error for http+docker://localhost/v1.55/...').
    Это нечитаемо для пользователя интерфейса — превращаем в понятный текст
    и правильный HTTP-статус.
    """
    if isinstance(e, docker.errors.APIError):
        status = e.response.status_code if e.response is not None else 500
        if status == 409:
            if resource == "volume":
                return 409, "Cannot delete volume: it is still referenced by a container. Docker keeps this reference until the container is removed — stopping it is not enough. Remove the container(s) using it, then try again."
            return 409, f"Cannot delete {resource}: it is currently in use. Stop the container(s) using it first."
        if status == 403:
            return 403, f"Cannot delete {resource}: this is a built-in Docker resource and cannot be removed."
        if status == 404:
            return 404, f"{resource.capitalize()} not found — it may have already been deleted."
    return 500, f"Error deleting {resource}: {str(e)}"


def get_docker_client():
    """Lazy Docker client initialization."""
    try:
        import docker
        client = docker.from_env()
        return client, True
    except Exception:
        return None, False


@router.get("/docker/metrics")
async def get_docker_metrics():
    """Получение Docker метрик через CLI (non-blocking).
    
    Возвращает 200 OK даже если Docker недоступен — фронтенд обрабатывает это.
    """
    try:
        metrics = await asyncio.to_thread(SimpleDockerMetrics.get_metrics)
        
        # Даже если Docker недоступен, возвращаем 200 с пустыми данными
        # Это предотвращает падение фронтенда
        if not metrics.get("success"):
            # Fallback: возвращаем структуру с пустыми данными
            return {
                "success": True,
                "error": metrics.get("error", "Docker not available"),
                "docker_available": False,
                "engine": {"version": "N/A"},
                "containers": [],
                "container_stats": [],
                "images": [],
                "networks": [],
                "volumes": [],
                "events": []
            }
        
        return metrics
    except Exception as e:
        # Любая другая ошибка — тоже возвращаем 200 с пустыми данными
        return {
            "success": True,
            "error": str(e),
            "docker_available": False,
            "engine": {"version": "N/A"},
            "containers": [],
            "container_stats": [],
            "images": [],
            "networks": [],
            "volumes": [],
            "events": []
        }


@router.get("/docker/simple")
async def docker_simple():
    """Простой Docker эндпоинт через CLI (non-blocking)."""
    return await asyncio.to_thread(SimpleDockerMetrics.get_metrics)


@router.get("/docker/images")
async def get_docker_images():
    """Список Docker-образов (используется вкладкой Images и сканером уязвимостей).
    
    Возвращает 200 OK даже если Docker недоступен.
    """
    try:
        metrics = await asyncio.to_thread(SimpleDockerMetrics.get_metrics)
        
        # Даже если Docker недоступен, возвращаем пустой список
        if not metrics.get("success"):
            return {"images": [], "docker_available": False}
        
        return {"images": metrics.get("images", []), "docker_available": True}
    except Exception as e:
        # Любая ошибка — возвращаем пустой список
        return {"images": [], "docker_available": False, "error": str(e)}


@router.get("/docker/container/{container_id}/logs")
async def get_container_logs(container_id: str, lines: int = 200):
    """Получение логов контейнера (non-blocking)."""
    try:
        result = await asyncio.to_thread(
            subprocess.run,
            ["docker", "logs", "--tail", str(lines), container_id],
            capture_output=True,
            text=True,
            timeout=10
        )
        return {
            "container_id": container_id,
            "logs": result.stdout + result.stderr
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching logs: {str(e)}")


@router.get("/docker/container/{container_id}/logs/stream")
async def stream_container_logs(container_id: str, request: Request, lines: int = 100):
    """
    Стриминг логов контейнера в реальном времени через Server-Sent Events.

    Раньше этого эндпоинта не существовало — кнопка Stream в UI подключалась
    к несуществующему пути и сразу получала "Connection lost".
    """
    async def log_generator():
        process = await asyncio.create_subprocess_exec(
            "docker", "logs", "-f", "--tail", str(lines), container_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            while True:
                # Останавливаемся, если клиент закрыл соединение (закрыл модалку,
                # ушёл со страницы) — иначе `docker logs -f` продолжит работать
                # в фоне вечно, утекая процессами.
                if await request.is_disconnected():
                    break
                try:
                    line = await asyncio.wait_for(process.stdout.readline(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                if not line:
                    break
                text = line.decode(errors="replace").rstrip("\n")
                yield f"data: {text}\n\n"
        finally:
            if process.returncode is None:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    process.kill()

    return StreamingResponse(
        log_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/docker/container/{container_id}/start")
async def start_container(container_id: str):
    """Запуск контейнера."""
    try:
        result = await asyncio.to_thread(
            subprocess.run,
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


@router.post("/docker/container/{container_id}/stop")
async def stop_container(container_id: str, timeout: int = 10):
    """Остановка контейнера."""
    try:
        result = await asyncio.to_thread(
            subprocess.run,
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


@router.post("/docker/container/{container_id}/restart")
async def restart_container(container_id: str, timeout: int = 10):
    """Перезагрузка контейнера."""
    try:
        result = await asyncio.to_thread(
            subprocess.run,
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


@router.delete("/docker/container/{container_id}")
async def delete_container(container_id: str, force: bool = False):
    """Delete a container. force=True removes it even if running (docker rm -f)."""
    try:
        client, available = get_docker_client()
        if available and client:
            container = client.containers.get(container_id)
            container.remove(force=force)
            return {
                "status": "success",
                "action": "delete",
                "resource_type": "container",
                "container_id": container_id,
                "message": f"Container {container_id} deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Docker client not available")
    except HTTPException:
        raise
    except Exception as e:
        status, message = _clean_docker_error(e, "container")
        if status == 409:
            message = "Cannot delete a running container. Stop it first, or use force delete."
        raise HTTPException(status_code=status, detail=message)


@router.delete("/docker/image/{image_id}")
async def delete_docker_image(image_id: str):
    """Delete a Docker image by ID."""
    try:
        client, available = get_docker_client()
        if available and client:
            client.images.remove(image_id, force=True)
            return {
                "status": "success",
                "action": "delete",
                "resource_type": "image",
                "image_id": image_id,
                "message": f"Image {image_id} deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Docker client not available")
    except HTTPException:
        raise
    except Exception as e:
        status, message = _clean_docker_error(e, "image")
        raise HTTPException(status_code=status, detail=message)


@router.delete("/docker/volume/{volume_id}")
async def delete_docker_volume(volume_id: str):
    """Delete a Docker volume by ID."""
    try:
        client, available = get_docker_client()
        if available and client:
            client.volumes.get(volume_id).remove(force=True)
            return {
                "status": "success",
                "action": "delete",
                "resource_type": "volume",
                "volume_id": volume_id,
                "message": f"Volume {volume_id} deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Docker client not available")
    except HTTPException:
        raise
    except Exception as e:
        status, message = _clean_docker_error(e, "volume")
        raise HTTPException(status_code=status, detail=message)


@router.delete("/docker/network/{network_id}")
async def delete_docker_network(network_id: str):
    """Delete a Docker network by ID or name."""
    try:
        client, available = get_docker_client()
        if available and client:
            net = client.networks.get(network_id)
            net.remove()
            return {
                "status": "success",
                "action": "delete",
                "resource_type": "network",
                "network_id": network_id,
                "message": f"Network {network_id} deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Docker client not available")
    except HTTPException:
        raise
    except Exception as e:
        status, message = _clean_docker_error(e, "network")
        raise HTTPException(status_code=status, detail=message)
