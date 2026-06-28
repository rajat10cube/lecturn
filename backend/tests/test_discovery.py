"""Recursive course discovery across arbitrary grouping depth.

Guards the bug where nested folders (Udemy / Unreal Engine 5 / <course>) were
merged into a single course.
"""

from pathlib import Path

from app.scanner.walk import discover_courses, walk_course


def _mk(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x" * 2048)


def _roots(lib: Path):
    return [(cp.name, cat) for cp, cat in discover_courses(lib)]


def test_three_level_nesting_splits_into_separate_courses(tmp_path):
    base = tmp_path / "courses"
    _mk(base / "Udemy" / "Unreal Engine 5" / "Animating in Unreal Engine" / "01 - Intro" / "001 a.mp4")
    _mk(base / "Udemy" / "Unreal Engine 5" / "Character creation for Unreal Engine" / "Ch1" / "001 b.mp4")

    roots = _roots(base)
    assert sorted(n for n, _ in roots) == [
        "Animating in Unreal Engine",
        "Character creation for Unreal Engine",
    ]
    assert all(cat == "Unreal Engine 5" for _, cat in roots)  # nearest grouping folder

    # each walks to its own course (not merged)
    courses = {cp.name: walk_course(cp, base, cat, 2, 0) for cp, cat in discover_courses(base)}
    assert courses["Animating in Unreal Engine"].title == "Animating in Unreal Engine"
    assert courses["Character creation for Unreal Engine"].title == "Character creation for Unreal Engine"


def test_provider_with_single_course_is_not_merged(tmp_path):
    base = tmp_path / "lib"
    _mk(base / "Udemy" / "Some Course" / "01 - Intro" / "001 a.mp4")
    assert _roots(base) == [("Some Course", "Udemy")]


def test_duplicate_named_wrapper_collapses_to_one_course(tmp_path):
    base = tmp_path / "lib"
    _mk(base / "StylizedStation" / "Survival Kit 2.0" / "Environment Artist Survival Kit 2.0" / "06 Trees" / "001 a.mp4")
    roots = _roots(base)
    assert len(roots) == 1
    name, cat = roots[0]
    assert name == "Survival Kit 2.0" and cat == "StylizedStation"


def test_flat_course_no_grouping(tmp_path):
    base = tmp_path / "lib"
    _mk(base / "My Course" / "01 - Intro" / "001 a.mp4")
    assert _roots(base) == [("My Course", None)]
