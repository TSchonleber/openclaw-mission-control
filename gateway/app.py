from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import BackgroundTasks, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from command_log import CommandLog
from openclaw_client import OpenClawError, run_agent_command
from telemetry import TelemetryEvent, TelemetryTracker

app = FastAPI(title="Hub Gateway", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

command_log = CommandLog(max_entries=150)
telemetry = TelemetryTracker(window_minutes=30)
ROUTE_MAP = {
    "aster": "aster",
    "nara": "main",
    "iris": "iris",
    "osiris": "osiris"
}
messages: List[Dict[str, Any]] = []
connected_clients: Set[WebSocket] = set()


class CommandPayload(BaseModel):
    message: str = Field(..., min_length=1)
    sessionId: Optional[str] = None
    thinking: Optional[str] = Field(default=None, pattern=r"^(off|minimal|low|medium|high)?$")


@app.get("/")
async def root() -> Dict[str, Any]:
    return {"service": "hub-gateway", "status": "ok"}


@app.get("/telemetry")
async def telemetry_snapshot() -> Dict[str, Any]:
    return {"type": "telemetry", "payload": telemetry.snapshot(), "ts": _now()}


@app.get("/command-log")
async def command_log_snapshot(limit: int = 100) -> Dict[str, Any]:
    return {"entries": command_log.snapshot(limit), "ts": _now()}


@app.get("/status")
async def status_snapshot() -> Dict[str, Any]:
    latest_messages = messages[-50:]
    agents = {}
    for entry in reversed(latest_messages):
        agent = entry.get("agent")
        if agent and agent not in agents:
            agents[agent] = {
                "last_message": entry.get("ts"),
                "model": entry.get("model"),
            }
    return {"agents": agents, "ts": _now()}


@app.post("/routes/{agent_id}/messages")
async def send_command(agent_id: str, payload: CommandPayload, background: BackgroundTasks) -> Dict[str, Any]:
    target_agent = ROUTE_MAP.get(agent_id, agent_id)
    command_id = str(uuid.uuid4())
    staged_entry = command_log.stage(command_id, payload.message, agent_id, payload.sessionId)
    await _broadcast({"type": "command_log", "entry": staged_entry.__dict__})

    background.add_task(_dispatch_command, agent_id, payload, command_id)
    return {"id": command_id, "status": "queued"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    connected_clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "telemetry", "payload": telemetry.snapshot(), "ts": _now()}))
        await ws.send_text(json.dumps({"type": "command_log", "entries": command_log.snapshot(), "ts": _now()}))
        while True:
            await ws.receive_text()  # keepalive (clients generally won't send anything)
    except WebSocketDisconnect:
        pass
    finally:
        connected_clients.discard(ws)


async def _dispatch_command(agent_id: str, payload: CommandPayload, command_id: str) -> None:
    dispatched = command_log.mark_dispatched(command_id)
    if dispatched:
        await _broadcast({"type": "command_log", "entry": dispatched.__dict__})

    received_at = datetime.now(timezone.utc)
    try:
        response = await run_agent_command(
            agent=target_agent,
            message=payload.message,
            session_id=payload.sessionId,
            thinking=payload.thinking,
        )
        responded_at = datetime.now(timezone.utc)
        model = response.get("model") or response.get("meta", {}).get("model")

        completed = command_log.mark_completed(command_id, model=model, route=agent_id)
        if completed:
            await _broadcast({"type": "command_log", "entry": completed.__dict__})

        dispatched_at = None
        if completed and completed.ts_dispatched:
            try:
                dispatched_at = datetime.fromisoformat(completed.ts_dispatched)
            except ValueError:
                dispatched_at = received_at
        telemetry.record(
            TelemetryEvent(
                received_at=received_at,
                dispatched_at=dispatched_at,
                responded_at=responded_at,
                agent=agent_id,
                model=model,
                error=False,
            )
        )
        await _broadcast({"type": "telemetry", "payload": telemetry.snapshot(), "ts": _now()})

        message_payload = {
            "id": response.get("id") or command_id,
            "role": "assistant",
            "content": response.get("message") or response.get("content"),
            "route": agent_id,
            "model": model,
            "ts": responded_at.isoformat(),
            "agent": agent_id,
        }
        messages.append(message_payload)
        await _broadcast({"type": "message", "message": message_payload})
    except OpenClawError as exc:
        error_entry = command_log.mark_error(command_id, str(exc))
        if error_entry:
            await _broadcast({"type": "command_log", "entry": error_entry.__dict__})
        telemetry.record(
            TelemetryEvent(
                received_at=received_at,
                dispatched_at=received_at,
                responded_at=datetime.now(timezone.utc),
                agent=agent_id,
                model=None,
                error=True,
            )
        )
        await _broadcast({"type": "telemetry", "payload": telemetry.snapshot(), "ts": _now()})


async def _broadcast(payload: Dict[str, Any]) -> None:
    if not connected_clients:
        return
    message = json.dumps(payload)
    dead: List[WebSocket] = []
    for ws in connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_clients.discard(ws)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
