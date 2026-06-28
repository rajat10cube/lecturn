"""Scan orchestration: walk every configured library and sync into the DB.

Single-writer (a lock prevents concurrent scans). Runs in a worker thread when
called from a sync route or via run_in_executor.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

from sqlalchemy import select

from ..config import get_settings
from ..db import SessionLocal
from ..models import Course, Library
from .walk import detect_group_depth, iter_course_roots, walk_course
from .sync import sync_course

_lock = threading.Lock()
_status: dict = {"running": False, "last_run": None, "last_summary": None}


def scan_status() -> dict:
    return dict(_status)


def run_scan() -> dict:
    settings = get_settings()
    if not _lock.acquire(blocking=False):
        return {"skipped": "scan already running"}

    _status["running"] = True
    t0 = time.time()
    summary = {"libraries": 0, "courses": 0, "lectures": 0, "skipped_roots": []}
    try:
        with SessionLocal() as db:
            for cfg in settings.libraries():
                root = Path(cfg.path)
                if not root.is_dir():
                    summary["skipped_roots"].append(cfg.path)
                    continue

                group_depth = cfg.group_depth
                if isinstance(group_depth, str):  # "auto"
                    group_depth = detect_group_depth(root)

                lib = db.scalar(select(Library).where(Library.path == cfg.path))
                if lib is None:
                    lib = Library(path=cfg.path, group_depth=group_depth, name=cfg.name)
                    db.add(lib)
                    db.flush()
                else:
                    lib.group_depth = group_depth
                summary["libraries"] += 1
                summary.setdefault("group_depths", {})[cfg.path] = group_depth

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

            # refresh the full-text search index from the freshly scanned rows
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
