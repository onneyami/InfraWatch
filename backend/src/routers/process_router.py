"""
Process management router.

Endpoints:
- GET /api/v1/processes - список процессов (топ по CPU)
- GET /api/v1/process/{pid} - детали процесса
- GET /api/v1/process/{pid}/tree - дерево процессов
- POST /api/v1/process/{pid}/stop - остановить процесс
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from datetime import timedelta
import asyncio
import psutil
import signal
import os
import time

from ..stores import process_history

router = APIRouter(prefix="/api/v1", tags=["Processes"])


@router.get("/processes")
async def list_processes(limit: int = 100):
    """
    Список процессов хоста бэкенда (топ по CPU), для Process Manager в UI.

    Раньше этого эндпоинта не существовало — фронтенд не имел источника данных
    для списка процессов и был вынужден передавать в ProcessManager пустой массив.
    """
    procs = list(psutil.process_iter(["pid", "name", "status", "username"]))

    # psutil.Process.cpu_percent() сравнивает с предыдущим замером для того же
    # объекта. Раз объекты создаются заново на каждый запрос, первый вызов
    # всегда возвращает 0.0 — "прогреваем" счётчик, ждём короткий интервал,
    # затем снимаем реальное значение (тот же паттерн, что рекомендует psutil).
    for proc in procs:
        try:
            proc.cpu_percent(interval=None)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    await asyncio.sleep(0.1)

    result = []
    for proc in procs:
        try:
            info = proc.info
            result.append({
                "pid": info.get("pid"),
                "name": info.get("name") or "unknown",
                "status": info.get("status") or "unknown",
                "username": info.get("username") or "unknown",
                "cpu_percent": proc.cpu_percent(interval=None) or 0.0,
                "memory_percent": proc.memory_percent() or 0.0,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            # Процесс мог завершиться между process_iter() и обращением к нему,
            # либо нет прав на чтение — пропускаем, а не роняем весь список
            continue

    result.sort(key=lambda p: p["cpu_percent"], reverse=True)
    return {"processes": result[:limit], "total": len(result)}


@router.get("/process/{pid}")
async def get_process_details(pid: int):
    """Получить детальную информацию о процессе"""
    try:
        proc = psutil.Process(pid)
        
        def safe_get(func, default=None):
            try:
                return func()
            except (psutil.AccessDenied, PermissionError):
                return default
            except Exception:
                return default
        
        info = {
            "pid": proc.pid,
            "name": safe_get(lambda: proc.name(), "unknown"),
            "status": safe_get(lambda: proc.status(), "unknown"),
            "username": safe_get(lambda: proc.username(), "unknown"),
            "create_time": safe_get(lambda: proc.create_time()),
            "cpu_percent": safe_get(lambda: proc.cpu_percent(interval=0.1), 0),
            "memory_percent": safe_get(lambda: proc.memory_percent(), 0),
            "memory_info": safe_get(lambda: proc.memory_info()._asdict() if proc.memory_info() else None),
            "num_threads": safe_get(lambda: proc.num_threads(), 0),
            "cmdline": safe_get(lambda: " ".join(proc.cmdline()) if proc.cmdline() else ""),
        }
        
        if info["create_time"]:
            info["uptime"] = time.time() - info["create_time"]
            info["uptime_human"] = str(timedelta(seconds=int(info["uptime"])))
        
        return info
    
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process with PID {pid} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting process details: {str(e)}")


@router.get("/process/{pid}/tree")
async def get_process_tree(pid: int):
    """Получить дерево процессов"""
    def build_tree(process, level=0, max_depth=5):
        if level > max_depth:
            return None
            
        try:
            node = {
                "pid": process.pid,
                "name": process.name(),
                "status": process.status(),
                "cpu_percent": process.cpu_percent(interval=0.01),
                "memory_percent": process.memory_percent(),
                "children": []
            }
            
            for child in process.children():
                child_node = build_tree(child, level + 1, max_depth)
                if child_node:
                    node["children"].append(child_node)
            
            return node
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None
    
    try:
        proc = psutil.Process(pid)
        tree = build_tree(proc)
        
        if not tree:
            raise HTTPException(status_code=404, detail=f"Process with PID {pid} not found")
        
        return {
            "root_pid": pid,
            "tree": tree
        }
    
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process with PID {pid} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting process tree: {str(e)}")


@router.post("/process/{pid}/stop")
async def stop_process(pid: int, force: bool = False):
    """Остановить процесс по PID"""
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


@router.get("/process/{pid}/history")
async def get_process_history(pid: int, limit: int = 50):
    """Получить историю потребления ресурсов процессом"""
    try:
        if pid not in process_history or not process_history[pid]:
            return {
                "pid": pid,
                "history": [],
                "count": 0,
                "message": "No history available for this process"
            }
        
        history = process_history[pid][-limit:]
        
        return {
            "pid": pid,
            "process_name": history[-1].get("name", "unknown") if history else "unknown",
            "history": history,
            "count": len(history)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting process history: {str(e)}")
