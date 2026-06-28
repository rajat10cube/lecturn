"""Filesystem walk: produce an in-memory course tree from a library root.

Pure (no DB) — returns dataclasses the sync layer persists.
"""

from __future__ import annotations

import mimetypes
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

from . import classify as C
from .naming import clean_title, media_stem, sort_key, subtitle_base

_COVER_PRIORITY = ["cover", "poster", "folder", "thumb", "banner"]
_BUNDLE_SUFFIX_RE = re.compile(r"_ue[45]$", re.IGNORECASE)


@dataclass
class SLecture:
    rel_path: str          # relative to the library root (lookup key)
    title: str
    kind: str
    mime: str | None
    size: int
    needs_transcode: bool
    section_rel: str       # relative to the course content root ("" = root)
    subtitle_rel: str | None
    sort: tuple


@dataclass
class SSection:
    rel: str
    title: str
    sort: tuple


@dataclass
class SAttachment:
    rel_path: str
    title: str
    kind: str              # resource | link | bundle
    mime: str | None
    size: int


@dataclass
class SCourse:
    rel_path: str          # relative to the library root (identity)
    title: str
    category: str | None
    cover_rel: str | None
    sections: list[SSection]
    lectures: list[SLecture]
    attachments: list[SAttachment] = field(default_factory=list)


def _rel(p: Path, base: Path) -> str:
    return p.relative_to(base).as_posix()


def _hidden(name: str) -> bool:
    return name.startswith(".")


def _ignored_dir(name: str) -> bool:
    return _hidden(name) or name.lower() in C.IGNORE_DIRS


def is_bundle(d: Path) -> bool:
    n = d.name.lower()
    return n in C.BUNDLE_DIR_NAMES or bool(_BUNDLE_SUFFIX_RE.search(n))


def _safe_size(p: Path) -> int:
    try:
        return p.stat().st_size
    except OSError:
        return 0


def _has_direct_lecture(d: Path) -> bool:
    try:
        return any(e.is_file() and C.classify(e.name)[0] == "lecture" for e in d.iterdir())
    except OSError:
        return False


def _content_subdirs(d: Path) -> list[Path]:
    try:
        return [
            s for s in d.iterdir()
            if s.is_dir() and not _ignored_dir(s.name) and not is_bundle(s)
        ]
    except OSError:
        return []


def _classify_top(d: Path) -> str:
    """Classify a top-level dir as 'course', 'group', or 'skip'.

    The hard case is telling a *sectioned course* (course/section/lecture) from a
    *group of flat courses* (group/course/lecture) — identical one level down. We
    disambiguate by looking a level deeper: if lectures exist at the grandchild
    level, there is a course layer beneath ``d``'s children, so ``d`` is a group.
    """
    if _has_direct_lecture(d):
        return "course"  # flat course at the top level
    children = _content_subdirs(d)
    if any(_has_direct_lecture(g) for c in children for g in _content_subdirs(c)):
        return "group"   # grandchildren hold lectures -> children are courses
    if any(_has_direct_lecture(c) for c in children):
        return "course"  # children are sections
    return "skip"


def detect_group_depth(lib_root: Path) -> int:
    """Decide whether a library root holds courses (0) or grouping folders (1).

    Robust to the user reorganizing courses under software/provider folders.
    """
    tops = _content_subdirs(lib_root)
    if not tops:
        return 0
    votes = [_classify_top(d) for d in sorted(tops)[:40]]
    return 1 if votes.count("group") > votes.count("course") else 0


def iter_course_roots(lib_root: Path, group_depth: int) -> Iterator[tuple[Path, str | None]]:
    """Yield ``(course_dir, category)`` for a library root."""
    if group_depth <= 0:
        for d in sorted(lib_root.iterdir()):
            if d.is_dir() and not _ignored_dir(d.name):
                yield d, None
    else:
        for group in sorted(lib_root.iterdir()):
            if group.is_dir() and not _ignored_dir(group.name):
                for d in sorted(group.iterdir()):
                    if d.is_dir() and not _ignored_dir(d.name):
                        yield d, group.name


def _has_lecture_within(d: Path, cap: int) -> bool:
    """True if a lecture file exists in ``d`` or up to ``cap`` levels below it."""
    if cap <= 0:
        return False
    try:
        entries = list(d.iterdir())
    except OSError:
        return False
    if any(e.is_file() and C.classify(e.name)[0] == "lecture" for e in entries):
        return True
    for e in entries:
        if e.is_dir() and not _ignored_dir(e.name) and not is_bundle(e):
            if _has_lecture_within(e, cap - 1):
                return True
    return False


def _classify_dir(d: Path, cap: int) -> str:
    """'course' (lectures at depth 0 or 1), 'group' (lectures only deeper), or 'empty'."""
    if _has_direct_lecture(d):
        return "course"  # flat course
    kids = _content_subdirs(d)
    if any(_has_direct_lecture(k) for k in kids):
        return "course"  # sectioned course (a child directly holds lectures)
    if any(_has_lecture_within(k, cap) for k in kids):
        return "group"   # lectures live deeper -> this is a grouping folder
    return "empty"


def discover_courses(lib_root: Path, cap: int = 6) -> Iterator[tuple[Path, str | None]]:
    """Find course folders under a library root, descending grouping folders of any
    depth (e.g. Udemy / Unreal Engine 5 / <course>). Category = the nearest grouping
    folder name. Handles single-child wrapper folders as one course.
    """
    if _has_direct_lecture(lib_root):
        yield lib_root, None
        return
    for c in _content_subdirs(lib_root):
        yield from _discover(c, None, cap)


def _looks_like_wrapper(outer: Path, inner: Path) -> bool:
    """A redundant nested folder, e.g. 'Survival Kit 2.0/Environment Artist Survival Kit 2.0'."""
    a = re.sub(r"[^a-z0-9]", "", outer.name.lower())
    b = re.sub(r"[^a-z0-9]", "", inner.name.lower())
    return bool(a) and bool(b) and (a in b or b in a)


def _discover(d: Path, category: str | None, cap: int) -> Iterator[tuple[Path, str | None]]:
    cls = _classify_dir(d, cap)
    if cls == "course":
        yield d, category
    elif cls == "group":
        kids = _content_subdirs(d)
        # a duplicate-named single wrapper is one course (walk collapses it); a single
        # *distinct* child is a real grouping folder (e.g. a provider with one course)
        if len(kids) == 1 and _classify_dir(kids[0], cap) == "course" and _looks_like_wrapper(d, kids[0]):
            yield d, category
        else:
            for k in kids:
                yield from _discover(k, d.name, cap)
    # "empty" -> skip


def normalize_root(course_path: Path) -> tuple[Path, list[Path]]:
    """Collapse single wrapper folders; set aside resource bundles."""
    bundles: list[Path] = []
    root = course_path
    while True:
        try:
            entries = [e for e in root.iterdir() if not _ignored_dir(e.name)]
        except OSError:
            break
        files = [e for e in entries if e.is_file()]
        dirs = [e for e in entries if e.is_dir()]
        nonbundle: list[Path] = []
        for d in dirs:
            (bundles if is_bundle(d) else nonbundle).append(d)
        has_lecture = any(C.classify(f.name)[0] == "lecture" for f in files)
        if len(nonbundle) == 1 and not has_lecture and not _has_direct_lecture(nonbundle[0]):
            root = nonbundle[0]   # redundant wrapper -> descend
            continue
        return root, bundles


def walk_course(
    course_path: Path,
    lib_root: Path,
    category: str | None,
    section_max_depth: int,
    min_video_bytes: int,
) -> SCourse | None:
    content_root, bundles = normalize_root(course_path)

    lectures: list[SLecture] = []
    sections: dict[str, SSection] = {}
    attachments: list[SAttachment] = []
    images: list[tuple[int, int, Path]] = []  # (priority, depth, path)

    def add_section(section_rel: str, comp_names: list[str]) -> None:
        if section_rel in sections:
            return
        if section_rel == "":
            sections[section_rel] = SSection("", "Lectures", (-1,))
        else:
            title = " / ".join(clean_title(c, strip_ext=False) for c in comp_names)
            sections[section_rel] = SSection(section_rel, title, sort_key(comp_names[-1]))

    def recurse(d: Path, depth: int, comp_names: list[str]) -> None:
        try:
            entries = list(d.iterdir())
        except OSError:
            return
        files = [e for e in entries if e.is_file()]
        subdirs = [e for e in entries if e.is_dir()]

        # subtitle map for this directory (by language-stripped stem)
        subs: dict[str, str] = {}
        for f in files:
            if C.classify(f.name)[0] == "subtitle":
                subs[subtitle_base(media_stem(f.name)).lower()] = _rel(f, lib_root)

        section_rel = "" if d == content_root else _rel(d, content_root)
        has_lecture = False
        for f in files:
            cat, kind = C.classify(f.name)
            if cat in ("ignore", "subtitle"):
                continue
            if cat == "image":
                stem = media_stem(f.name).lower()
                pr = _COVER_PRIORITY.index(stem) if stem in _COVER_PRIORITY else len(_COVER_PRIORITY)
                images.append((pr, depth, f))
                continue
            if cat == "link":
                attachments.append(SAttachment(_rel(f, lib_root), clean_title(f.name), "link", None, _safe_size(f)))
                continue
            if cat == "resource":
                attachments.append(
                    SAttachment(_rel(f, lib_root), clean_title(f.name), "resource",
                                mimetypes.guess_type(f.name)[0], _safe_size(f))
                )
                continue
            # lecture
            size = _safe_size(f)
            if size == 0 or (kind == "video" and size < min_video_bytes):
                continue
            has_lecture = True
            lectures.append(
                SLecture(
                    rel_path=_rel(f, lib_root),
                    title=clean_title(f.name),
                    kind=kind,
                    mime=mimetypes.guess_type(f.name)[0],
                    size=size,
                    needs_transcode=Path(f.name).suffix.lower() in C.VIDEO_TRANSCODE,
                    section_rel=section_rel,
                    subtitle_rel=subs.get(media_stem(f.name).lower()),
                    sort=sort_key(f.name),
                )
            )
        if has_lecture:
            add_section(section_rel, comp_names or [content_root.name])

        if depth < section_max_depth:
            for sd in subdirs:
                if _ignored_dir(sd.name):
                    continue
                if is_bundle(sd):
                    attachments.append(SAttachment(_rel(sd, lib_root), "Project Files", "bundle", None, 0))
                    continue
                recurse(sd, depth + 1, comp_names + [sd.name])

    recurse(content_root, 0, [])
    for b in bundles:
        attachments.append(SAttachment(_rel(b, lib_root), "Project Files", "bundle", None, 0))

    if not lectures:
        return None

    cover_rel = None
    if images:
        images.sort(key=lambda t: (t[0], t[1]))
        cover_rel = _rel(images[0][2], lib_root)

    ordered_sections = sorted(sections.values(), key=lambda s: (s.sort, s.rel))
    # Order lectures by section order first, then natural filename order within a
    # section. (A global filename sort would interleave sections, since "001..."
    # repeats in every section.)
    sec_index = {s.rel: i for i, s in enumerate(ordered_sections)}
    lectures.sort(key=lambda lec: (sec_index.get(lec.section_rel, len(sec_index)), lec.sort, lec.rel_path))

    return SCourse(
        rel_path=_rel(course_path, lib_root),
        title=clean_title(course_path.name, strip_ext=False),
        category=category,
        cover_rel=cover_rel,
        sections=ordered_sections,
        lectures=lectures,
        attachments=attachments,
    )
