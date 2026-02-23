from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer

from ingest.sync import sync_sources
from schedule_service import ScheduleRepository
from task_service import TaskRepository

app = typer.Typer(help="Run Obsidian/chat ingestion into Mission Control")


@app.command()
def run(
    obsidian_path: Optional[Path] = typer.Option(None, help="Path to Obsidian vault root"),
    chat_glob: Optional[str] = typer.Option(None, help="Glob for chat session jsonl files"),
) -> None:
    chat_paths: list[Path] = []
    if chat_glob:
        chat_paths = [Path(p) for p in Path().glob(chat_glob)]
    tasks_repo = TaskRepository()
    schedule_repo = ScheduleRepository()
    stats = sync_sources(tasks_repo, schedule_repo, obsidian_root=obsidian_path, chat_logs=chat_paths)
    typer.echo(json.dumps(stats, indent=2))


if __name__ == "__main__":
    app()
