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
## Bring Your Own OpenClaw

The gateway intentionally keeps **all credentials on your machine**. To run it with your own agent crew:

1. Install and configure OpenClaw on the host (run `openclaw agents list` to confirm your agents exist).
2. Clone this repo and follow the setup steps above.
3. Launch the service (locally or via a process manager such as LaunchAgent/systemd).
4. Expose `http(s)://<host>:9000` to the frontend (tunnel, reverse proxy, or public VM).

Because the service simply shells out to `openclaw agent --agent <id> --json`, anyone can drop in their own OpenClaw install + workspace and reskin the frontend without storing secrets in this repo.

