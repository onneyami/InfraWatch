"""
Router для метрик и агентов.

Endpoints:
- POST /api/v1/metrics - приём метрик от агента
- GET /api/v1/metrics/latest - последние метрики
- GET /api/v1/metrics/history - история метрик
- GET /api/v1/metrics/summary - сводная статистика
- GET /api/v1/agents - список агентов
- POST /api/v1/agents/register - регистрация агента
"""

from fastapi import APIRouter, HTTPException, Request
from typing import Dict, List, Optional, Any
from datetime import datetime
import time
import json
import statistics

from ..stores import metrics_history, agents_registry, agent_last_seen, process_history, MAX_HISTORY
from ..auth import create_agent_token, get_agent_info

router = APIRouter(prefix="/api/v1", tags=["Metrics", "Agents"])


@router.post("/metrics")
async def receive_metrics(request: Request):
    """Прием метрик от агента"""
    try:
        body_bytes = await request.body()
        body_text = body_bytes.decode('utf-8', errors='replace')
        
        try:
            payload = json.loads(body_text) if body_text else {}
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Invalid metrics payload: {e}")
        
        agent_id = payload.get('agent_id')
        
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
                    "name": proc.get('name')
                }
                process_history[proc.get('pid', 0)].append(proc_entry)
                if len(process_history[proc.get('pid', 0)]) > 100:
                    process_history[proc.get('pid', 0)] = process_history[proc.get('pid', 0)][-100:]
        
        return {
            "status": "received",
            "agent_id": agent_id,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing metrics: {str(e)}")


@router.get("/metrics/latest")
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


@router.get("/metrics/history")
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


@router.get("/metrics/summary")
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


@router.get("/agents")
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


@router.post("/agents/register")
async def register_agent(request: Request, data: Dict[str, Any]):
    """Регистрация нового агента"""
    agent_id = data.get("agent_id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    
    hostname = data.get("hostname", "unknown")
    ip_address = data.get("ip_address", "")
    version = data.get("version", "")
    tags = data.get("tags", [])
    
    # Создаём агента и получаем токен
    token = create_agent_token(
        agent_id=agent_id,
        hostname=hostname,
        ip_address=ip_address,
        version=version,
        tags=tags
    )
    
    # Если токен None - агент уже зарегистрирован
    if token is None:
        agent_info = get_agent_info(agent_id)
        if agent_info:
            return {
                "status": "already_registered",
                "agent_id": agent_id,
                "message": "Agent already registered. Use the token from initial registration.",
                "timestamp": datetime.now().isoformat(),
                "info": agent_info
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to register agent")
    
    # Сохраняем в памяти
    agents_registry[agent_id] = data
    agent_last_seen[agent_id] = time.time()
    
    return {
        "status": "registered",
        "agent_id": agent_id,
        "token": token,
        "message": f"Agent {agent_id} registered successfully. Save your token!",
        "timestamp": datetime.now().isoformat(),
        "warning": "Store this token securely. It will not be shown again."
    }
