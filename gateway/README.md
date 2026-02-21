# Hub Gateway Service

Bridges the Nara Hub frontend to live OpenClaw agents (Aster, Nara, Iris, Osiris).

## Features

- `POST /routes/:agentId/messages` to dispatch prompts via `openclaw agent`
- WebSocket feed (`/ws`) streaming:
  - agent replies (`type:"message"`)
  - command lifecycle events (`type:"command_log"`)
  - telemetry updates (`type:"telemetry"`)
- REST snapshots for `/telemetry`, `/command-log`, `/status`

## Requirements

- Python 3.11+
- OpenClaw CLI installed + authenticated (same machine)
- Access to the agent configs (e.g., `openclaw agents list` shows `iris`, `aster`, etc.)

## Setup

```bash
cd gateway
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 9000 --reload
```

Configure the frontend to point at the service:

```
VITE_API_BASE_URL=https://<gateway-host>
VITE_WS_URL=wss://<gateway-host>/ws
```
