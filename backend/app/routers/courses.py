"""Course library + detail endpoints (with progress)."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access import accessible_library_ids, can_access_course
from ..auth import require_user
from ..db import get_db
from ..models import Attachment, Course, Lecture, Progress, Section, User

router = APIRouter(prefix="/courses", tags=["courses"])

_NATIVE_VIDEO = {".mp4", ".m4v", ".webm", ".mov"}


def _playback(lec: Lecture) -> str:
    """How the client should play this lecture (see Decision A)."""
    if lec.kind == "document":
        return "document"
    if lec.kind == "audio":
        return "native"
    ext = os.path.splitext(lec.path)[1].lower()
    if ext in _NATIVE_VIDEO:
        return "native"
    if ext == ".ts":
        return "mpegts"
    return "remux"  # mkv/avi/... -> server remux (Phase 4)


def _cover_url(c: Course) -> str | None:
    return f"/api/media/cover/{c.slug}" if c.cover_path else None


@router.get("")
def list_courses(user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    q = select(Course).where(Course.missing.is_(False))
    allowed = accessible_library_ids(db, user)
    if allowed is not None:
        q = q.where(Course.library_id.in_(allowed))
    rows = db.scalars(q.order_by(Course.position, Course.title)).all()

    completed_map = dict(
        db.execute(
            select(Lecture.course_id, func.count())
            .join(Progress, Progress.lecture_id == Lecture.id)
            .where(Progress.completed.is_(True), Progress.user_id == user.id)
            .group_by(Lecture.course_id)
        ).all()
    )
    activity_map = dict(
        db.execute(
            select(Lecture.course_id, func.max(Progress.updated_at))
            .join(Progress, Progress.lecture_id == Lecture.id)
            .where(Progress.user_id == user.id)
            .group_by(Lecture.course_id)
        ).all()
    )

    courses = [
        {
            "id": c.id,
            "slug": c.slug,
            "title": c.title,
            "category": c.category,
            "cover": _cover_url(c),
            "lectureCount": c.lecture_count,
            "completedCount": completed_map.get(c.id, 0),
            "lastActivity": str(activity_map[c.id]) if activity_map.get(c.id) else None,
        }
        for c in rows
    ]
    categories = sorted({c["category"] for c in courses if c["category"]})
    return {"courses": courses, "categories": categories}


@router.get("/{slug}")
def get_course(
    slug: str, user: User = Depends(require_user), db: Session = Depends(get_db)
) -> dict:
    c = db.scalar(select(Course).where(Course.slug == slug, Course.missing.is_(False)))
    if c is None or not can_access_course(db, user, c):
        raise HTTPException(status_code=404, detail="Course not found")

    sections = db.scalars(
        select(Section).where(Section.course_id == c.id).order_by(Section.position)
    ).all()
    lectures = db.scalars(
        select(Lecture).where(Lecture.course_id == c.id).order_by(Lecture.position)
    ).all()
    attachments = db.scalars(select(Attachment).where(Attachment.course_id == c.id)).all()
    prog = {
        p.lecture_id: p
        for p in db.scalars(
            select(Progress).join(Lecture, Lecture.id == Progress.lecture_id).where(
                Lecture.course_id == c.id, Progress.user_id == user.id
            )
        )
    }

    by_section: dict[int | None, list[Lecture]] = {}
    for lec in lectures:
        by_section.setdefault(lec.section_id, []).append(lec)

    # resume = first lecture (in order) that isn't completed; else the first one
    resume_id = next((lec.id for lec in lectures if not (prog.get(lec.id) and prog[lec.id].completed)), None)
    if resume_id is None and lectures:
        resume_id = lectures[0].id

    def lecture_json(lec: Lecture) -> dict:
        p = prog.get(lec.id)
        return {
            "id": lec.id,
            "title": lec.title,
            "kind": lec.kind,
            "playback": _playback(lec),
            "needsTranscode": lec.needs_transcode,
            "hasSubtitle": lec.subtitle_path is not None,
            "durationSec": lec.duration_sec,
            "positionSec": p.position_sec if p else 0.0,
            "completed": bool(p.completed) if p else False,
            "stream": f"/api/lectures/{lec.id}/stream",
            "subtitle": f"/api/lectures/{lec.id}/subtitle" if lec.subtitle_path else None,
        }

    return {
        "slug": c.slug,
        "title": c.title,
        "category": c.category,
        "cover": _cover_url(c),
        "lectureCount": c.lecture_count,
        "completedCount": sum(1 for p in prog.values() if p.completed),
        "resumeLectureId": resume_id,
        "sections": [
            {
                "id": s.id,
                "title": s.title,
                "lectures": [lecture_json(lec) for lec in by_section.get(s.id, [])],
            }
            for s in sections
        ],
        "attachments": [{"id": a.id, "title": a.title, "kind": a.kind} for a in attachments],
    }
