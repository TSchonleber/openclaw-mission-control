# Mission Control Ingest — Mapping + Conflict Policy

_Last updated: 2026-02-23 @ 04:32 ET_

This document explains how raw data from Obsidian notes and agent chat transcripts map onto the normalized ingest models defined in `backend/ingest/schemas.py`, plus the precedence rules we use when conflicts arise.

## 1. Task Mapping

| Source | Source Field / Pattern | Target Field | Transform |
| --- | --- | --- | --- |
| Obsidian | Markdown checkbox text (e.g., `- [ ] Implement /tasks API`) | `title` | Strip checkbox and numbering; trim whitespace. |
| Obsidian | Checkbox state `[ ]` vs `[x]` | `status` | `[x]` → `done`; unchecked → `backlog` (can be overridden by inline `#status:<value>` tag). |
| Obsidian | Heading containing agent name (e.g., `**If you are Iris**`) | `owner` | Match against known TaskOwner enum; default to `Unknown`. |
| Obsidian | Inline suffix `— Owner` | `owner` | Override heading-derived owner if present. |
| Obsidian | `#blocked`, `#next`, `#review` tags | `tags` | Collect unique hashtags (minus `#`). |
| Obsidian | `#blocked:<reason>` (future) or inline `Blocker: ...` | `blocker` | Capture text after colon. |
| Obsidian | `_Last updated: ..._` line | `raw["last_updated"]` | Stored for telemetry only. |
| Obsidian | File path + heading path | `origin_path`, `source_id` | `source_id = sha256(f"obsidian:{path}:{heading}:{title}")`. |
| Chat | Bullet line beginning with `- [ ]` or `- [x]` in assistant reply | `title` / `status` | Same checkbox handling as Obsidian. |
| Chat | Plain bullet `- Task:` or `Task:` prefix | `title` | Strip prefix; default status `backlog`. |
| Chat | Mentions `@Iris`, `@Nara`, etc. | `owner` | Map mention to TaskOwner enum. |
| Chat | Natural language deadlines `by <date>` | `sla` | Parsed via date parser (pending implementation). |
| Chat | Session file path + message id | `origin_path`, `source_id` | `source_id = sha256(f"chat:{session_id}:{message_id}:{line_hash}")`. |

## 2. Calendar / Event Mapping

| Source | Field | Target | Transform |
| --- | --- | --- | --- |
| Obsidian | YAML front-matter `start`, `end`, `location` (future template) | `start`, `end`, `location` | Parse ISO strings; fallback to date parser on free text. |
| Obsidian | Section headings under `## Schedule` / `## Calendar` | `title` | Use heading text; capture parent breadcrumbs in `origin_path`. |
| Obsidian | Inline owner suffix or heading context | `owner` | Same heuristics as tasks. |
| Chat | Sentences like `Standup at 10:00 for Nara` | `title`, `start`, `owner` | Use regex + date parser; owner from mention. |
| Chat | `Schedule:` blocks | `title` | Each bullet becomes event; parse `start/end`. |

> **Until the calendar template lands:** events without a resolvable `start` will be skipped with a warning. The ingest pipeline will emit metrics so we can tighten authoring conventions.

## 3. Conflict Resolution

1. **Manual overrides win.** If a Mission Control task/event has `read_only=False`, we assume a human edited it directly. Future ingest updates for the same `source_id` are ignored and logged for review.
2. **Obsidian beats chat.** For identical `source_id`s (same conceptual work item referenced across sources), Obsidian updates replace chat-derived ones unless the chat version has been manually edited in Mission Control.
3. **Chat patches fill gaps.** If a task exists only in chat logs, it’s imported with `read_only=True` until the corresponding Obsidian note is updated; this keeps live commitments visible even before they’re written down formally.
4. **Deletions:**
   - If a checkbox/event disappears from Obsidian and there is no manual override, we archive the Mission Control record (status → `done`, `tags += ["archived"]`).
   - Chat-derived tasks never delete automatically; they expire when the source session ages past a configurable window (default 7 days).

## 4. Idempotency Keys

```
Task source_id = sha256("{source}:{path_or_session}:{heading_or_message}:{title}".lower())
Event source_id = sha256("event:{source}:{path_or_session}:{start_iso}:{title}")
```

Store `source_id` alongside tasks/events so reruns can detect updates vs inserts.

## 5. Open Items
- Finalize parsing rules for date/time in free-form chat text.
- Decide whether manual edits should write back to Obsidian (current plan: no, but flag for future).
- Confirm retention policy for chat logs: need cursor table storing last processed session + byte offset per agent.
