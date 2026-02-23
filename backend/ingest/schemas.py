"""Pydantic models shared by ingest extractors/loaders.

These schemas normalize data coming from Obsidian and agent chat logs
before we upsert into Mission Control storage.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


class TaskStatus(str, Enum):
    backlog = "backlog"
    in_progress = "in-progress"
    review = "review"
    done = "done"


class TaskOwner(str, Enum):
    iris = "Iris"
    terrence = "Terrence"
    nara = "Nara"
    aster = "Aster"
    osiris = "Osiris"
    unknown = "Unknown"


class IngestTask(BaseModel):
    """Normalized task payload gathered from any upstream source."""

    source_id: str = Field(..., description="Stable hash derived from source path + content")
    title: str
    description: Optional[str] = None
    owner: TaskOwner = TaskOwner.unknown
    status: TaskStatus = TaskStatus.backlog
    blocker: Optional[str] = None
    sla: Optional[datetime] = Field(default=None, description="Deadline or SLA timestamp, UTC")
    tags: list[str] = Field(default_factory=list)
    origin_path: Optional[Path] = Field(default=None, description="Filesystem path or heading breadcrumb")
    origin_url: Optional[HttpUrl] = None
    source: Literal["obsidian", "chat"]
    raw: dict = Field(default_factory=dict)


class IngestEvent(BaseModel):
    """Normalized calendar/schedule entry."""

    source_id: str
    title: str
    owner: Optional[TaskOwner] = TaskOwner.unknown
    description: Optional[str] = None
    start: datetime
    end: Optional[datetime] = None
    location: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    origin_path: Optional[Path] = None
    origin_url: Optional[HttpUrl] = None
    source: Literal["obsidian", "chat"]
    raw: dict = Field(default_factory=dict)


class ConflictPolicy(str, Enum):
    """Represents how we resolve collisions between sources."""

    manual_override = "manual"
    obsidian_preferred = "obsidian"
    chat_preferred = "chat"


class MappingRule(BaseModel):
    """Declarative representation of source → target mapping for docs/tests."""

    source_field: str
    description: str
    target_field: str
    transform: str
    applies_to: Literal["obsidian", "chat"]
