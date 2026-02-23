# Mission Control Ingest — Source Contract

Last updated: 2026-02-23 @ 04:25 ET

This document captures the current-state anatomy of every data source we need to ingest for the Mission Control task board and calendar. Everyone touching the ingest pipeline should treat this as the source of truth for field names, file paths, and known limitations.

---

## 1. Obsidian Vault (canonical planning + status)

- **Root path:** `/Users/r4vager/Documents/Agent Memory`
- **Subsystems:**
  - `projects/` — per-project briefs with checklists, decisions, next actions.
  - `Collab/` — time-bound collaboration notes (daily/phase logs, task scratch pads).
  - `Memory Banks/` — per-agent reflections (occasionally contain todo checkboxes).
  - `people/`, `systems/`, `agents/` — rarely contain actionable checklists but may embed schedules.

### 1.1 Task encoding patterns
| Pattern | Example | Notes |
| --- | --- | --- |
| Markdown checkboxes with completion flag | `- [x] Wire WebSocket + REST data…` (projects/nara-hub.md) | Status derived from `[ ]` vs `[x]`; owner implied by surrounding heading (e.g., "If you are Nara") or inline `— <owner>` notation.
| Scratch checklist template | `- [ ] Example: <owner> — description` (Collab/Thought Dump.md) | Owner + description captured in a single line; no timestamps.
| Headings + bullet lists | `## Next Actions` + bullet text | Need to treat bullet text as backlog even if not checkboxed.

> **Example snippet (projects/nara-hub.md):**
> ```markdown
> **If you are Iris (Backend / Integrations)**
> 1. Phase 2
>    - [x] Instrument router …
>    - [ ] Document telemetry and command-log JSON schemas…
> 2. Phase 3
>    - [x] Implement `/agents/:id/message` …
>    - [ ] Implement lightweight session history store…
> ```
>
> - Owner = heading (`Iris`).
> - Phase = ordered list index (optional metadata).
> - Checkbox controls `status` (checked → `done`).

### 1.2 Calendar / schedule encoding
- **Current reality:** No dedicated calendar note yet. Schedules live implicitly inside project briefs (e.g., Mission Control phase timelines) or Collab notes. We will:
  - Detect date/time expressions within `## Next Actions` / `## Checkpoints` sections.
  - Reserve YAML front-matter keys (`start`, `end`, `deadline`) for the upcoming calendar template (to be added when schedule service lands).
- **Decision:** until `projects/<name>.md` adopts consistent front-matter, events originating from the vault will carry:
  - `source_path`
  - `heading_path` (breadcrumb of headings, e.g., `projects/nara-hub.md > Mission Control > Tasks board`)
  - `text` (line contents) for downstream NLP date extraction.

### 1.3 Metadata we can trust today
| Field | Extraction | Reliability |
| --- | --- | --- |
| Owner | Heading text containing agent/human names; fallback to inline `— Owner` suffix | Medium (depends on author discipline)
| Status | Checkbox vs unchecked | High (explicit)
| Tags | Inline hashtags (`#next`, `#blocked`) | Medium
| Last updated | Manual `_Last updated: ..._` lines | Medium (present on many project notes)

### 1.4 Files to seed fixtures with
- `/projects/nara-hub.md` — dense checkbox coverage across owners.
- `/projects/money-hub.md` — headings + paragraphs, minimal checkboxes.
- `/Collab/Thought Dump.md` — template showing owner suffix format.
- `/Memory Banks/Iris Memory Bank.md` — reflection-style bullets (non-actionable by default).

---

## 2. Agent Chat Logs (live commitments & ad-hoc schedules)

- **Root pattern:** `~/.openclaw/agents/<agent_id>/sessions/*.jsonl`
  - Example: `~/.openclaw/agents/iris/sessions/e2aef210-...jsonl`
- **Format:** JSON Lines, `version: 3` session transcripts emitted by OpenClaw Control.
  - Event types: `session`, `model_change`, `thinking_level_change`, `custom`, `message`.
  - Task signals only appear inside `message` events.
- **Message payload structure:**
  ```json
  {
    "type": "message",
    "timestamp": "2026-02-23T09:11:23.684Z",
    "message": {
      "role": "assistant" | "user" | "toolResult",
      "content": [ { "type": "text" | "thinking" | "toolCall", ... } ],
      "timestamp": 1771837881418
    }
  }
  ```
- **Deriving structured tasks/events:**
  - Parse `message.content[].text` for phrases like `Task:` / `Next:` / `[[reply_to_current]] <plan>` or explicit bullet lists returned to Terrence.
  - Leverage metadata: many assistant replies already list actionable bullets (see session `e2aef210-...` where Iris outlined current tasks).
  - Associate `agent_id` via filesystem path; include `session.id` + `message.id` as provenance for dedupe.
- **Retention:** Files accumulate indefinitely; no rotation yet. We'll maintain a cursor per agent (last `session.id` + byte offset) to support incremental ingestion.

---

## 3. Mission Control Targets (FastAPI backend)

### 3.1 Tasks (`/mission/tasks`)
- **Implementation:** `nara-hub/backend/task_service.py`
- **Storage:** SQLite file `nara-hub/backend/mission_tasks.db` table `mission_tasks` with columns:
  | Column | Type | Notes |
  | --- | --- | --- |
  | `id` | TEXT (UUID) | Primary key |
  | `title` | TEXT | Required |
  | `description` | TEXT | Optional |
  | `owner` | TEXT | One of `Iris`, `Terrence`, `Nara`, `Aster`, `Osiris` |
  | `status` | TEXT | `backlog` \| `in-progress` \| `review` \| `done` |
  | `blocker_flag` | INTEGER | 0/1 |
  | `tags` | TEXT | JSON array (stored as string) |
  | `created_at` / `updated_at` | TEXT | ISO8601 |
- **API models:** `TaskCreateRequest`, `TaskUpdateRequest`, `TaskResponse` (Pydantic). Currently no provenance fields.

### 3.2 Calendar (`/mission/schedule`) — *not yet implemented*
- No router, schema, or persistence exists in `backend`. Frontend currently mocks calendar data (see 2026-02-22 diary entry).
- **Action:** Create `ScheduleEvent` model mirroring `TaskResponse` conventions plus start/end/duration + source metadata when we reach Phase 4.

---

## 4. Existing automation
- **Current state:** No jobs currently sync vault/chat data into Mission Control. Task board entries were seeded manually via `/mission/tasks` API (`TaskRepository.create_task`).
- **Implication:** Ingest service has greenfield control—no conflicting cron or worker scripts to coordinate with.

---

## 5. Open Questions / TODOs
1. **Calendar source schema:** Need to formalize front-matter keys (`type`, `start`, `end`, `owner`, `location`) in Obsidian before we can emit high-confidence events.
2. **Chat parsing heuristics:** Decide whether to require explicit tags (e.g., `Task:`) in assistant replies to reduce hallucinated tasks.
3. **Deletion semantics:** When a checkbox disappears from the vault, do we delete the Mission Control task or mark it archived? (TBD in Phase 2 conflict rules.)

---

### Next Update Window
- After Phase 1 completes, refresh this document with:
  - Concrete YAML examples for calendar events.
  - Final list of files feeding fixtures.
  - Confirmed list of agent session directories participating in ingest.
