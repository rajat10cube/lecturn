"""HTTP Range streaming for media files (enables seeking in <video>)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

_CHUNK = 1024 * 1024


def _iter_file(path: Path, start: int, end: int) -> Iterator[bytes]:
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = f.read(min(_CHUNK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def range_response(path: Path, request: Request, content_type: str) -> StreamingResponse:
    file_size = path.stat().st_size
    range_header = request.headers.get("range")

    if not range_header:
        return StreamingResponse(
            _iter_file(path, 0, file_size - 1),
            media_type=content_type,
            headers={"Content-Length": str(file_size), "Accept-Ranges": "bytes"},
        )

    try:
        units, _, rng = range_header.partition("=")
        if units.strip() != "bytes":
            raise ValueError
        start_s, _, end_s = rng.partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
    except ValueError:
        raise HTTPException(416, headers={"Content-Range": f"bytes */{file_size}"})

    end = min(end, file_size - 1)
    if start > end or start >= file_size:
        raise HTTPException(416, headers={"Content-Range": f"bytes */{file_size}"})

    length = end - start + 1
    return StreamingResponse(
        _iter_file(path, start, end),
        status_code=206,
        media_type=content_type,
        headers={
            "Content-Length": str(length),
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
        },
    )
