"""Recursive course discovery across arbitrary grouping depth.

Guards the bug where nested folders (Udemy / Unreal Engine 5 / <course>) were
merged into a single course, and covers the provider/topic split where a course
two grouping levels deep records both its outer (provider) and nearest (topic)
folders.
"""

from pathlib import Path

from app.scanner.walk import discover_courses, walk_course


def _mk(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x" * 2048)


def _roots(lib: Path):
    return [(cp.name, prov, cat) for cp, prov, cat in discover_courses(lib)]


def test_three_level_nesting_splits_into_separate_courses(tmp_path):
    base = tmp_path / "courses"
    _mk(base / "Udemy" / "Unreal Engine 5" / "Animating in Unreal Engine" / "01 - Intro" / "001 a.mp4")
    _mk(base / "Udemy" / "Unreal Engine 5" / "Character creation for Unreal Engine" / "Ch1" / "001 b.mp4")

    roots = _roots(base)
    assert sorted(n for n, _, _ in roots) == [
        "Animating in Unreal Engine",
        "Character creation for Unreal Engine",
    ]
    # nearest grouping folder = topic, outermost = provider
    assert all(cat == "Unreal Engine 5" for _, _, cat in roots)
    assert all(prov == "Udemy" for _, prov, _ in roots)

    # each walks to its own course (not merged)
    courses = {
        cp.name: walk_course(cp, base, cat, 2, 0, provider=prov)
        for cp, prov, cat in discover_courses(base)
    }
    a = courses["Animating in Unreal Engine"]
    assert a.title == "Animating in Unreal Engine"
    assert a.category == "Unreal Engine 5" and a.provider == "Udemy"


def test_provider_and_topic_two_levels(tmp_path):
    base = tmp_path / "Courses"
    _mk(base / "Udemy" / "3D Art" / "Blender Environments" / "01 - Intro" / "001 a.mp4")
    _mk(base / "Gumroad" / "Character Art" / "ZBrush Sculpting" / "Ch1" / "001 b.mp4")

    roots = {cp.name: (prov, cat) for cp, prov, cat in discover_courses(base)}
    assert roots["Blender Environments"] == ("Udemy", "3D Art")
    assert roots["ZBrush Sculpting"] == ("Gumroad", "Character Art")


def test_provider_with_single_course_is_not_merged(tmp_path):
    base = tmp_path / "lib"
    _mk(base / "Udemy" / "Some Course" / "01 - Intro" / "001 a.mp4")
    # one grouping level: can't tell provider from topic, so it's the category
    assert _roots(base) == [("Some Course", None, "Udemy")]


def test_duplicate_named_wrapper_collapses_to_one_course(tmp_path):
    base = tmp_path / "lib"
    _mk(base / "StylizedStation" / "Survival Kit 2.0" / "Environment Artist Survival Kit 2.0" / "06 Trees" / "001 a.mp4")
    roots = _roots(base)
    assert len(roots) == 1
    name, prov, cat = roots[0]
    assert name == "Survival Kit 2.0" and cat == "StylizedStation" and prov is None


def test_flat_course_no_grouping(tmp_path):
    base = tmp_path / "lib"
    _mk(base / "My Course" / "01 - Intro" / "001 a.mp4")
    assert _roots(base) == [("My Course", None, None)]
