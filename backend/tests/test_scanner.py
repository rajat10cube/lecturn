from pathlib import Path

from app.scanner.walk import detect_group_depth, iter_course_roots, walk_course


def _write(p: Path, data: bytes = b"x" * 2048) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def _build_library(root: Path) -> None:
    # Sectioned course with an interleaved .html lesson + subtitle + resource
    a = root / "Course A"
    _write(a / "01 - Intro" / "001 Welcome.mp4")
    _write(a / "01 - Intro" / "001 Welcome_en.srt", b"1\n00:00 --> 00:01\nhi\n")
    _write(a / "01 - Intro" / "002 Notes.html", b"<p>notes</p>")
    _write(a / "01 - Intro" / "external-links.txt", b"http://x")
    _write(a / "02 - Deep" / "001 Topic.mkv")  # needs_transcode
    # Flat course (files at root)
    _write(root / "Course B" / "01 Lesson.mp4")
    # Wrapper folder + a bundle that must be excluded
    inner = root / "Course C" / "Course C Wrapper"
    _write(inner / "01 - Start" / "001 Hello.mp4")
    _write(root / "Course C" / "Files" / "deep" / "asset.uasset")


def test_walk_sectioned_course(tmp_path: Path):
    _build_library(tmp_path)
    courses = {
        cp.name: walk_course(cp, tmp_path, cat, section_max_depth=2, min_video_bytes=0)
        for cp, cat in iter_course_roots(tmp_path, group_depth=0)
    }

    a = courses["Course A"]
    assert a is not None
    assert [s.title for s in a.sections] == ["Intro", "Deep"]
    # lectures must be grouped by section order, not interleaved by global filename
    assert a.lectures[0].section_rel == a.sections[0].rel
    assert a.lectures[0].title == "Welcome"
    titles = [lec.title for lec in a.lectures]
    assert "Welcome" in titles and "Notes" in titles
    welcome = next(lec for lec in a.lectures if lec.title == "Welcome")
    assert welcome.subtitle_rel is not None          # subtitle bound
    assert any(lec.kind == "document" for lec in a.lectures)  # .html lesson
    topic = next(lec for lec in a.lectures if lec.title == "Topic")
    assert topic.needs_transcode is True             # .mkv flagged
    assert any(att.kind == "resource" for att in a.attachments)  # external-links.txt


def test_walk_flat_course(tmp_path: Path):
    _build_library(tmp_path)
    courses = {
        cp.name: walk_course(cp, tmp_path, cat, section_max_depth=2, min_video_bytes=0)
        for cp, cat in iter_course_roots(tmp_path, group_depth=0)
    }
    b = courses["Course B"]
    assert b is not None
    assert [s.title for s in b.sections] == ["Lectures"]
    assert len(b.lectures) == 1


def test_detect_group_depth_flat_courses(tmp_path: Path):
    # root/Course/Section/lecture  -> top dirs are courses -> depth 0
    _write(tmp_path / "Course A" / "01 - Intro" / "001 Welcome.mp4")
    _write(tmp_path / "Course B" / "01 Lesson.mp4")  # flat course
    assert detect_group_depth(tmp_path) == 0


def test_detect_group_depth_grouped(tmp_path: Path):
    # root/Provider/Course/Section/lecture -> top dirs are groups -> depth 1
    _write(tmp_path / "Udemy" / "Course X" / "01 - Intro" / "001 A.mp4")
    _write(tmp_path / "Udemy" / "Course Y" / "01 - Intro" / "001 B.mp4")
    _write(tmp_path / "ArtStation" / "Course Z" / "02 - Deep" / "001 C.mp4")
    assert detect_group_depth(tmp_path) == 1
    # and grouping yields the provider as category
    roots = dict((cp.name, cat) for cp, cat in iter_course_roots(tmp_path, 1))
    assert roots["Course X"] == "Udemy"


def test_walk_collapses_wrapper_and_excludes_bundle(tmp_path: Path):
    _build_library(tmp_path)
    c = walk_course(tmp_path / "Course C", tmp_path, None, section_max_depth=2, min_video_bytes=0)
    assert c is not None
    # wrapper collapsed -> section is "Start", not "Course C Wrapper / Start"
    assert [s.title for s in c.sections] == ["Start"]
    assert len(c.lectures) == 1
    # the Files/*.uasset bundle is excluded from lectures, surfaced as one bundle
    assert all(lec.title != "asset" for lec in c.lectures)
    assert any(att.kind == "bundle" for att in c.attachments)
