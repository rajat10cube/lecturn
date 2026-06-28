"""Full-text search endpoint (courses + lectures)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..search import run_search

router = APIRouter(prefix="/search", tags=["search"], dependencies=[Depends(require_auth)])


@router.get("")
def search(q: str, db: Session = Depends(get_db)) -> dict:
    return {"results": run_search(db.connection(), q)}
