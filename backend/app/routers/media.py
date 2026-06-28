"""Serve course cover images (generated covers + on-disk art come later)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Course
from ..paths import library_root, safe_media_path

router = APIRouter(prefix="/media", tags=["media"], dependencies=[Depends(require_auth)])


@router.get("/cover/{slug}")
def cover(slug: str, db: Session = Depends(get_db)):
    c = db.scalar(select(Course).where(Course.slug == slug))
    if c is None or not c.cover_path:
        raise HTTPException(404, "No cover")
    root = library_root(db, c)
    path = safe_media_path(root, c.cover_path) if root else None
    if path is None:
        raise HTTPException(404, "Cover not found")
    return FileResponse(path)
