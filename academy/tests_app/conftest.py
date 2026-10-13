import json

import pytest
from fastapi.testclient import TestClient


def _w(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


@pytest.fixture
def env(tmp_path, monkeypatch):
    cur = tmp_path / "curriculum"
    roadmap = {
        "title": "T", "concept_groups": [{"id": "g", "title": "G"}],
        "concepts": [{"id": "c1", "title": "C1", "group": "g"}, {"id": "c2", "title": "C2", "group": "g"}],
        "projects": [{"id": "P0", "title": "P", "goal": "g", "track": "AI", "lessons": [
            {"id": "L01-a", "title": "A", "goal": "ga", "status": "ready"},
            {"id": "L02-b", "title": "B", "goal": "gb", "status": "ready"},
            {"id": "L03-c", "title": "C", "goal": "gc", "status": "planned"}]}]}
    _w(cur / "roadmap.json", json.dumps(roadmap))
    for lid, cs in (("L01-a", ["c1"]), ("L02-b", ["c2"])):
        meta = {"id": lid, "title": lid, "goal": "g", "duration_min": 10, "concepts": cs, "entry": "calc.py",
                "checklist": ["x", "y"], "interview_questions": ["Q1?"], "tutor_notes": "n"}
        _w(cur / lid / "meta.json", json.dumps(meta))
        _w(cur / lid / "lesson.md", "## Mục tiêu\nxin chào")
        _w(cur / lid / "starter" / "calc.py", "def add(a, b):\n    return 0\n")
        _w(cur / lid / "tests" / "test_calc.py", "from calc import add\n\ndef test_add():\n    assert add(1, 2) == 3\n")
    monkeypatch.setenv("ACADEMY_ROOT", str(tmp_path))
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    from app import llm
    monkeypatch.setattr(llm, "_env_candidates", lambda: [tmp_path / "nope.env"])
    return tmp_path


@pytest.fixture
def client(env):
    from app.main import app
    return TestClient(app)
