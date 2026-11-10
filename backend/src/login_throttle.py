"""
In-memory failure throttle for login and registration.

Deliberately dependency-free and small. It counts *failures* per key inside a sliding
window and reports how long a key stays blocked once it reaches its limit.

Known limits (documented in docs/KNOWN_ISSUES.md):
- State is per process and lost on restart. With several workers each one keeps its own
  budget, so the effective limit is `limit * workers`.
- Keys include the client IP. Behind a reverse proxy every request appears to come from
  the proxy unless uvicorn runs with ``--proxy-headers --forwarded-allow-ips=<proxy>``,
  in which case all users would share one budget.
- A per-identifier limit lets someone lock a known username out for up to one window by
  failing on purpose. That is the usual trade-off; the lock expires on its own.
"""

import threading
import time
from collections import deque
from typing import Callable, Deque, Dict, Iterable, Tuple

# (key, max failures allowed inside the window)
Limit = Tuple[str, int]


class FailureThrottle:
    def __init__(
        self,
        window_seconds: int = 15 * 60,
        max_keys: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.window = window_seconds
        self.max_keys = max_keys
        self._clock = clock
        self._failures: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> Deque[float]:
        events = self._failures.get(key)
        if events is None:
            return deque()
        cutoff = now - self.window
        while events and events[0] <= cutoff:
            events.popleft()
        if not events:
            del self._failures[key]
            return deque()
        return events

    def retry_after(self, limits: Iterable[Limit]) -> int:
        """Seconds until the most restrictive blocked key frees up; 0 if none is blocked."""
        now = self._clock()
        wait = 0.0
        with self._lock:
            for key, max_failures in limits:
                events = self._prune(key, now)
                if len(events) >= max_failures:
                    # Blocked until enough old failures age out to drop below the limit.
                    frees_at = events[len(events) - max_failures] + self.window
                    wait = max(wait, frees_at - now)
        return int(wait) + 1 if wait > 0 else 0

    def record_failure(self, keys: Iterable[str]) -> None:
        now = self._clock()
        with self._lock:
            for key in keys:
                events = self._prune(key, now)
                if not events:
                    if len(self._failures) >= self.max_keys:
                        # Memory bound: drop the key whose newest failure is oldest.
                        oldest = min(self._failures, key=lambda k: self._failures[k][-1])
                        del self._failures[oldest]
                    events = self._failures.setdefault(key, deque())
                events.append(now)

    def reset(self, keys: Iterable[str]) -> None:
        with self._lock:
            for key in keys:
                self._failures.pop(key, None)
