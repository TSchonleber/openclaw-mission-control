# API Notes

## Telemetry
- **Endpoint:** `GET /telemetry`
- **WebSocket event:** `{ "type": "telemetry", "payload": { ... } }`
- **Shape (example):**
  ```json
  {
    "latency": { "latest_ms": 420, "p50_ms": 380, "p95_ms": 910 },
    "traffic": { "per_hour": 48, "total": 24, "window_minutes": 30 },
    "routes": { "codex_pct": 60, "chat_pct": 35, "other_pct": 5, "codex": 18, "chat": 10, "other": 2 },
    "errors": { "rate": 0.02 },
    "connection": { "status": "online", "detail": "Last ping 6:05 PM" }
  }
  ```
- UI falls back to derived metrics from local chat history if this feed is unavailable.

## Command Log
- **Endpoint:** `GET /command-log?limit=100`
- **WebSocket event:** `{ "type": "command_log", "entry": { ... } }`
- **Shape (example entry):**
  ```json
  {
    "id": "uuid",
    "text": "Run Codex diff for frontend",
    "route": "codex",
    "status": "completed", // staged | dispatched | completed | error
    "ts_received": "2026-02-20T22:10:45.120Z",
    "ts_dispatched": "2026-02-20T22:10:45.650Z",
    "ts_completed": "2026-02-20T22:10:48.110Z",
    "latency_ms": 2460,
    "model": "gpt-5.1-codex",
    "error": null
  }
  ```
- Frontend keeps the latest ~100 entries and updates in-place as new WS events arrive.
