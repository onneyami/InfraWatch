"""
Shared in-memory storage for Ahova backend.

These stores are used across multiple routers to share state.
For production, consider replacing with Redis or a database.
"""

from typing import Dict, List, Any
from collections import defaultdict
import time


# Metrics storage
metrics_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
MAX_HISTORY = 1000

# Agents registry (in-memory cache, main storage is in auth_db)
agents_registry: Dict[str, Dict[str, Any]] = {}
agent_last_seen: Dict[str, float] = {}

# Process history (for tracking resource consumption over time)
process_history: Dict[int, List[Dict[str, Any]]] = defaultdict(list)

# System network counters (for calculating bandwidth speed)
system_net_prev: Dict[str, Any] = {
    "ts": time.time(),
    "bytes_sent": 0,
    "bytes_recv": 0,
}


def cleanup_old_metrics(cutoff_time: float = None):
    """
    Clean up old metrics from history.
    
    Args:
        cutoff_time: Remove metrics older than this timestamp.
                    Defaults to 1 hour ago.
    """
    if cutoff_time is None:
        cutoff_time = time.time() - 3600  # 1 hour ago
    
    for agent_id in list(metrics_history.keys()):
        # Remove old entries
        metrics_history[agent_id] = [
            m for m in metrics_history[agent_id]
            if m.get('timestamp', 0) > cutoff_time
        ]
        
        # Remove empty lists
        if not metrics_history[agent_id]:
            del metrics_history[agent_id]
    
    # Clean up inactive agents
    for agent_id in list(agent_last_seen.keys()):
        if agent_last_seen[agent_id] < cutoff_time:
            if agent_id in agents_registry:
                del agents_registry[agent_id]
            del agent_last_seen[agent_id]
