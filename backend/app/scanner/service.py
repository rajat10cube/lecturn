"""Scan orchestration: walk every DB-registered library and sync into the DB.

Libraries are managed at runtime (added/removed via the API). Each library is
scanned in isolation so one bad path (e.g. an unreadable mount) can't abort the
whole run, and live progress + per-library errors are exposed via scan_status().
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

from sqlalchemy import func, select

from ..config import get_settings
from ..db import SessionLocal
from ..models import Course, Library
from .walk import discover_courses, iter_course_roots, walk_course
from .sync import sync_course

_lock = threading.Lock()
_status: dict = {
    "running": False,
    "phase": "idle",
    "started": None,
    "finished": None,
    "librariesTotal": 0,
    "librariesDone": 0,
    "current": None,
    "courses": 0,
    "lectures": 0,
    "errors": [],
}


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


def _scan_library(db, settings, lib: Library) -> None:
    root = Path(lib.path)
    if not root.is_dir():
        _status["errors"].append({"library": lib.path, "error": "path not found inside the container"})
        return

    # group_depth >= 0 is an explicit override; otherwise auto-discover any nesting depth
    if lib.group_depth is not None and lib.group_depth >= 0:
        roots = iter_course_roots(root, lib.group_depth)
    else:
        roots = discover_courses(root)

    seen: set[str] = set()
    found = 0
    for course_path, category in roots:
        sc = walk_course(course_path, root, category, settings.section_max_depth, settings.min_video_bytes)
        if sc is None:
            continue
        sync_course(db, lib.id, sc)
        seen.add(sc.rel_path)
        found += 1
        _status["courses"] += 1
        _status["lectures"] += len(sc.lectures)

    for c in db.scalars(select(Course).where(Course.library_id == lib.id)):
        c.missing = c.path not in seen
    db.commit()

    if found == 0:
        _status["errors"].append(
            {"library": lib.path, "error": "no courses found — check the folder structure or read permissions"}
        )


def run_scan() -> dict:
    if not _lock.acquire(blocking=False):
        return {"skipped": "scan already running"}

    settings = get_settings()
    t0 = time.time()
    _status.update({
        "running": True, "phase": "scanning", "started": t0, "finished": None,
        "librariesDone": 0, "current": None, "courses": 0, "lectures": 0, "errors": [],
    })
    try:
        with SessionLocal() as db:
            libs = db.scalars(select(Library)).all()
            _status["librariesTotal"] = len(libs)
            for i, lib in enumerate(libs):
                _status["current"] = lib.path
                try:
                    _scan_library(db, settings, lib)
                except Exception as e:  # isolate failures per library
                    db.rollback()
                    _status["errors"].append({"library": lib.path, "error": repr(e)})
                finally:
                    _status["librariesDone"] = i + 1

            _status["phase"] = "indexing"
            _status["current"] = None
            from ..search import rebuild_index

            rebuild_index(db.connection())
            db.commit()
    finally:
        _status.update({"running": False, "phase": "idle", "finished": time.time()})
        _lock.release()

    return {
        "courses": _status["courses"],
        "lectures": _status["lectures"],
        "errors": _status["errors"],
        "seconds": round(time.time() - t0, 2),
    }
