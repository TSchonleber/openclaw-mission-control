#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname "$0")" >/dev/null 2>&1 && pwd)"
VENV_PATH="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_PATH" ]; then
  echo "Missing venv at $VENV_PATH" >&2
  exit 1
fi
source "$VENV_PATH/bin/activate"
python -m scripts.ingest_cli \
  --obsidian-path "${MEMORY_VAULT:-$HOME/Documents/Agent Memory}" \
  --chat-glob "${OPENCLAW_ROOT:-$HOME/.openclaw}/agents/*/sessions/*.jsonl"
