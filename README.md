# Nara Hub (dev)

Dev scaffold for the Nara personal chat hub (React/Vite frontend + FastAPI backend).

## Quick start

```bash
# backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# frontend
cd frontend
npm install
npm run dev
```

## WebSocket config

The frontend connects to `ws://<host>:8000/ws` by default. Override with `VITE_WS_URL`.

## Codex routing

Backend heuristically routes code-heavy prompts to the Cursor Codex adapter
(`cursor_adapter.py`). Provide credentials via macOS Keychain (service `CURSOR_API_KEY`).
Chatty prompts stay on the lightweight `gpt-4.1-mini` path.
