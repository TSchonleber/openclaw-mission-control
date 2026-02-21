from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional


class OpenClawError(RuntimeError):
    pass


async def run_agent_command(
    *,
    agent: str,
    message: str,
    session_id: Optional[str] = None,
    thinking: Optional[str] = None,
    timeout: int = 600,
) -> Dict[str, Any]:
    """Invoke `openclaw agent` and return the parsed JSON reply."""

    cmd = ["openclaw", "agent", "--agent", agent, "--message", message, "--json"]
    if session_id:
        cmd += ["--session-id", session_id]
    if thinking:
        cmd += ["--thinking", thinking]
    cmd += ["--timeout", str(timeout)]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise OpenClawError(stderr.decode().strip() or stdout.decode().strip() or "openclaw agent failed")

    payload = stdout.decode().strip()
    if not payload:
        raise OpenClawError("openclaw agent returned no data")

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise OpenClawError(f"Failed to parse openclaw output: {payload}") from exc
