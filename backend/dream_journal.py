from __future__ import annotations

import json
import subprocess
import os
from datetime import datetime
from pathlib import Path

VAULT = Path(os.getenv('MEMORY_VAULT', str(Path.home() / 'Documents' / 'Agent Memory')))
DREAMS_DIR = Path(os.getenv('DREAMS_DIR', str(VAULT / 'Dreams')))

AGENTS = os.getenv('DREAM_JOURNAL_AGENTS', 'aster,nara,iris,osiris').split(',')


def _run_agent(agent: str, prompt: str) -> str:
    cmd = ['openclaw', 'agent', '--agent', agent, '--message', prompt, '--json']
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    payload = json.loads(result.stdout)
    data = payload.get('result') or payload
    payloads = data.get('payloads') or []
    if payloads:
        return payloads[0].get('text') or payloads[0].get('content') or ''
    return data.get('message') or data.get('content') or ''


def write_entry(agent: str) -> None:
    DREAMS_DIR.mkdir(parents=True, exist_ok=True)
    file_path = DREAMS_DIR / f'{agent.title()} Dream Journal.md'
    date_label = datetime.now().strftime('%Y-%m-%d %H:%M')
    prompt = (
        f"Write a vivid dream journal entry (2-4 sentences) for {agent.title()} "
        f"with a surreal, imaginative tone. Timestamp: {date_label}."
    )
    try:
        content = _run_agent(agent, prompt).strip()
    except Exception as exc:  # noqa: BLE001
        content = f"[fallback] {agent.title()} dreamed of wandering a neon archive while clocks melted into the floor. ({exc})"

    entry = f"\n\n## {date_label}\n\n{content}\n"
    if file_path.exists():
        file_path.write_text(file_path.read_text() + entry, encoding='utf-8')
    else:
        file_path.write_text(f"# {agent.title()} Dream Journal" + entry, encoding='utf-8')


def main() -> None:
    for agent in AGENTS:
        write_entry(agent)


if __name__ == '__main__':
    main()
