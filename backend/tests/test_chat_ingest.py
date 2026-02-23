from __future__ import annotations

from pathlib import Path

from ingest.chat import extract_tasks_from_sessions

FIXTURE_DIR = Path(__file__).parent / "data" / "chat"


def test_parses_checkbox_and_plain_task_lines():
    tasks = list(extract_tasks_from_sessions([FIXTURE_DIR / "iris-session.jsonl"]))
    assert len(tasks) == 3

    checkbox = tasks[0]
    assert checkbox.title == "Wire Obsidian ingest for tasks."
    assert checkbox.status == "backlog"

    completed = tasks[1]
    assert completed.status == "done"

    mention = tasks[2]
    assert mention.owner == "Nara"
    assert mention.title == "wire UI badge by Friday."
