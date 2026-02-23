from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from dateutil import parser as date_parser

SOURCE_ID_SEP = "::"
MENTION_PATTERN = re.compile(r"@(?P<name>[A-Za-z][A-Za-z0-9_-]*)")
CHECKBOX_PATTERN = re.compile(r"^- \[(?P<state> |x)\] (?P<text>.+)$")
TAG_PATTERN = re.compile(r"#(?P<tag>[A-Za-z0-9_-]+)")
OWNER_NAMES = {name.lower(): name for name in ["Iris", "Terrence", "Nara", "Aster", "Osiris"]}


def normalize_owner(text: str | None) -> str | None:
    if not text:
        return None
    lowered = text.strip().lower()
    return OWNER_NAMES.get(lowered)


def parse_mentions(text: str) -> list[str]:
    return [match.group("name") for match in MENTION_PATTERN.finditer(text or "")]


def parse_checkbox(line: str) -> tuple[bool, str] | None:
    match = CHECKBOX_PATTERN.match(line.strip())
    if not match:
        return None
    is_checked = match.group("state").lower() == "x"
    text = match.group("text").strip()
    return is_checked, text


def parse_tags(text: str) -> list[str]:
    return [m.group("tag") for m in TAG_PATTERN.finditer(text or "")]


def hash_source_id(*parts: str) -> str:
    material = SOURCE_ID_SEP.join(part.strip().lower() for part in parts if part)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def parse_datetime(text: str | datetime | None) -> Optional[datetime]:
    if text is None:
        return None
    if isinstance(text, datetime):
        return text
    if not text:
        return None
    try:
        return date_parser.parse(text)
    except (ValueError, TypeError):
        return None


def ensure_path(value: str | Path | None) -> Optional[Path]:
    if value is None:
        return None
    return Path(value)


def chunk_lines(lines: Iterable[str]) -> Iterable[str]:
    for line in lines:
        yield line.rstrip("\n")
