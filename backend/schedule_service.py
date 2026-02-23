from __future__ import annotations

import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, TYPE_CHECKING


if TYPE_CHECKING:
    from ingest.schemas import IngestEvent
from pydantic import BaseModel, Field, validator

from .task_service import TaskOwner


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ScheduleCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    owner: Optional[TaskOwner] = None
    startAt: str = Field(alias="startAt")
    endAt: Optional[str] = Field(default=None, alias="endAt")
    location: Optional[str] = None
    readOnly: bool = Field(default=False, alias="readOnly")
    source: Optional[str] = None
    sourceId: Optional[str] = Field(default=None, alias="sourceId")

    class Config:
        allow_population_by_field_name = True

    @validator("title")
    def _validate_title(cls, value: str) -> str:  # pylint: disable=no-self-argument
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value


class ScheduleUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[TaskOwner] = None
    startAt: Optional[str] = Field(default=None, alias="startAt")
    endAt: Optional[str] = Field(default=None, alias="endAt")
    location: Optional[str] = None
    readOnly: Optional[bool] = Field(default=None, alias="readOnly")

    class Config:
        allow_population_by_field_name = True


class ScheduleResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    owner: Optional[TaskOwner]
    startAt: str = Field(alias="startAt")
    endAt: Optional[str] = Field(alias="endAt")
    location: Optional[str]
    readOnly: bool = Field(alias="readOnly")
    source: Optional[str]
    sourceId: Optional[str] = Field(default=None, alias="sourceId")
    createdAt: str = Field(alias="createdAt")
    updatedAt: str = Field(alias="updatedAt")

    class Config:
        allow_population_by_field_name = True


@dataclass
class ScheduleRecord:
    id: str
    title: str
    description: Optional[str]
    owner: Optional[str]
    start_at: str
    end_at: Optional[str]
    location: Optional[str]
    read_only: bool
    source: Optional[str]
    source_id: Optional[str]
    created_at: str
    updated_at: str

    def to_response(self) -> ScheduleResponse:
        return ScheduleResponse(
            id=self.id,
            title=self.title,
            description=self.description,
            owner=self.owner,
            startAt=self.start_at,
            endAt=self.end_at,
            location=self.location,
            readOnly=self.read_only,
            source=self.source,
            sourceId=self.source_id,
            createdAt=self.created_at,
            updatedAt=self.updated_at,
        )


class ScheduleRepository:
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
                CREATE TABLE IF NOT EXISTS mission_schedule (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    owner TEXT,
                    start_at TEXT NOT NULL,
                    end_at TEXT,
                    location TEXT,
                    read_only INTEGER NOT NULL DEFAULT 0,
                    source TEXT,
                    source_id TEXT UNIQUE,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def list_events(self, limit: int = 200, offset: int = 0) -> List[ScheduleRecord]:
        rows = self._conn.execute(
            "SELECT * FROM mission_schedule ORDER BY datetime(start_at) ASC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [self._row_to_record(row) for row in rows]

    def create_event(self, payload: ScheduleCreateRequest) -> ScheduleRecord:
        now = _now_iso()
        record = ScheduleRecord(
            id=str(uuid.uuid4()),
            title=payload.title.strip(),
            description=payload.description.strip() if payload.description else None,
            owner=payload.owner.value if payload.owner else None,
            start_at=payload.startAt,
            end_at=payload.endAt,
            location=payload.location,
            read_only=bool(payload.readOnly),
            source=payload.source,
            source_id=payload.sourceId,
            created_at=now,
            updated_at=now,
        )
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO mission_schedule (id, title, description, owner, start_at, end_at, location, read_only, source, source_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.title,
                    record.description,
                    record.owner,
                    record.start_at,
                    record.end_at,
                    record.location,
                    int(record.read_only),
                    record.source,
                    record.source_id,
                    record.created_at,
                    record.updated_at,
                ),
            )
        return record

    def update_event(self, event_id: str, payload: ScheduleUpdateRequest) -> Optional[ScheduleRecord]:
        current = self.get_event(event_id)
        if not current:
            return None
        updated = ScheduleRecord(
            id=current.id,
            title=payload.title.strip() if payload.title else current.title,
            description=payload.description.strip() if payload.description else current.description,
            owner=payload.owner.value if payload.owner else current.owner,
            start_at=payload.startAt if payload.startAt else current.start_at,
            end_at=payload.endAt if payload.endAt else current.end_at,
            location=payload.location if payload.location is not None else current.location,
            read_only=current.read_only if payload.readOnly is None else bool(payload.readOnly),
            source=current.source,
            source_id=current.source_id,
            created_at=current.created_at,
            updated_at=_now_iso(),
        )
        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE mission_schedule
                SET title = ?, description = ?, owner = ?, start_at = ?, end_at = ?, location = ?, read_only = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    updated.title,
                    updated.description,
                    updated.owner,
                    updated.start_at,
                    updated.end_at,
                    updated.location,
                    int(updated.read_only),
                    updated.updated_at,
                    updated.id,
                ),
            )
        return updated

    def get_event(self, event_id: str) -> Optional[ScheduleRecord]:
        row = self._conn.execute(
            "SELECT * FROM mission_schedule WHERE id = ?",
            (event_id,),
        ).fetchone()
        if not row:
            return None
        return self._row_to_record(row)

    def upsert_from_ingest(self, ingest_event: "IngestEvent") -> ScheduleRecord:
        now = _now_iso()
        owner_value = getattr(ingest_event.owner, "value", ingest_event.owner)
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT * FROM mission_schedule WHERE source_id = ?",
                (ingest_event.source_id,),
            ).fetchone()
            if row:
                current = self._row_to_record(row)
                if not current.read_only:
                    return current
                updated = ScheduleRecord(
                    id=current.id,
                    title=ingest_event.title.strip(),
                    description=ingest_event.description or current.description,
                    owner=owner_value,
                    start_at=ingest_event.start.isoformat(),
                    end_at=ingest_event.end.isoformat() if ingest_event.end else current.end_at,
                    location=ingest_event.location or current.location,
                    read_only=True,
                    source=ingest_event.source,
                    source_id=ingest_event.source_id,
                    created_at=current.created_at,
                    updated_at=now,
                )
                self._conn.execute(
                    """
                    UPDATE mission_schedule
                    SET title = ?, description = ?, owner = ?, start_at = ?, end_at = ?, location = ?, read_only = ?, updated_at = ?, source = ?
                    WHERE id = ?
                    """,
                    (
                        updated.title,
                        updated.description,
                        updated.owner,
                        updated.start_at,
                        updated.end_at,
                        updated.location,
                        int(updated.read_only),
                        updated.updated_at,
                        updated.source,
                        updated.id,
                    ),
                )
                return updated
            record = ScheduleRecord(
                id=str(uuid.uuid4()),
                title=ingest_event.title.strip(),
                description=ingest_event.description,
                owner=owner_value,
                start_at=ingest_event.start.isoformat(),
                end_at=ingest_event.end.isoformat() if ingest_event.end else None,
                location=ingest_event.location,
                read_only=True,
                source=ingest_event.source,
                source_id=ingest_event.source_id,
                created_at=now,
                updated_at=now,
            )
            self._conn.execute(
                """
                INSERT INTO mission_schedule (id, title, description, owner, start_at, end_at, location, read_only, source, source_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.title,
                    record.description,
                    record.owner,
                    record.start_at,
                    record.end_at,
                    record.location,
                    int(record.read_only),
                    record.source,
                    record.source_id,
                    record.created_at,
                    record.updated_at,
                ),
            )
            return record

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> ScheduleRecord:
        return ScheduleRecord(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            owner=row["owner"],
            start_at=row["start_at"],
            end_at=row["end_at"],
            location=row["location"],
            read_only=bool(row["read_only"]),
            source=row["source"],
            source_id=row["source_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
*** End of File
