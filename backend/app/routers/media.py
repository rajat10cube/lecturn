"""Serve course cover images (generated covers + on-disk art come later)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..access import can_access_course
from ..auth import require_user
from ..config import get_settings
from ..db import get_db
from ..models import Course, User
from ..paths import library_root, safe_media_path

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/cover/{slug}")
def cover(slug: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = db.scalar(select(Course).where(Course.slug == slug))
    if c is None or not can_access_course(db, user, c):
        raise HTTPException(404, "No cover")
    # 1) on-disk art shipped with the course
    if c.cover_path:
        root = library_root(db, c)
        path = safe_media_path(root, c.cover_path) if root else None
        if path is not None:
            return FileResponse(path)
    # 2) generated thumbnail cached in the data dir
    generated = get_settings().data_dir / "covers" / f"{c.id}.jpg"
    if generated.is_file():
        return FileResponse(generated)
    raise HTTPException(404, "No cover")
