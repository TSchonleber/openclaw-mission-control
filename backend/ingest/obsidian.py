from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Optional
import re

import yaml

from .schemas import IngestTask, TaskOwner, TaskStatus
from .utils import chunk_lines, hash_source_id, normalize_owner, parse_checkbox, parse_tags

OWNER_LINE_PATTERN = re.compile(r"if you are (?P<name>[A-Za-z]+)", re.IGNORECASE)


@dataclass
class ObsidianContext:
    owner: Optional[str] = None
    heading_path: list[str] = None

    def __post_init__(self) -> None:
        if self.heading_path is None:
            self.heading_path = []

    def breadcrumb(self) -> str:
        return " > ".join(self.heading_path or [])


def extract_tasks(root: Path | str) -> Iterator[IngestTask]:
    root_path = Path(root)
    for md_file in sorted(root_path.rglob("*.md")):
        yield from _parse_file(md_file)


def _parse_file(path: Path) -> Iterator[IngestTask]:
    text = path.read_text(encoding="utf-8")
    front_matter, body = _split_front_matter(text)
    context = ObsidianContext(owner=_owner_from_heading(path), heading_path=[])

    for line in chunk_lines(body.splitlines()):
        if line.startswith("#"):
            heading = line.lstrip("# ").strip()
            context.heading_path.append(heading)
            owner = normalize_owner(_owner_from_heading_text(heading) or context.owner)
            context.owner = owner
            continue

        owner_line = OWNER_LINE_PATTERN.search(line)
        if owner_line:
            context.owner = normalize_owner(owner_line.group("name")) or context.owner

        parsed = parse_checkbox(line)
        if not parsed:
            continue

        is_checked, title = parsed
        inline_owner = None
        if "—" in title:
            prefix, remainder = [part.strip() for part in title.split("—", 1)]
            candidate = normalize_owner(prefix)
            if candidate:
                inline_owner = candidate
                title = remainder
        owner = inline_owner or context.owner or "Unknown"
        tags = parse_tags(line)
        task = IngestTask(
            source_id=hash_source_id("obsidian", str(path), title),
            title=title,
            owner=TaskOwner(owner) if owner in TaskOwner._value2member_map_ else TaskOwner.unknown,
            status=TaskStatus.done if is_checked else TaskStatus.backlog,
            tags=tags,
            origin_path=path,
            source="obsidian",
            raw={"heading": context.breadcrumb()},
        )
        yield task


def _split_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    parts = text.split("---\n", 2)
    if len(parts) < 3:
        return {}, text
    data = yaml.safe_load(parts[1]) or {}
    return data, parts[2]


def _owner_from_heading(path: Path) -> Optional[str]:
    filename = path.stem
    if filename.lower().startswith("iris"):
        return "Iris"
    return None


def _owner_from_heading_text(heading: str) -> Optional[str]:
    lower = heading.lower()
    for name in ["iris", "nara", "osiris", "aster", "terrence"]:
        if name in lower:
            return name.title()
    return None
