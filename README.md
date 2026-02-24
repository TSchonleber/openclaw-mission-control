# OpenClaw Mission Control

A live, agent-driven command center for tasks, calendar, memory, and office presence.

## What this includes
- **Mission Control UI** (Tasks, Calendar, Memory, Team, Office)
- **Gateway API** for routing commands to OpenClaw agents
- **Ingest pipeline** for Obsidian + agent chat logs
- **Memory board** with search across vault + OpenClaw workspaces
- **Pixel office view** with live agent status + motion

## Requirements (free)
- Node 18+ (frontend)
- Python 3.11+ (backend)
- OpenClaw CLI installed + configured
- Optional: ngrok free account (for public demo URL)

## Local setup
```bash
# frontend
cd frontend
npm install
npm run dev

# backend
cd ../backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# gateway (required for /routes, /ws)
cd ../gateway
source ../backend/.venv/bin/activate
uvicorn app:app --reload --port 8000
```

> The frontend expects the **gateway** on port 8000 for `/routes/*`, `/ws`, `/intel/*`, `/mission/*`.

## Environment variables
Copy `.env.example` to `.env` and set values as needed.

Frontend:
- `VITE_API_BASE_URL` – gateway URL (e.g., `http://localhost:8000` or ngrok)
- `VITE_WS_URL` – websocket URL (e.g., `ws://localhost:8000/ws`)

Backend:
- `MEMORY_VAULT` – Obsidian vault path
- `OPENCLAW_ROOT` – OpenClaw data root

## Free public demo (ngrok)
1. Create a free ngrok account
2. Add your auth token:
   ```bash
   ngrok config add-authtoken <TOKEN>
   ```
3. Start tunnel:
   ```bash
   ngrok http 8000
   ```
4. Use the generated URL:
   - `VITE_API_BASE_URL=https://<ngrok>.ngrok-free.dev`
   - `VITE_WS_URL=wss://<ngrok>.ngrok-free.dev/ws`

## Ingest (Obsidian + chat logs)
```bash
cd backend
source .venv/bin/activate
python -m scripts.ingest_cli \
  --obsidian-path "$MEMORY_VAULT" \
  --chat-glob "$OPENCLAW_ROOT/agents/*/sessions/*.jsonl"
```

## Dream journal (nightly)
A nightly script can generate dream journal entries for each agent.
Set `DREAM_JOURNAL_AGENTS` and run:
```bash
cd backend
source .venv/bin/activate
python dream_journal.py
```

---
You will need to clean up some of this and optimize it for your setup like agent name placeholders I have in here etc.
**Goal:** This repo is designed to be a clean, public demo of a working agent command center.
