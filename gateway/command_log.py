from __future__ import annotations

from collections import OrderedDict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import List, Optional


@dataclass
class CommandEntry:
    id: str
    text: str
    agent: str
    session_id: Optional[str]
    status: str
    ts_received: str
    ts_dispatched: Optional[str] = None
    ts_completed: Optional[str] = None
    ts_error: Optional[str] = None
    model: Optional[str] = None
    route: Optional[str] = None
    error_message: Optional[str] = None


class CommandLog:
    def __init__(self, max_entries: int = 100) -> None:
        self._entries: "OrderedDict[str, CommandEntry]" = OrderedDict()
        self._max_entries = max_entries
        self._lock = Lock()

    def stage(self, command_id: str, text: str, agent: str, session_id: Optional[str]) -> CommandEntry:
        now = self._now()
        entry = CommandEntry(
            id=command_id,
            text=text,
            agent=agent,
            session_id=session_id,
            status="staged",
            ts_received=now,
        )
        with self._lock:
            self._entries[command_id] = entry
            self._trim()
        return entry

    def mark_dispatched(self, command_id: str) -> Optional[CommandEntry]:
        return self._transition(command_id, "dispatched", field="ts_dispatched")

    def mark_completed(self, command_id: str, *, model: Optional[str], route: Optional[str]) -> Optional[CommandEntry]:
        entry = self._transition(command_id, "completed", field="ts_completed")
        if entry:
            entry.model = model
            entry.route = route
        return entry

    def mark_error(self, command_id: str, message: str) -> Optional[CommandEntry]:
        entry = self._transition(command_id, "error", field="ts_error")
        if entry:
            entry.error_message = message
        return entry

    def snapshot(self, limit: int = 100) -> List[dict]:
        with self._lock:
            items = list(self._entries.values())[-limit:]
        return [asdict(entry) for entry in reversed(items)]

    def _transition(self, command_id: str, status: str, *, field: str) -> Optional[CommandEntry]:
        with self._lock:
            entry = self._entries.get(command_id)
            if not entry:
                return None
            setattr(entry, "status", status)
            setattr(entry, field, self._now())
            return entry

    def _trim(self) -> None:
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()
