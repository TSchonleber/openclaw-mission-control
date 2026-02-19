"""Nara Hub backend service.

Provides a FastAPI app with a websocket endpoint that proxies
messages to the Codex router. The router decides whether the
message should be treated as a plain chat prompt or a code-heavy
prompt that should hit the Cursor Codex adapter.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState

from codex_router import CodexRouter

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Nara Hub Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = CodexRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "service": "nara-hub-backend",
        "status": "ok",
        "codex": router.status_summary(),
        "timestamp": _now_iso(),
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    await ws.send_json(
        {
            "id": str(uuid.uuid4()),
            "role": "system",
            "content": "Connected to Nara Hub backend.",
            "ts": _now_iso(),
            "route": "system",
        }
    )

    try:
        while True:
            payload = await ws.receive_text()
            data = _coerce_payload(payload)
            if not data["content"].strip():
                await ws.send_json(
                    {
                        "id": str(uuid.uuid4()),
                        "role": "system",
                        "content": "Empty message ignored.",
                        "ts": _now_iso(),
                        "route": "system",
                    }
                )
                continue

            await ws.send_json(
                {
                    "id": data["id"],
                    "role": "user",
                    "content": data["content"],
                    "ts": data.get("ts", _now_iso()),
                    "route": data.get("route", "user"),
                    "pending": False,
                }
            )

            response = await router.handle_message(data)
            await ws.send_json(response)
    except WebSocketDisconnect:
        logging.info("WebSocket disconnected")
    except Exception as exc:  # pylint: disable=broad-except
        logging.exception("WebSocket error: %%s", exc)
        if ws.application_state == WebSocketState.CONNECTED:
            await ws.send_json(
                {
                    "id": str(uuid.uuid4()),
                    "role": "system",
                    "content": "Backend error encountered. Check logs.",
                    "ts": _now_iso(),
                    "route": "error",
                }
            )
            await asyncio.sleep(0)
            await ws.close(code=1011, reason="server error")


def _coerce_payload(raw: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"content": raw}
    parsed.setdefault("id", str(uuid.uuid4()))
    parsed.setdefault("role", "user")
    parsed.setdefault("ts", _now_iso())
    return parsed
