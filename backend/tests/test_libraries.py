import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)
AUTH = ("admin", "change-me")


def _make_course(root: Path) -> None:
    f = root / "CourseX" / "01 - Intro" / "001 Welcome.mp4"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(b"x" * 1_100_000)  # above the default min-video-bytes threshold


def _wait_course(title: str, timeout: float = 5.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        courses = client.get("/api/courses", auth=AUTH).json()["courses"]
        if any(c["title"] == title for c in courses):
            return True
        time.sleep(0.1)
    return False


def test_browse_lists_subdirs(tmp_path):
    (tmp_path / "sub1").mkdir()
    (tmp_path / "sub2").mkdir()
    r = client.get("/api/libraries/browse", params={"path": str(tmp_path)}, auth=AUTH)
    assert r.status_code == 200
    names = [d["name"] for d in r.json()["dirs"]]
    assert "sub1" in names and "sub2" in names


def test_browse_requires_auth():
    assert client.get("/api/libraries/browse", params={"path": "/"}).status_code == 401


def test_add_scan_then_delete_cascades(tmp_path):
    _make_course(tmp_path)
    r = client.post("/api/libraries", json={"path": str(tmp_path), "name": "Test"}, auth=AUTH)
    assert r.status_code == 201
    lib_id = r.json()["id"]

    libs = client.get("/api/libraries", auth=AUTH).json()
    assert any(lib["id"] == lib_id and lib["accessible"] for lib in libs)

    assert _wait_course("CourseX"), "scan should discover the course after adding the library"

    assert client.delete(f"/api/libraries/{lib_id}", auth=AUTH).status_code == 204
    libs2 = client.get("/api/libraries", auth=AUTH).json()
    assert all(lib["id"] != lib_id for lib in libs2)
    courses = client.get("/api/courses", auth=AUTH).json()["courses"]
    assert all(c["title"] != "CourseX" for c in courses)  # cascade removed its courses


def test_has_categories_flag_controls_topic_layer(tmp_path):
    # Provider/Category/Course/Section/lecture
    f = tmp_path / "Blender" / "Donut Course" / "01 - Intro" / "001 a.mp4"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(b"x" * 1_100_000)

    r = client.post(
        "/api/libraries",
        json={"path": str(tmp_path), "name": "Gumroad", "has_categories": True},
        auth=AUTH,
    )
    assert r.status_code == 201
    lib_id = r.json()["id"]
    assert _wait_course("Donut Course"), "category-aware scan should find the course"

    card = next(c for c in client.get("/api/courses", auth=AUTH).json()["courses"] if c["title"] == "Donut Course")
    assert card["provider"] == "Gumroad"  # from the library name
    assert card["category"] == "Blender"   # the category subfolder

    libs = client.get("/api/libraries", auth=AUTH).json()
    assert next(lib for lib in libs if lib["id"] == lib_id)["hasCategories"] is True

    # flipping it off re-scans as flat -> the Blender folder becomes the course
    assert client.put(f"/api/libraries/{lib_id}", json={"has_categories": False}, auth=AUTH).status_code == 200
    assert _wait_course("Blender"), "flat re-scan should treat the top folder as the course"


def test_add_invalid_path(tmp_path):
    r = client.post("/api/libraries", json={"path": str(tmp_path / "nope")}, auth=AUTH)
    assert r.status_code == 400


def test_add_duplicate(tmp_path):
    _make_course(tmp_path)
    assert client.post("/api/libraries", json={"path": str(tmp_path)}, auth=AUTH).status_code == 201
    assert client.post("/api/libraries", json={"path": str(tmp_path)}, auth=AUTH).status_code == 409
