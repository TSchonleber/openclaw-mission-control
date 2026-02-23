from __future__ import annotations

from pathlib import Path

from ingest.obsidian import extract_tasks

FIXTURE_DIR = Path(__file__).parent / "data" / "obsidian"


def test_extracts_checkboxes_with_owner_and_status():
    tasks = list(extract_tasks(FIXTURE_DIR))
    assert len(tasks) == 7

    by_title = {task.title: task for task in tasks}

    first = by_title["Instrument router to produce telemetry events."]
    assert first.status == "done"
    assert first.owner == "Iris"

    second = by_title["Document telemetry and command-log JSON schemas and add basic tests."]
    assert second.status == "backlog"
    assert second.owner == "Iris"

    weekly = by_title["Draft weekly update for Terrence."]
    assert weekly.owner == "Aster"
