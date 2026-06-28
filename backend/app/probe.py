"""ffprobe helpers for media duration (best-effort, optional)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def probe_duration(path: Path) -> float | None:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, timeout=30,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    value = out.stdout.strip()
    try:
        d = float(value)
        return d if d > 0 else None
    except ValueError:
        return None
