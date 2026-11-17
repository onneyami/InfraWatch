"""
Router для метрик и агентов.

Endpoints:
- POST /api/v1/metrics - приём метрик от агента (только токен агента)
- GET /api/v1/metrics/latest - последние метрики (только агенты текущего пользователя)
- GET /api/v1/metrics/history - история метрик (то же)
- GET /api/v1/metrics/summary - сводная статистика (то же)
- GET /api/v1/agents - список агентов пользователя
- POST /api/v1/agents/enrollment-keys - одноразовый ключ регистрации агента
- POST /api/v1/agents/register - регистрация агента по ключу (публичный, ключ = авторизация)
- DELETE /api/v1/agents/{agent_id} - удалить своего агента (отзывает его токен)

Агент принадлежит пользователю, создавшему ключ регистрации. Все чтения отфильтрованы по
владельцу; чужой agent_id неотличим от несуществующего (404).
"""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from typing import Dict, List, Optional, Any, Set
from datetime import datetime
import time
import json
import statistics

from ..stores import metrics_history, agents_registry, agent_last_seen, process_history, MAX_HISTORY
from ..auth import (
    ENROLLMENT_KEY_TTL_SECONDS,
    AgentExistsError,
    InvalidEnrollmentKeyError,
    TooManyKeysError,
    auth_db,
)
from ..login_throttle import FailureThrottle
from ..middleware import require_user_id

router = APIRouter(prefix="/api/v1", tags=["Metrics", "Agents"])

# Failed enrollment attempts (unknown/used/expired key) allowed per IP per hour.
ENROLL_FAILURE_LIMIT = 20
enroll_throttle = FailureThrottle(window_seconds=60 * 60)


def _clean_str(value: Any, max_len: int) -> str:
    """Coerce untrusted registration fields to a short printable string."""
    if not isinstance(value, str):
        return ""
    return "".join(ch for ch in value.strip() if ch.isprintable())[:max_len]


async def _owned_agent_ids(request: Request) -> Set[str]:
    return await run_in_threadpool(auth_db.agent_ids_for_owner, require_user_id(request))


@router.post("/metrics")
async def receive_metrics(request: Request):
    """Прием метрик от агента"""
    authenticated_id = getattr(request.state, "agent_id", None)
    if not authenticated_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        body_bytes = await request.body()
        body_text = body_bytes.decode('utf-8', errors='replace')
        
        try:
            payload = json.loads(body_text) if body_text else {}
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Invalid metrics payload: {e}")
        
        if not isinstance(payload, dict):
            raise HTTPException(status_code=422, detail="Metrics payload must be a JSON object")

        # Агент может писать только за себя: id из тела обязан совпадать с тем, что прошёл
        # проверку токена, иначе любой агент мог бы подменять метрики чужих.
        agent_id = payload.get('agent_id', authenticated_id)
        if agent_id != authenticated_id:
            raise HTTPException(status_code=403, detail="agent_id does not match the authenticated agent")
        payload['agent_id'] = authenticated_id

        # Обновляем время последней активности
        agent_last_seen[agent_id] = time.time()
        
        # Сохраняем метрики в истории
        payload['received_at'] = datetime.now().isoformat()
        
        if agent_id not in metrics_history:
            metrics_history[agent_id] = []
        
        metrics_history[agent_id].append(payload)
        
        # Ограничиваем историю
        if len(metrics_history[agent_id]) > MAX_HISTORY:
            metrics_history[agent_id] = metrics_history[agent_id][-MAX_HISTORY:]
        
        # Сохраняем историю процессов
        if payload.get('processes'):
            current_time = time.time()
            for proc in payload['processes']:
                proc_entry = {
                    "cpu_percent": proc.get('cpu_percent'),
                    "memory_percent": proc.get('memory_percent'),
                    "memory_rss": proc.get('memory_rss'),
                    "memory_vms": proc.get('memory_vms'),
                    "status": proc.get('status'),
                    "num_threads": proc.get('num_threads'),
                    "timestamp": current_time,
                    "name": proc.get('name'),
                    "agent_id": agent_id,
                }
                process_history[proc.get('pid', 0)].append(proc_entry)
                if len(process_history[proc.get('pid', 0)]) > 100:
                    process_history[proc.get('pid', 0)] = process_history[proc.get('pid', 0)][-100:]
        
        return {
            "status": "received",
            "agent_id": agent_id,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing metrics: {str(e)}")


@router.get("/metrics/latest")
async def get_latest_metrics(request: Request, agent_id: Optional[str] = None):
    """Получение последних метрик (только агенты текущего пользователя)"""
    owned = await _owned_agent_ids(request)
    latest = {aid: history[-1] for aid, history in metrics_history.items() if history and aid in owned}

    if not latest:
        return {"message": "No metrics available"}

    if agent_id:
        return latest.get(agent_id) or {"error": "Agent not found or no metrics"}

    # Возвращаем последние метрики всех агентов пользователя
    return latest


@router.get("/metrics/history")
async def get_metrics_history(
    request: Request,
    agent_id: str,
    metric_type: str = "cpu.usage",
    limit: int = 100,
    timeframe: int = 3600
):
    """Получение истории метрик"""
    owned = await _owned_agent_ids(request)
    if agent_id not in owned or agent_id not in metrics_history:
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


@router.get("/metrics/summary")
async def get_metrics_summary(request: Request, timeframe: int = 3600):
    """Сводная статистика по метрикам (только агенты текущего пользователя)"""
    summary = {}
    owned = await _owned_agent_ids(request)
    
    for agent_id, history in metrics_history.items():
        if not history or agent_id not in owned:
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


@router.get("/agents")
async def list_agents(request: Request, status: Optional[str] = None):
    """Список агентов текущего пользователя"""
    agents = []
    owned = await _owned_agent_ids(request)
    for agent_id, last_seen in agent_last_seen.items():
        if agent_id not in owned:
            continue
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


class EnrollmentKeyRequest(BaseModel):
    label: Optional[str] = Field(None, max_length=64)


@router.post("/agents/enrollment-keys")
async def create_enrollment_key(
    request: Request, response: Response, body: Optional[EnrollmentKeyRequest] = None
):
    """Создать одноразовый ключ регистрации агента (действует 1 час, показывается один раз)."""
    owner_id = require_user_id(request)
    label = _clean_str(body.label, 64) if body and body.label else None
    try:
        key, expires_at = await run_in_threadpool(auth_db.create_enrollment_key, owner_id, label or None)
    except TooManyKeysError:
        raise HTTPException(
            status_code=429,
            detail="Too many unused enrollment keys. Use or wait out the existing ones first.",
        )
    response.headers["Cache-Control"] = "no-store"
    return {"key": key, "expires_at": expires_at, "expires_in_seconds": ENROLLMENT_KEY_TTL_SECONDS}


@router.post("/agents/register")
async def register_agent(request: Request, data: Dict[str, Any]):
    """Регистрация агента по одноразовому ключу. Публичный: авторизация — сам ключ."""
    ip_key = f"ip:{request.client.host if request.client else 'unknown'}"
    retry = enroll_throttle.retry_after([(ip_key, ENROLL_FAILURE_LIMIT)])
    if retry:
        raise HTTPException(
            status_code=429,
            detail="Too many failed enrollment attempts. Try again later.",
            headers={"Retry-After": str(retry)},
        )

    enrollment_key = data.get("enrollment_key")
    if not isinstance(enrollment_key, str) or not enrollment_key:
        raise HTTPException(
            status_code=401,
            detail="An enrollment key is required. Create one in the dashboard (Settings → Agents → Add Agent).",
        )

    agent_id = _clean_str(data.get("agent_id"), 128)
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")

    hostname = _clean_str(data.get("hostname"), 255) or "unknown"
    ip_address = _clean_str(data.get("ip_address"), 64)
    version = _clean_str(data.get("version"), 64)
    raw_tags = data.get("tags")
    tags = [_clean_str(t, 64) for t in raw_tags[:20]] if isinstance(raw_tags, list) else []

    try:
        token = await run_in_threadpool(
            auth_db.enroll_agent, enrollment_key, agent_id, hostname, ip_address, version, tags
        )
    except InvalidEnrollmentKeyError:
        enroll_throttle.record_failure([ip_key])
        raise HTTPException(status_code=401, detail="Invalid or expired enrollment key")
    except AgentExistsError:
        raise HTTPException(
            status_code=409,
            detail="An agent with this agent_id is already registered. Remove it in the "
                   "dashboard first, or start the agent with a different AGENT_ID.",
        )

    # In-memory view used by the dashboard. Never keep the enrollment key.
    features = data.get("features")
    agents_registry[agent_id] = {
        "agent_id": agent_id,
        "hostname": hostname,
        "ip_address": ip_address,
        "version": version,
        "tags": tags,
        "features": features if isinstance(features, dict) else {},
    }
    agent_last_seen[agent_id] = time.time()

    return {
        "status": "registered",
        "agent_id": agent_id,
        "token": token,
        "message": f"Agent {agent_id} registered successfully. Save your token!",
        "timestamp": datetime.now().isoformat(),
        "warning": "Store this token securely. It will not be shown again."
    }


@router.delete("/agents/{agent_id}")
async def delete_agent(request: Request, agent_id: str):
    """Удалить своего агента: токен перестаёт работать, agent_id можно зарегистрировать заново."""
    deleted = await run_in_threadpool(auth_db.delete_agent, agent_id, require_user_id(request))
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")

    agents_registry.pop(agent_id, None)
    agent_last_seen.pop(agent_id, None)
    metrics_history.pop(agent_id, None)
    for pid in list(process_history):
        remaining = [e for e in process_history[pid] if e.get("agent_id") != agent_id]
        if remaining:
            process_history[pid] = remaining
        else:
            del process_history[pid]

    return {"status": "deleted", "agent_id": agent_id}
