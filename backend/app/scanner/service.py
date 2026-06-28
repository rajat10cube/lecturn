"""Scan orchestration: walk every DB-registered library and sync into the DB.

Libraries are managed at runtime (added/removed via the API, like Jellyfin).
On first run, any libraries from the optional config/env are seeded into the DB.
Single-writer (a lock prevents concurrent scans).
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

from sqlalchemy import func, select

from ..config import get_settings
from ..db import SessionLocal
from ..models import Course, Library
from .walk import detect_group_depth, iter_course_roots, walk_course
from .sync import sync_course

_lock = threading.Lock()
_status: dict = {"running": False, "last_run": None, "last_summary": None}


def scan_status() -> dict:
    return dict(_status)


def seed_libraries_from_config() -> None:
    """If no libraries exist yet, import any from config/env (first-run convenience)."""
    settings = get_settings()
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(Library)):
            return
        for cfg in settings.libraries():
            db.add(Library(path=cfg.path, name=cfg.name,
                           group_depth=(-1 if isinstance(cfg.group_depth, str) else cfg.group_depth)))
        db.commit()


def run_scan() -> dict:
    if not _lock.acquire(blocking=False):
        return {"skipped": "scan already running"}

    _status["running"] = True
    t0 = time.time()
    settings = get_settings()
    summary = {"libraries": 0, "courses": 0, "lectures": 0, "skipped": []}
    try:
        with SessionLocal() as db:
            for lib in db.scalars(select(Library)).all():
                root = Path(lib.path)
                if not root.is_dir():
                    summary["skipped"].append(lib.path)
                    continue

                group_depth = lib.group_depth if lib.group_depth is not None and lib.group_depth >= 0 \
                    else detect_group_depth(root)
                summary["libraries"] += 1

                seen: set[str] = set()
                for course_path, category in iter_course_roots(root, group_depth):
                    sc = walk_course(
                        course_path, root, category,
                        settings.section_max_depth, settings.min_video_bytes,
                    )
                    if sc is None:
                        continue
                    sync_course(db, lib.id, sc)
                    seen.add(sc.rel_path)
                    summary["courses"] += 1
                    summary["lectures"] += len(sc.lectures)

                for c in db.scalars(select(Course).where(Course.library_id == lib.id)):
                    c.missing = c.path not in seen

                db.commit()

            from ..search import rebuild_index

            rebuild_index(db.connection())
            db.commit()

        _status["last_summary"] = summary
        _status["last_run"] = time.time()
    finally:
        _status["running"] = False
        _lock.release()

    summary["seconds"] = round(time.time() - t0, 2)
    return summary
