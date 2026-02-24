from __future__ import annotations

import asyncio
import json
import uuid
import sys
from pathlib import Path

BACKEND_PATH = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_PATH) not in sys.path:
    sys.path.append(str(BACKEND_PATH))

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import BackgroundTasks, FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from command_log import CommandLog
from openclaw_client import OpenClawError, run_agent_command
from telemetry import TelemetryEvent, TelemetryTracker

from task_service import TaskRepository, TaskCreateRequest, TaskUpdateRequest, TaskResponse, OWNER_SEQUENCE, STATUS_SEQUENCE, TaskStatus, TaskOwner
from schedule_service import ScheduleRepository, ScheduleCreateRequest, ScheduleUpdateRequest, ScheduleResponse

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://nara-hub.vercel.app",
]
app = FastAPI(title="Hub Gateway", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://nara-hub-git-[^/]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

command_log = CommandLog(max_entries=150)
telemetry = TelemetryTracker(window_minutes=30)

MEMORY_VAULT = Path(os.getenv('MEMORY_VAULT', str(Path.home() / 'Documents' / 'Agent Memory')))
OPENCLAW_ROOT = Path(os.getenv('OPENCLAW_ROOT', str(Path.home() / '.openclaw')))
WORKSPACE_AGENTS = ['iris', 'aster', 'nara', 'osiris']
tasks_repo = TaskRepository()
schedule_repo = ScheduleRepository()
ROUTE_MAP = {
    "aster": "aster",
    "nara": "main",
    "iris": "iris",
    "osiris": "osiris"
}
messages: List[Dict[str, Any]] = []
connected_clients: Set[WebSocket] = set()






def _should_include_memory(path: Path) -> bool:
    name = path.name.lower()
    if name in {"calendar.md", "index.md"}:
        return False
    if path.match('**/systems/**'):
        return False
    if path.match('**/projects/**'):
        return False
    if path.match('**/collab/**'):
        return False
    if path.match('**/people/**'):
        return False
    if path.match('**/agents/**'):
        return True
    if path.match('**/memory banks/**'):
        return True
    if path.match('**/dreams/**'):
        return True
    if name == 'memory.md':
        return True
    if path.match('**/memory/*.md'):
        return True
    return False

def _read_memory_docs(query: str | None = None, agent: str | None = None, limit: int = 200) -> list[dict]:
    docs: list[dict] = []
    query_lower = query.lower() if query else None

    def add_doc(path: Path, source: str, agent_name: str | None = None):
        try:
            content = path.read_text(encoding='utf-8')
        except Exception:
            return
        title = path.stem.replace('-', ' ').title()
        if content.startswith('#'):
            first_line = content.splitlines()[0].lstrip('#').strip()
            if first_line:
                title = first_line
        summary_lines = [line.strip() for line in content.splitlines() if line.strip() and not line.startswith('#')][:6]
        summary = ' '.join(summary_lines)
        blob = f"{title} {summary} {content}".lower()
        if query_lower and query_lower not in blob:
            return
        if agent and agent_name and agent_name.lower() != agent.lower():
            return
        docs.append({
            'id': str(path),
            'title': title,
            'summary': summary[:400],
            'agent': agent_name or 'Unknown',
            'source': source,
            'path': str(path)
        })

    # Obsidian vault
    if MEMORY_VAULT.exists():
        for md in MEMORY_VAULT.rglob('*.md'):
            if not _should_include_memory(md):
                continue
            agent_name = None
            if 'agents' in md.parts:
                agent_name = md.stem.title()
            elif 'Memory Banks' in md.parts:
                agent_name = md.stem.replace(' Memory Bank', '')
            elif 'Dreams' in md.parts:
                agent_name = md.stem.replace(' Dream Journal', '')
            add_doc(md, 'obsidian', agent_name)

    # OpenClaw workspaces
    for agent_id in WORKSPACE_AGENTS:
        workspace = OPENCLAW_ROOT / f'workspace-{agent_id}'
        if not workspace.exists():
            continue
        memory_file = workspace / 'MEMORY.md'
        if memory_file.exists():
            add_doc(memory_file, 'openclaw', agent_id.title())
        daily_dir = workspace / 'memory'
        if daily_dir.exists():
            for md in daily_dir.glob('*.md'):
                add_doc(md, 'openclaw', agent_id.title())

    return docs[:limit]


@app.middleware("http")
async def ensure_cors_headers(request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin")
    if origin and (origin in ALLOWED_ORIGINS or origin.endswith(".vercel.app")):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

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






@app.get("/intel/ops-feed")
async def ops_feed(limit: int = Query(default=50, ge=1, le=200), status_filter: str | None = Query(default=None, alias="status")) -> Dict[str, Any]:
    entries = command_log.snapshot(limit)
    if status_filter:
        entries = [entry for entry in entries if entry.status == status_filter]
    return {"entries": [entry.__dict__ for entry in entries], "ts": _now()}

@app.get("/intel/memory")
async def memory_index(q: str | None = Query(default=None), agent: str | None = Query(default=None), limit: int = Query(default=200, ge=1, le=500)) -> Dict[str, Any]:
    docs = _read_memory_docs(query=q, agent=agent, limit=limit)
    return {"entries": docs, "count": len(docs), "ts": _now()}

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

    background.add_task(_dispatch_command, agent_id, target_agent, payload, command_id)
    return {"id": command_id, "status": "queued"}




def _normalize_owner(owner: str | None) -> str | None:
    if not owner:
        return None
    for candidate in OWNER_SEQUENCE:
        if candidate.lower() == owner.lower():
            return candidate
    return None


def _normalize_status(status: str | None) -> str | None:
    if not status:
        return None
    for candidate in STATUS_SEQUENCE:
        if candidate.lower() == status.lower():
            return candidate
    return None


@app.get("/mission/tasks", response_model=list[TaskResponse])
async def mission_tasks(
    owner: str | None = Query(default=None),
    task_status: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[TaskResponse]:
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
    return record.to_response()


@app.patch("/mission/tasks/{task_id}", response_model=TaskResponse)
async def update_mission_task(task_id: str, payload: TaskUpdateRequest) -> TaskResponse:
    record = tasks_repo.update_task(task_id, payload)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return record.to_response()


@app.post("/mission/tasks/{task_id}/advance", response_model=TaskResponse)
async def advance_task(task_id: str) -> TaskResponse:
    current = tasks_repo.get_task(task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    idx = STATUS_SEQUENCE.index(current.status)
    if idx >= len(STATUS_SEQUENCE) - 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task already done")
    record = tasks_repo.advance(task_id)
    return record.to_response()


@app.post("/mission/tasks/{task_id}/rewind", response_model=TaskResponse)
async def rewind_task(task_id: str) -> TaskResponse:
    current = tasks_repo.get_task(task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    idx = STATUS_SEQUENCE.index(current.status)
    if idx <= 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task already in backlog")
    record = tasks_repo.rewind(task_id)
    return record.to_response()


@app.post("/mission/tasks/{task_id}/reassign", response_model=TaskResponse)
async def reassign_task(task_id: str) -> TaskResponse:
    current = tasks_repo.get_task(task_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    record = tasks_repo.reassign(task_id)
    return record.to_response()


@app.post("/mission/tasks/{task_id}/complete", response_model=TaskResponse)
async def complete_task(task_id: str) -> TaskResponse:
    record = tasks_repo.set_status(task_id, TaskStatus.done.value)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return record.to_response()


@app.get("/mission/schedule", response_model=list[ScheduleResponse])
async def mission_schedule(limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0)) -> list[ScheduleResponse]:
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


async def _dispatch_command(agent_id: str, target_agent: str, payload: CommandPayload, command_id: str) -> None:
    dispatched = command_log.mark_dispatched(command_id)
    if dispatched:
        await _broadcast({"type": "command_log", "entry": dispatched.__dict__})

    received_at = datetime.now(timezone.utc)
    try:
        try:
            response = await run_agent_command(
                agent=target_agent,
                message=payload.message,
                session_id=payload.sessionId,
                thinking=payload.thinking,
            )
        except OpenClawError as exc:
            if payload.sessionId and "Invalid session ID" in str(exc):
                response = await run_agent_command(
                    agent=target_agent,
                    message=payload.message,
                    session_id=None,
                    thinking=payload.thinking,
                )
            else:
                raise
        responded_at = datetime.now(timezone.utc)
        meta = response.get("meta", {})
        agent_meta = meta.get("agentMeta", {}) if isinstance(meta, dict) else {}
        model = agent_meta.get("model") or response.get("model")

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

        payload_root = response.get("result") if isinstance(response.get("result"), dict) else response
        content = payload_root.get("message") or payload_root.get("content")
        if not content:
            payloads = payload_root.get("payloads") or response.get("payloads") or []
            if payloads:
                first = payloads[0] or {}
                content = first.get("text") or first.get("content")
        if not content:
            data = payload_root.get("response") or response.get("response") or {}
            content = data.get("message") or data.get("content") or ''
        message_payload = {
            "id": response.get("id") or command_id,
            "role": "assistant",
            "content": content,
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
