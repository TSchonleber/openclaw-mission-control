from __future__ import annotations

from pathlib import Path

from ingest.schemas import IngestTask, TaskOwner as IngestOwner, TaskStatus as IngestStatus
from task_service import TaskRepository, TaskUpdateRequest


def _make_ingest_task(source_id: str) -> IngestTask:
    return IngestTask(
        source_id=source_id,
        title="Sync Obsidian tasks",
        description=None,
        owner=IngestOwner.iris,
        status=IngestStatus.backlog,
        blocker=None,
        sla=None,
        tags=["ingest"],
        origin_path=Path("/tmp/task.md"),
        origin_url=None,
        source="obsidian",
        raw={},
    )


def test_upsert_from_ingest_respects_manual_override(tmp_path):
    repo = TaskRepository(db_path=tmp_path / "tasks.db")

    first = repo.upsert_from_ingest(_make_ingest_task("abc"))
    assert first.read_only is True
    assert first.title == "Sync Obsidian tasks"

    # Manual update flips readOnly off
    repo.update_task(first.id, TaskUpdateRequest(readOnly=False, title="Manual Title"))

    second = repo.upsert_from_ingest(_make_ingest_task("abc"))
    assert second.title == "Manual Title"
    assert second.read_only is False


def test_upsert_from_ingest_inserts_new_records(tmp_path):
    repo = TaskRepository(db_path=tmp_path / "tasks.db")
    created = repo.upsert_from_ingest(_make_ingest_task("xyz"))
    assert created.source == "obsidian"
    assert created.read_only is True
    fetched = repo.get_task(created.id)
    assert fetched is not None
    assert fetched.source_id == "xyz"
