"""Một server, nhiều khóa: /api/courses, route /api/c/{course}/…, tách tiến độ, kiểm tra id khóa."""
import json

import pytest

from app import llm


def _w(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


@pytest.fixture
def node_course(env):
    """Khóa Node trong courses/node-x/, cố ý dùng trùng id bài "L01-a" với khóa ai để kiểm tra tách dữ liệu."""
    root = env / "courses" / "node-x"
    _w(root / "package.json", json.dumps({"type": "module", "private": True}))
    rm = {"title": "Node.js & WebSocket — TeamPulse", "short_title": "Node.js & WebSocket", "language": "node",
          "logo_mark": "JS", "product": {"name": "TeamPulse", "tagline": "Chat realtime"},
          "projects": [{"id": "P1", "title": "P", "track": "Node", "lessons": [
              {"id": "L01-a", "title": "A", "goal": "g", "status": "ready"},
              {"id": "N02-b", "title": "B", "goal": "g", "status": "planned"}]}]}
    _w(root / "curriculum" / "roadmap.json", json.dumps(rm))
    meta = {"id": "L01-a", "title": "Node A", "goal": "g", "entry": "calc.js", "concepts": [],
            "checklist": ["x"], "interview_questions": ["Q?"], "tutor_notes": ""}
    _w(root / "curriculum" / "L01-a" / "meta.json", json.dumps(meta))
    _w(root / "curriculum" / "L01-a" / "lesson.md", "## Mục tiêu\nnode")
    _w(root / "curriculum" / "L01-a" / "starter" / "calc.js", "export const add = () => 0;\n")
    _w(root / "curriculum" / "L01-a" / "tests" / "calc.test.js", "import 'node:test';\n")
    # không phải khóa: thiếu roadmap.json, tên sai định dạng
    (env / "courses" / "empty").mkdir()
    _w(env / "courses" / "Bad_Name" / "curriculum" / "roadmap.json", json.dumps(rm))
    return root


def test_courses_lists_python_and_node(client, node_course):
    cs = client.get("/api/courses").json()
    assert [c["id"] for c in cs] == ["ai", "node-x"]
    ai, nx = cs
    assert (ai["language"], ai["title"], ai["short_title"], ai["logo_mark"]) == ("python", "T", "T", "AI")
    assert (ai["projects"], ai["lessons"], ai["passed"], ai["planned"]) == (1, 2, 0, 1)
    assert nx == {"id": "node-x", "title": "Node.js & WebSocket — TeamPulse", "short_title": "Node.js & WebSocket",
                  "logo_mark": "JS", "language": "node", "product_name": "TeamPulse", "tagline": "Chat realtime",
                  "projects": 1, "lessons": 1, "passed": 0, "in_progress": 0, "planned": 1}


def test_course_roadmaps_are_separate(client, node_course):
    ai = client.get("/api/c/ai/roadmap").json()
    nx = client.get("/api/c/node-x/roadmap").json()
    assert (ai["course"], ai["language"]) == ("ai", "python")
    assert (nx["course"], nx["language"], nx["logo_mark"]) == ("node-x", "node", "JS")
    assert nx["workspace_root"] == str(node_course / "workspace")
    assert client.get("/api/c/node-x/lessons/L01-a").json()["meta"]["title"] == "Node A"
    assert client.get("/api/c/ai/lessons/L01-a").json()["meta"]["title"] == "L01-a"


def test_progress_isolated_between_courses(client, env, node_course):
    assert client.post("/api/c/node-x/lessons/L01-a/start").json()["created"] is True
    client.post("/api/c/node-x/lessons/L01-a/checklist", json={"index": 0, "done": True})
    assert (node_course / "workspace" / "L01-a" / "calc.js").is_file()
    assert not (env / "workspace" / "L01-a").exists()
    assert json.loads((node_course / "data" / "progress.json").read_text())["lessons"]["L01-a"]["started"] is True
    assert not (env / "data" / "progress.json").exists()
    ai = client.get("/api/c/ai/lessons/L01-a").json()
    assert ai["status"] == "not_started" and ai["progress"]["checklist"] == {}
    assert client.get("/api/c/node-x/lessons/L01-a").json()["status"] == "in_progress"

    # khóa ai qua bài → chỉ khóa ai đổi
    client.post("/api/c/ai/lessons/L01-a/start")
    (env / "workspace" / "L01-a" / "calc.py").write_text("def add(a, b):\n    return a + b\n")
    assert client.post("/api/c/ai/lessons/L01-a/test").json()["ok"] is True
    cs = {c["id"]: c for c in client.get("/api/courses").json()}
    assert (cs["ai"]["passed"], cs["node-x"]["passed"], cs["node-x"]["in_progress"]) == (1, 0, 1)
    assert client.get("/api/c/node-x/lessons/L01-a").json()["progress"]["passed"] is False


@pytest.mark.parametrize("cid", ["nope", "Bad_Name", "empty", "AI", "%2e%2e", "..%2F..%2Fcurriculum", "a" * 80])
def test_unknown_or_invalid_course_404(client, env, node_course, cid):
    assert client.get(f"/api/c/{cid}/roadmap").status_code == 404
    assert client.get(f"/api/c/{cid}/lessons/L01-a").status_code == 404
    # %2F được giải mã thành "/" trước khi khớp route → không khớp route nào (404/405), không đụng ổ đĩa
    assert client.post(f"/api/c/{cid}/lessons/L01-a/start").status_code in (404, 405)
    assert client.post(f"/api/c/{cid}/tutor", json={"lesson_id": "L01-a", "messages": []}).status_code in (404, 405)
    assert not (env / "workspace").exists() and not (env / "data").exists()


def test_lesson_traversal_404(client, node_course):
    assert client.get("/api/c/node-x/lessons/..%2F..%2Fcurriculum").status_code == 404
    assert client.get("/api/c/node-x/lessons/.hidden").status_code == 404


def test_legacy_routes_alias_ai_course(client, node_course):
    assert client.get("/api/roadmap").json() == client.get("/api/c/ai/roadmap").json()
    assert client.get("/api/lessons/L01-a").json()["meta"]["title"] == "L01-a"
    assert client.post("/api/lessons/L01-a/checklist", json={"index": 1, "done": True}).status_code == 200
    assert client.get("/api/c/ai/lessons/L01-a").json()["progress"]["checklist"] == {"1": True}


def test_node_course_without_node_modules_explains(client, node_course):
    pkg = {"type": "module", "dependencies": {"ws": "8.22.0"}}
    (node_course / "package.json").write_text(json.dumps(pkg))
    client.post("/api/c/node-x/lessons/L01-a/start")
    r = client.post("/api/c/node-x/lessons/L01-a/test")
    assert r.status_code == 400 and "npm install" in r.json()["detail"] and "ws" in r.json()["detail"]


def test_grade_cache_per_course(client, env, node_course, monkeypatch):
    class Fake:
        def __init__(self):
            self.chat = self.completions = self

        def create(self, model, messages, **kw):
            m = type("M", (), {"content": '{"score": 6, "strengths": [], "gaps": [], "better_answer": ""}'})
            return type("R", (), {"choices": [type("C", (), {"message": m})]})
    monkeypatch.setattr(llm, "get_api_key", lambda: "k")
    monkeypatch.setattr(llm, "_client", lambda key: Fake())
    r = client.post("/api/c/node-x/interview/grade", json={"lesson_id": "L01-a", "question": "q", "answer": "a"})
    assert r.json()["score"] == 6
    assert list((node_course / "cache" / "llm").glob("*.json")) and not (env / "cache").exists()


def test_ai_course_dir_overrides(client, env, tmp_path, monkeypatch):
    ws = tmp_path / "other-ws"
    monkeypatch.setenv("ACADEMY_WORKSPACE", str(ws))
    client.post("/api/c/ai/lessons/L01-a/start")
    assert (ws / "L01-a" / "calc.py").is_file() and not (env / "workspace").exists()
