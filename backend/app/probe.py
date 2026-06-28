"""ffprobe helpers for media duration (best-effort, optional)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def generate_cover(video: Path, out: Path, at: float = 15.0) -> bool:
    """Extract a single frame ~``at`` seconds into ``video`` as a JPEG cover."""
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(at), "-i", str(video),
             "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", str(out)],
            capture_output=True, timeout=60,
        )
    except (subprocess.SubprocessError, OSError):
        return False
    return out.exists() and out.stat().st_size > 0


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
