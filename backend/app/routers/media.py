"""Serve course cover images (generated covers + on-disk art come later)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..access import can_access_course
from ..auth import require_user
from ..db import get_db
from ..models import Course, User
from ..paths import library_root, safe_media_path

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/cover/{slug}")
def cover(slug: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = db.scalar(select(Course).where(Course.slug == slug))
    if c is None or not c.cover_path or not can_access_course(db, user, c):
        raise HTTPException(404, "No cover")
    root = library_root(db, c)
    path = safe_media_path(root, c.cover_path) if root else None
    if path is None:
        raise HTTPException(404, "Cover not found")
    return FileResponse(path)
