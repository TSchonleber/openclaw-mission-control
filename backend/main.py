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
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState

from codex_router import CodexRouter
from command_log import CommandLog, CommandEntry
from telemetry import TelemetryTracker
from task_service import (
    OWNER_SEQUENCE,
    STATUS_SEQUENCE,
    TaskCreateRequest,
    TaskRepository,
    TaskResponse,
    TaskUpdateRequest,
)
from schedule_service import (
    ScheduleRepository,
    ScheduleResponse,
    ScheduleCreateRequest,
    ScheduleUpdateRequest,
)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Nara Hub Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

telemetry_tracker = TelemetryTracker(window_minutes=30)
command_log = CommandLog(max_entries=100)
router = CodexRouter(telemetry_hook=telemetry_tracker.record)
tasks_repo = TaskRepository()
schedule_repo = ScheduleRepository()
ACTIVE_CONNECTIONS: set[WebSocket] = set()


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


@app.get("/telemetry")
def telemetry_snapshot() -> Dict[str, Any]:
    return {
        "type": "telemetry",
        "payload": telemetry_tracker.snapshot(),
        "ts": _now_iso(),
    }


@app.get("/command-log")
def command_log_snapshot(limit: int = 100) -> Dict[str, Any]:
    entries = command_log.snapshot(limit=limit)
    return {"entries": entries, "ts": _now_iso()}


@app.get("/mission/tasks", response_model=list[TaskResponse])
async def mission_tasks(
    owner: Optional[str] = Query(default=None),
    task_status: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> List[TaskResponse]:
    normalized_owner = _normalize_owner(owner)
    normalized_status = _normalize_status(task_status)
    records = tasks_repo.list_tasks(
        owner=normalized_owner,
        status=normalized_status,
        search=search,
        limit=limit,
        offset=offset,
    )
    return [record.to_response() for record in records]


@app.post("/mission/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_mission_task(payload: TaskCreateRequest) -> TaskResponse:
    record = tasks_repo.create_task(payload)
    response = record.to_response()
    await _broadcast_task_event("created", response)
    return response


@app.patch("/mission/tasks/{task_id}", response_model=TaskResponse)
async def update_mission_task(task_id: str, payload: TaskUpdateRequest) -> TaskResponse:
    record = tasks_repo.update_task(task_id, payload)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    response = record.to_response()
    await _broadcast_task_event("updated", response)
    return response


@app.post("/mission/tasks/{task_id}/advance", response_model=TaskResponse)
async def advance_task(task_id: str) -> TaskResponse:
    current = tasks_repo.get_task(task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    idx = STATUS_SEQUENCE.index(current.status)
    if idx >= len(STATUS_SEQUENCE) - 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task already done")
    record = tasks_repo.advance(task_id)
    response = record.to_response()
    await _broadcast_task_event("updated", response)
    return response


@app.post("/mission/tasks/{task_id}/rewind", response_model=TaskResponse)
async def rewind_task(task_id: str) -> TaskResponse:
    current = tasks_repo.get_task(task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    idx = STATUS_SEQUENCE.index(current.status)
    if idx <= 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task already in backlog")
    record = tasks_repo.rewind(task_id)
    response = record.to_response()
    await _broadcast_task_event("updated", response)
    return response




@app.get("/mission/schedule", response_model=list[ScheduleResponse])
async def mission_schedule(limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0)) -> List[ScheduleResponse]:
    records = schedule_repo.list_events(limit=limit, offset=offset)
    return [record.to_response() for record in records]


@app.post("/mission/schedule", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule_event(payload: ScheduleCreateRequest) -> ScheduleResponse:
    record = schedule_repo.create_event(payload)
    return record.to_response()


@app.patch("/mission/schedule/{event_id}", response_model=ScheduleResponse)
async def update_schedule_event(event_id: str, payload: ScheduleUpdateRequest) -> ScheduleResponse:
    record = schedule_repo.update_event(event_id, payload)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return record.to_response()
@app.post("/mission/tasks/{task_id}/reassign", response_model=TaskResponse)
async def reassign_task(task_id: str) -> TaskResponse:
    current = tasks_repo.get_task(task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    record = tasks_repo.reassign(task_id)
    response = record.to_response()
    await _broadcast_task_event("updated", response)
    return response


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    ACTIVE_CONNECTIONS.add(ws)
    heartbeat = asyncio.create_task(_telemetry_heartbeat(ws))
    await ws.send_json(
        {
            "id": str(uuid.uuid4()),
            "role": "system",
            "content": "Connected to Nara Hub backend.",
            "ts": _now_iso(),
            "route": "system",
        }
    )
    await ws.send_json(_telemetry_payload())

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

            staged_entry = command_log.stage(
                command_id=data["id"],
                text=data["content"],
                route_override=data.get("routeOverride"),
            )
            await _broadcast_command_event(staged_entry)

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

            dispatched_entry = command_log.mark_dispatched(data["id"])
            if dispatched_entry:
                await _broadcast_command_event(dispatched_entry)

            try:
                response = await router.handle_message(data)
                completed_entry = command_log.mark_completed(
                    data["id"],
                    model=response.get("model"),
                    route=response.get("route"),
                )
                if completed_entry:
                    await _broadcast_command_event(completed_entry)
                await ws.send_json(response)
                await _broadcast_telemetry()
            except Exception as exc:  # pylint: disable=broad-except
                error_entry = command_log.mark_error(data["id"], str(exc))
                if error_entry:
                    await _broadcast_command_event(error_entry)
                logging.exception("WebSocket handling failed: %s", exc)
                await ws.send_json(
                    {
                        "id": str(uuid.uuid4()),
                        "role": "system",
                        "content": "Backend error encountered. Check logs.",
                        "ts": _now_iso(),
                        "route": "error",
                    }
                )
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
    finally:
        ACTIVE_CONNECTIONS.discard(ws)
        heartbeat.cancel()


async def _telemetry_heartbeat(ws: WebSocket) -> None:
    try:
        while True:
            await asyncio.sleep(10)
            if ws.application_state != WebSocketState.CONNECTED:
                break
            await ws.send_json(_telemetry_payload())
    except asyncio.CancelledError:  # pragma: no cover
        return
    except Exception:  # pragma: no cover
        logging.debug("Telemetry heartbeat failed", exc_info=True)


async def _broadcast_command_event(entry: CommandEntry) -> None:
    await _broadcast({"type": "command_log", "entry": asdict(entry)})


async def _broadcast_telemetry() -> None:
    await _broadcast(_telemetry_payload())


async def _broadcast_task_event(event: str, task: TaskResponse) -> None:
    await _broadcast(
        {"type": "task_event", "event": event, "task": task.dict(by_alias=True)}
    )


def _telemetry_payload() -> Dict[str, Any]:
    return {
        "type": "telemetry",
        "payload": telemetry_tracker.snapshot(),
        "ts": _now_iso(),
    }


async def _broadcast(message: Dict[str, Any]) -> None:
    dead: List[WebSocket] = []
    for client in list(ACTIVE_CONNECTIONS):
        try:
            if client.application_state == WebSocketState.CONNECTED:
                await client.send_json(message)
            else:
                dead.append(client)
        except Exception:
            dead.append(client)
    for client in dead:
        ACTIVE_CONNECTIONS.discard(client)


def _normalize_owner(owner: Optional[str]) -> Optional[str]:
    if owner is None:
        return None
    match = next((value for value in OWNER_SEQUENCE if value.lower() == owner.lower()), None)
    if match is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown owner")
    return match


def _normalize_status(task_status: Optional[str]) -> Optional[str]:
    if task_status is None:
        return None
    match = next(
        (value for value in STATUS_SEQUENCE if value.lower() == task_status.lower()), None
    )
    if match is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown status")
    return match


def _coerce_payload(raw: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"content": raw}
    parsed.setdefault("id", str(uuid.uuid4()))
    parsed.setdefault("role", "user")
    parsed.setdefault("ts", _now_iso())
    return parsed
