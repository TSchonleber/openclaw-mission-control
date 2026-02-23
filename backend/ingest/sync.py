from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

from .chat import extract_tasks_from_sessions
from .obsidian import extract_tasks as extract_obsidian_tasks
from .schemas import IngestTask
from schedule_service import ScheduleRepository
from task_service import TaskRepository


def sync_sources(
    tasks_repo: TaskRepository,
    schedule_repo: ScheduleRepository,
    obsidian_root: Path | None = None,
    chat_logs: Sequence[Path] | None = None,
) -> dict:
    stats = {
        "tasks": {"processed": 0, "upserts": 0},
        "events": {"processed": 0, "upserts": 0},
    }

    if obsidian_root:
        stats["tasks"]["processed"] += _upsert_tasks(tasks_repo, extract_obsidian_tasks(obsidian_root))
        stats["tasks"]["upserts"] = stats["tasks"]["processed"]

    if chat_logs:
        stats["tasks"]["processed"] += _upsert_tasks(
            tasks_repo,
            extract_tasks_from_sessions(chat_logs),
        )
        stats["tasks"]["upserts"] = stats["tasks"]["processed"]

    # Event ingestion pending once calendar front-matter stabilizes.
    return stats


def _upsert_tasks(tasks_repo: TaskRepository, iterator: Iterable[IngestTask]) -> int:
    count = 0
    for task in iterator:
        tasks_repo.upsert_from_ingest(task)
        count += 1
    return count
