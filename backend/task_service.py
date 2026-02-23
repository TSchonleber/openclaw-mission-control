from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import List, Optional, TYPE_CHECKING


if TYPE_CHECKING:
    from ingest.schemas import IngestTask
from pydantic import BaseModel, Field, validator


OWNER_SEQUENCE: List[str] = ["Iris", "Terrence", "Nara", "Aster", "Osiris"]
STATUS_SEQUENCE: List[str] = ["backlog", "in-progress", "review", "done"]

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskOwner(str, Enum):
    iris = "Iris"
    terrence = "Terrence"
    nara = "Nara"
    aster = "Aster"
    osiris = "Osiris"
    unknown = "Unknown"


class TaskStatus(str, Enum):
    backlog = "backlog"
    in_progress = "in-progress"
    review = "review"
    done = "done"


class TaskCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    owner: TaskOwner = Field(default=TaskOwner.iris)
    status: TaskStatus = Field(default=TaskStatus.backlog)
    blockerFlag: bool = Field(default=False, alias="blockerFlag")
    tags: List[str] = Field(default_factory=list)
    readOnly: bool = Field(default=False, alias="readOnly")
    source: Optional[str] = None
    sourceId: Optional[str] = Field(default=None, alias="sourceId")
    lastSyncedAt: Optional[str] = Field(default=None, alias="lastSyncedAt")

    class Config:
        allow_population_by_field_name = True

    @validator("title")
    def _validate_title(cls, value: str) -> str:  # pylint: disable=no-self-argument
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value


class TaskUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[TaskOwner] = None
    status: Optional[TaskStatus] = None
    blockerFlag: Optional[bool] = Field(default=None, alias="blockerFlag")
    tags: Optional[List[str]] = None
    readOnly: Optional[bool] = Field(default=None, alias="readOnly")
    lastSyncedAt: Optional[str] = Field(default=None, alias="lastSyncedAt")

    class Config:
        allow_population_by_field_name = True

    @validator("title")
    def _validate_optional_title(cls, value: Optional[str]) -> Optional[str]:  # pylint: disable=no-self-argument
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @validator("tags")
    def _strip_none_tags(cls, value: Optional[List[str]]) -> Optional[List[str]]:  # pylint: disable=no-self-argument
        if value is None:
            return None
        return [tag for tag in value if isinstance(tag, str) and tag.strip()]


class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    owner: TaskOwner
    status: TaskStatus
    blockerFlag: bool = Field(alias="blockerFlag")
    tags: List[str]
    createdAt: str = Field(alias="createdAt")
    updatedAt: str = Field(alias="updatedAt")
    readOnly: bool = Field(alias="readOnly")
    source: Optional[str]
    sourceId: Optional[str] = Field(default=None, alias="sourceId")
    lastSyncedAt: Optional[str] = Field(default=None, alias="lastSyncedAt")

    class Config:
        allow_population_by_field_name = True


@dataclass
class TaskRecord:
    id: str
    title: str
    description: Optional[str]
    owner: str
    status: str
    blocker_flag: bool
    tags: List[str]
    created_at: str
    updated_at: str
    read_only: bool
    source: Optional[str]
    source_id: Optional[str]
    last_synced_at: Optional[str]

    def to_response(self) -> TaskResponse:
        return TaskResponse(
            id=self.id,
            title=self.title,
            description=self.description,
            owner=self.owner,
            status=self.status,
            blockerFlag=self.blocker_flag,
            tags=self.tags,
            createdAt=self.created_at,
            updatedAt=self.updated_at,
            readOnly=self.read_only,
            source=self.source,
            sourceId=self.source_id,
            lastSyncedAt=self.last_synced_at,
        )


class TaskRepository:
    def __init__(self, db_path: Optional[Path] = None) -> None:
        base_path = db_path or Path(__file__).resolve().parent / "mission_tasks.db"
        self._conn = sqlite3.connect(base_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS mission_tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    owner TEXT NOT NULL,
                    status TEXT NOT NULL,
                    blocker_flag INTEGER NOT NULL DEFAULT 0,
                    tags TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    source TEXT,
                    source_id TEXT,
                    last_synced_at TEXT,
                    read_only INTEGER NOT NULL DEFAULT 0
                )
                """
            )
        self._ensure_extended_columns()

    def _ensure_extended_columns(self) -> None:
        columns = {row[1] for row in self._conn.execute("PRAGMA table_info(mission_tasks)")}
        statements = []
        if "source" not in columns:
            statements.append("ALTER TABLE mission_tasks ADD COLUMN source TEXT")
        if "source_id" not in columns:
            statements.append("ALTER TABLE mission_tasks ADD COLUMN source_id TEXT")
        if "last_synced_at" not in columns:
            statements.append("ALTER TABLE mission_tasks ADD COLUMN last_synced_at TEXT")
        if "read_only" not in columns:
            statements.append("ALTER TABLE mission_tasks ADD COLUMN read_only INTEGER NOT NULL DEFAULT 0")
        with self._conn:
            for stmt in statements:
                try:
                    self._conn.execute(stmt)
                except sqlite3.OperationalError:
                    continue
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON mission_tasks(updated_at)")
            self._conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_id ON mission_tasks(source_id)")

    def list_tasks(
        self,
        owner: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[TaskRecord]:
        query = ["SELECT * FROM mission_tasks WHERE 1=1"]
        params: List[object] = []
        if owner:
            query.append("AND owner = ?")
            params.append(owner)
        if status:
            query.append("AND status = ?")
            params.append(status)
        if search:
            query.append("AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)")
            like = f"%{search.lower()}%"
            params.extend([like, like])
        query.append("ORDER BY datetime(updated_at) DESC LIMIT ? OFFSET ?")
        params.extend([limit, offset])
        rows = self._conn.execute(" ".join(query), params).fetchall()
        return [self._row_to_record(row) for row in rows]

    def get_task(self, task_id: str) -> Optional[TaskRecord]:
        row = self._conn.execute(
            "SELECT * FROM mission_tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not row:
            return None
        return self._row_to_record(row)

    def create_task(self, payload: TaskCreateRequest) -> TaskRecord:
        now = _now_iso()
        task_id = str(uuid.uuid4())
        record = TaskRecord(
            id=task_id,
            title=payload.title.strip(),
            description=payload.description.strip() if payload.description else None,
            owner=payload.owner.value,
            status=payload.status.value,
            blocker_flag=bool(payload.blockerFlag),
            tags=payload.tags,
            created_at=now,
            updated_at=now,
            read_only=bool(payload.readOnly),
            source=payload.source,
            source_id=payload.sourceId,
            last_synced_at=payload.lastSyncedAt,
        )
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO mission_tasks (
                    id, title, description, owner, status, blocker_flag, tags, created_at, updated_at, source, source_id, last_synced_at, read_only
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.title,
                    record.description,
                    record.owner,
                    record.status,
                    int(record.blocker_flag),
                    json.dumps(record.tags),
                    record.created_at,
                    record.updated_at,
                    record.source,
                    record.source_id,
                    record.last_synced_at,
                    int(record.read_only),
                ),
            )
        return record

    def update_task(self, task_id: str, payload: TaskUpdateRequest) -> Optional[TaskRecord]:
        current = self.get_task(task_id)
        if not current:
            return None
        updated = TaskRecord(
            id=current.id,
            title=payload.title.strip() if payload.title else current.title,
            description=payload.description.strip() if payload.description else current.description,
            owner=payload.owner.value if payload.owner else current.owner,
            status=payload.status.value if payload.status else current.status,
            blocker_flag=current.blocker_flag if payload.blockerFlag is None else bool(payload.blockerFlag),
            tags=current.tags if payload.tags is None else payload.tags,
            created_at=current.created_at,
            updated_at=_now_iso(),
            read_only=current.read_only if payload.readOnly is None else bool(payload.readOnly),
            source=current.source,
            source_id=current.source_id,
            last_synced_at=payload.lastSyncedAt if payload.lastSyncedAt is not None else current.last_synced_at,
        )
        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE mission_tasks
                SET title = ?, description = ?, owner = ?, status = ?, blocker_flag = ?, tags = ?, updated_at = ?, read_only = ?, last_synced_at = ?
                WHERE id = ?
                """,
                (
                    updated.title,
                    updated.description,
                    updated.owner,
                    updated.status,
                    int(updated.blocker_flag),
                    json.dumps(updated.tags),
                    updated.updated_at,
                    int(updated.read_only),
                    updated.last_synced_at,
                    updated.id,
                ),
            )
        return updated

    def set_status(self, task_id: str, new_status: str) -> Optional[TaskRecord]:
        payload = TaskUpdateRequest(status=TaskStatus(new_status))
        return self.update_task(task_id, payload)

    def advance(self, task_id: str) -> Optional[TaskRecord]:
        current = self.get_task(task_id)
        if not current:
            return None
        idx = STATUS_SEQUENCE.index(current.status)
        if idx >= len(STATUS_SEQUENCE) - 1:
            return current
        next_status = STATUS_SEQUENCE[idx + 1]
        return self.set_status(task_id, next_status)

    def rewind(self, task_id: str) -> Optional[TaskRecord]:
        current = self.get_task(task_id)
        if not current:
            return None
        idx = STATUS_SEQUENCE.index(current.status)
        if idx <= 0:
            return current
        prev_status = STATUS_SEQUENCE[idx - 1]
        return self.set_status(task_id, prev_status)

    def reassign(self, task_id: str) -> Optional[TaskRecord]:
        current = self.get_task(task_id)
        if not current:
            return None
        idx = OWNER_SEQUENCE.index(current.owner) if current.owner in OWNER_SEQUENCE else 0
        next_owner = OWNER_SEQUENCE[(idx + 1) % len(OWNER_SEQUENCE)]
        payload = TaskUpdateRequest(owner=TaskOwner(next_owner))
        return self.update_task(task_id, payload)

    def upsert_from_ingest(self, ingest_task: "IngestTask") -> TaskRecord:
        now = _now_iso()
        owner_value = getattr(ingest_task.owner, "value", ingest_task.owner) or TaskOwner.unknown.value
        status_value = getattr(ingest_task.status, "value", ingest_task.status) or TaskStatus.backlog.value
        read_only = True
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT * FROM mission_tasks WHERE source_id = ?",
                (ingest_task.source_id,),
            ).fetchone()
            if row:
                current = self._row_to_record(row)
                if not current.read_only:
                    return current
                updated = TaskRecord(
                    id=current.id,
                    title=ingest_task.title.strip(),
                    description=ingest_task.description or current.description,
                    owner=owner_value,
                    status=status_value,
                    blocker_flag=current.blocker_flag,
                    tags=ingest_task.tags or current.tags,
                    created_at=current.created_at,
                    updated_at=now,
                    read_only=read_only,
                    source=ingest_task.source,
                    source_id=ingest_task.source_id,
                    last_synced_at=now,
                )
                self._conn.execute(
                    """
                    UPDATE mission_tasks
                    SET title = ?, description = ?, owner = ?, status = ?, tags = ?, updated_at = ?, read_only = ?, last_synced_at = ?, blocker_flag = ?, source = ?
                    WHERE id = ?
                    """,
                    (
                        updated.title,
                        updated.description,
                        updated.owner,
                        updated.status,
                        json.dumps(updated.tags),
                        updated.updated_at,
                        int(updated.read_only),
                        updated.last_synced_at,
                        int(updated.blocker_flag),
                        updated.source,
                        updated.id,
                    ),
                )
                return updated
            record = TaskRecord(
                id=str(uuid.uuid4()),
                title=ingest_task.title.strip(),
                description=ingest_task.description,
                owner=owner_value,
                status=status_value,
                blocker_flag=False,
                tags=ingest_task.tags,
                created_at=now,
                updated_at=now,
                read_only=read_only,
                source=ingest_task.source,
                source_id=ingest_task.source_id,
                last_synced_at=now,
            )
            self._conn.execute(
                """
                INSERT INTO mission_tasks (id, title, description, owner, status, blocker_flag, tags, created_at, updated_at, source, source_id, last_synced_at, read_only)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.title,
                    record.description,
                    record.owner,
                    record.status,
                    int(record.blocker_flag),
                    json.dumps(record.tags),
                    record.created_at,
                    record.updated_at,
                    record.source,
                    record.source_id,
                    record.last_synced_at,
                    int(record.read_only),
                ),
            )
            return record

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> TaskRecord:
        return TaskRecord(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            owner=row["owner"],
            status=row["status"],
            blocker_flag=bool(row["blocker_flag"]),
            tags=json.loads(row["tags"] or "[]"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            read_only=bool(row["read_only"]),
            source=row["source"],
            source_id=row["source_id"],
            last_synced_at=row["last_synced_at"],
        )
