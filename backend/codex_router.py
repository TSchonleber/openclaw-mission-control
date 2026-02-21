"""Codex routing helpers for Nara Hub backend."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

import httpx

from cursor_adapter import call_cursor
from telemetry import TelemetryEvent

LOGGER = logging.getLogger(__name__)

CODE_HINTS = (
    r"```",
    r"class\s+\w+",
    r"def\s+\w+",
    r"function\s+\w+",
    r"import\s+\w+",
    r"#include",
    r"console\.",
    r"SELECT\s+.+FROM",
)


@dataclass
class CodexMeta:
    model: str
    route: str
    reason: str
    is_code: bool


class CodexRouter:
    """Simple heuristic router for chat vs code prompts."""

    def __init__(self, telemetry_hook: Optional[Callable[[TelemetryEvent], None]] = None) -> None:
        self._history: list[Dict[str, Any]] = []
        self._http_timeout = httpx.Timeout(45.0)
        self._openai_key = os.getenv("OPENAI_API_KEY")
        self._telemetry_hook = telemetry_hook

    def status_summary(self) -> Dict[str, Any]:
        return {
            "openai": bool(self._openai_key),
            "history": len(self._history),
        }

    async def handle_message(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        received_at = datetime.now(timezone.utc)
        text = payload.get("content", "")
        route_override = payload.get("routeOverride")
        meta = self._select_route(text, route_override)
        routed_at = datetime.now(timezone.utc)
        error = False
        try:
            assistant_text = await self._generate(text, meta)
        except Exception as exc:  # pylint: disable=broad-except
            error = True
            LOGGER.exception("Router generate failed: %s", exc)
            assistant_text = f"[router error] {exc}"
        responded_at = datetime.now(timezone.utc)
        response = {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "ts": responded_at.isoformat(),
            "route": meta.route,
            "model": meta.model,
            "meta": {"reason": meta.reason},
            "content": assistant_text,
        }
        self._history.append({"user": payload, "assistant": response})
        self._history = self._history[-50:]
        self._emit_telemetry(
            TelemetryEvent(
                received_at=received_at,
                routed_at=routed_at,
                responded_at=responded_at,
                route=meta.route,
                model=meta.model,
                error=error,
            )
        )
        return response

    async def _generate(self, prompt: str, meta: CodexMeta) -> str:
        if meta.route == "codex":
            return await self._run_codex(prompt, meta)
        return self._run_general(prompt, meta)

    def _select_route(self, text: str, explicit: str | None) -> CodexMeta:
        normalized = text or ""
        if explicit and explicit != "auto":
            if explicit == "codex":
                return CodexMeta("gpt-5.1-codex", "codex", "manual override", True)
            return CodexMeta("gpt-4.1-mini", "chat", "manual override", False)

        is_code = any(re.search(pattern, normalized, re.IGNORECASE) for pattern in CODE_HINTS)
        is_long = len(normalized.splitlines()) > 30 or len(normalized) > 1500
        if is_code:
            model = "gpt-5.2-codex" if is_long else "gpt-5.1-codex"
            return CodexMeta(model, "codex", "code heuristics matched", True)
        return CodexMeta("gpt-4.1-mini", "chat", "default chat", False)

    async def _run_codex(self, prompt: str, meta: CodexMeta) -> str:
        try:
            cursor_response = await asyncio.to_thread(call_cursor, prompt)
            if not cursor_response:
                raise RuntimeError("Empty response from Codex")
            if isinstance(cursor_response, dict):
                if cursor_response.get("error"):
                    raise RuntimeError(cursor_response["error"])
                return cursor_response.get("output") or cursor_response.get("data") or json.dumps(cursor_response, indent=2)
            return str(cursor_response)
        except Exception as exc:  # pylint: disable=broad-except
            LOGGER.warning("Codex call failed: %s", exc)
            return f"[codex fallback ({meta.model})] {exc}"

    def _run_general(self, prompt: str, meta: CodexMeta) -> str:
        preview = prompt.strip().splitlines()[:4]
        joined = " ".join(preview)
        truncated = (joined[:320] + "…") if len(joined) > 320 else joined
        return f"[{meta.model}] Logged your request. (Preview: {truncated})"

    def _emit_telemetry(self, event: TelemetryEvent) -> None:
        if self._telemetry_hook is None:
            return
        try:
            self._telemetry_hook(event)
        except Exception:  # pragma: no cover - defensive
            LOGGER.debug("Telemetry hook failed", exc_info=True)
