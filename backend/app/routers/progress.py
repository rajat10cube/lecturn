"""Per-lecture playback progress (single-user for now; user_id arrives later)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Course, Lecture, Progress

router = APIRouter(prefix="/progress", tags=["progress"], dependencies=[Depends(require_auth)])

_COMPLETE_RATIO = 0.9


class ProgressIn(BaseModel):
    position_sec: float
    duration_sec: float | None = None
    completed: bool | None = None


@router.put("/{lecture_id}")
def put_progress(lecture_id: int, body: ProgressIn, db: Session = Depends(get_db)) -> dict:
    lec = db.get(Lecture, lecture_id)
    if lec is None:
        raise HTTPException(404, "Lecture not found")

    p = db.scalar(select(Progress).where(Progress.lecture_id == lecture_id))
    if p is None:
        p = Progress(lecture_id=lecture_id)
        db.add(p)

    p.position_sec = max(0.0, body.position_sec)
    if body.duration_sec:
        p.duration_sec = body.duration_sec

    if body.completed is not None:
        computed = body.completed
    elif p.duration_sec and p.duration_sec > 0:
        computed = (body.position_sec / p.duration_sec) >= _COMPLETE_RATIO
    else:
        computed = False
    # completion is sticky once reached
    p.completed = bool(p.completed or computed)

    db.commit()
    return {"lectureId": lecture_id, "positionSec": p.position_sec, "completed": p.completed}


@router.get("")
def get_progress(course: str, db: Session = Depends(get_db)) -> dict:
    c = db.scalar(select(Course).where(Course.slug == course))
    if c is None:
        raise HTTPException(404, "Course not found")
    rows = db.scalars(
        select(Progress).join(Lecture, Lecture.id == Progress.lecture_id).where(
            Lecture.course_id == c.id
        )
    ).all()
    return {
        str(p.lecture_id): {
            "positionSec": p.position_sec,
            "durationSec": p.duration_sec,
            "completed": p.completed,
        }
        for p in rows
    }
