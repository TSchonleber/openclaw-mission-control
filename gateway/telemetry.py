from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Deque, Dict, Optional


@dataclass
class TelemetryEvent:
    received_at: datetime
    dispatched_at: datetime | None
    responded_at: datetime
    agent: str
    model: Optional[str]
    error: bool = False


class TelemetryTracker:
    def __init__(self, *, window_minutes: int = 30, max_samples: int = 200) -> None:
        self._latencies: Deque[float] = deque(maxlen=max_samples)
        self._events: Deque[tuple[datetime, str, bool]] = deque(maxlen=max_samples)
        self._window = timedelta(minutes=window_minutes)
        self._lock = Lock()

    def record(self, event: TelemetryEvent) -> None:
        latency_ms = (event.responded_at - event.received_at).total_seconds() * 1000
        with self._lock:
            self._latencies.append(latency_ms)
            self._events.append((event.responded_at, event.agent or "unknown", bool(event.error)))
            self._prune()

    def snapshot(self) -> Dict[str, dict]:
        now = datetime.now(timezone.utc)
        with self._lock:
            self._prune(now)
            latencies = list(self._latencies)
            events = list(self._events)

        latency_block = self._latency_stats(latencies)
        rate_block = self._rate_stats(events, now)
        route_block = self._route_stats(events)
        error_block = self._error_stats(events)

        return {
            "latency": latency_block,
            "rate": rate_block,
            "routes": route_block,
            "errors": error_block,
        }

    def _latency_stats(self, samples: list[float]) -> Dict[str, Optional[float]]:
        if not samples:
            return {"last_ms": None, "p50_ms": None, "p95_ms": None}
        sorted_samples = sorted(samples)
        return {
            "last_ms": samples[-1],
            "p50_ms": self._percentile(sorted_samples, 0.5),
            "p95_ms": self._percentile(sorted_samples, 0.95),
        }

    @staticmethod
    def _percentile(samples: list[float], percentile: float) -> Optional[float]:
        if len(samples) == 1:
            return samples[0]
        if len(samples) < 2:
            return None
        index = percentile * (len(samples) - 1)
        lower = int(index)
        upper = min(lower + 1, len(samples) - 1)
        weight = index - lower
        return samples[lower] * (1 - weight) + samples[upper] * weight

    def _rate_stats(self, events: list[tuple[datetime, str, bool]], now: datetime) -> Dict[str, float | int]:
        window_start = now - self._window
        recent = [ts for ts, _route, _err in events if ts >= window_start]
        minutes = max(self._window.total_seconds() / 60.0, 1)
        per_minute = len(recent) / minutes
        return {
            "per_minute": per_minute,
            "window_minutes": self._window.total_seconds() / 60.0,
            "sample_size": len(events),
        }

    def _route_stats(self, events: list[tuple[datetime, str, bool]]) -> Dict[str, int]:
        counter: Counter[str] = Counter()
        for _, agent, _ in events:
            counter[agent] += 1
        return dict(counter)

    def _error_stats(self, events: list[tuple[datetime, str, bool]]) -> Dict[str, float | int]:
        if not events:
            return {"recent_rate": 0.0, "sample_size": 0}
        errors = sum(1 for _ts, _agent, err in events if err)
        rate = errors / len(events)
        return {"recent_rate": rate, "sample_size": len(events)}

    def _prune(self, now: Optional[datetime] = None) -> None:
        now = now or datetime.now(timezone.utc)
        window_start = now - self._window
        while self._events and self._events[0][0] < window_start:
            self._events.popleft()
