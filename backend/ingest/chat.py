from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Iterator

from .schemas import IngestTask, TaskOwner, TaskStatus
from .utils import hash_source_id, parse_checkbox, parse_mentions, parse_tags


def extract_tasks_from_sessions(paths: Iterable[Path]) -> Iterator[IngestTask]:
    for path in paths:
        with Path(path).open("r", encoding="utf-8") as handle:
            for line in handle:
                record = json.loads(line)
                if record.get("type") != "message":
                    continue
                message = record.get("message", {})
                content = message.get("content", [])
                for block in content:
                    if block.get("type") != "text":
                        continue
                    text = block.get("text", "")
                    yield from _extract_from_text(text, path, record)


def _extract_from_text(text: str, path: Path, record: dict) -> Iterator[IngestTask]:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        checkbox = parse_checkbox(line)
        if checkbox:
            is_checked, title = checkbox
            owner = _owner_from_mentions(line)
            yield _build_task(title, owner, is_checked, line, path, record)
            continue

        if line.lower().startswith("task:") or line.startswith("- Task:"):
            cleaned = line.split(":", 1)[1].strip()
            owner = _owner_from_mentions(line)
            yield _build_task(cleaned, owner, False, line, path, record)


def _build_task(title: str, owner: str | None, is_checked: bool, line: str, path: Path, record: dict) -> IngestTask:
    tags = parse_tags(line)
    mentions = parse_mentions(line)
    owner_value = owner or (mentions[0] if mentions else None)
    owner_enum = TaskOwner(owner_value.title()) if owner_value and owner_value.title() in TaskOwner._value2member_map_ else TaskOwner.unknown
    cleaned_title = title
    for mention in mentions:
        cleaned_title = cleaned_title.replace(f"@{mention}", "").strip()
    return IngestTask(
        source_id=hash_source_id("chat", path.stem, record.get("timestamp", ""), title),
        title=cleaned_title,
        owner=owner_enum,
        status=TaskStatus.done if is_checked else TaskStatus.backlog,
        tags=tags,
        origin_path=path,
        source="chat",
        raw={"message": record.get("message", {})},
    )


def _owner_from_mentions(line: str) -> str | None:
    mentions = parse_mentions(line)
    if not mentions:
        return None
    return mentions[0]
