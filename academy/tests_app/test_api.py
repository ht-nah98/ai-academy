import json

from app import llm


def statuses(client):
    return {l["id"]: l["status"] for p in client.get("/api/roadmap").json()["projects"] for l in p["lessons"]}


def solve(env):
    (env / "workspace" / "L01-a" / "calc.py").write_text("def add(a, b):\n    return a + b\n")


def test_roadmap_initial(client):
    assert statuses(client) == {"L01-a": "not_started", "L02-b": "locked", "L03-c": "planned"}
    r = client.get("/api/roadmap").json()
    assert r["summary"] == {"total": 2, "passed": 0, "planned": 1}
    assert not any(c["learned"] for c in r["concepts"])


def test_roadmap_platform(client):
    import os
    assert client.get("/api/roadmap").json()["platform"] == ("windows" if os.name == "nt" else "posix")


def test_lesson_detail_and_404(client, env):
    d = client.get("/api/lessons/L01-a").json()
    assert d["meta"]["id"] == "L01-a" and "xin chào" in d["markdown"]
    assert d["workspace_path"].endswith("workspace/L01-a") and not d["workspace_exists"]
    assert client.get("/api/lessons/nope").status_code == 404
    assert client.get("/api/lessons/..%2Fx").status_code == 404


def test_test_before_start_errors(client):
    r = client.post("/api/lessons/L01-a/test")
    assert r.status_code == 400 and "Bắt đầu" in r.json()["detail"]


def test_start_copies_and_does_not_overwrite(client, env):
    assert client.post("/api/lessons/L01-a/start").json()["created"] is True
    f = env / "workspace" / "L01-a" / "calc.py"
    f.write_text("mine")
    assert client.post("/api/lessons/L01-a/start").json()["created"] is False
    assert f.read_text() == "mine"
    assert statuses(client)["L01-a"] == "in_progress"


def test_fail_then_pass_unlocks_next(client, env):
    client.post("/api/lessons/L01-a/start")
    r = client.post("/api/lessons/L01-a/test").json()
    assert (r["passed"], r["failed"], r["ok"]) == (0, 1, False)
    assert statuses(client)["L01-a"] == "in_progress"
    solve(env)
    r = client.post("/api/lessons/L01-a/test").json()
    assert (r["passed"], r["failed"], r["total"], r["ok"]) == (1, 0, 1, True)
    s = statuses(client)
    assert s["L01-a"] == "passed" and s["L02-b"] == "not_started" and s["L03-c"] == "planned"
    rm = client.get("/api/roadmap").json()
    assert {c["id"]: c["learned"] for c in rm["concepts"]} == {"c1": True, "c2": False}
    assert rm["summary"]["passed"] == 1
    assert json.loads((env / "data" / "progress.json").read_text())["lessons"]["L01-a"]["passed"] is True


def test_locked_blocks_start_until_manual_unlock(client):
    assert client.post("/api/lessons/L02-b/start").status_code == 403
    assert client.post("/api/lessons/L02-b/unlock").json()["status"] == "not_started"
    assert client.post("/api/lessons/L02-b/start").status_code == 200


def test_checklist(client):
    r = client.post("/api/lessons/L01-a/checklist", json={"index": 1, "done": True})
    assert r.json()["checklist"] == {"1": True}
    assert client.get("/api/lessons/L01-a").json()["progress"]["checklist"] == {"1": True}
    assert client.post("/api/lessons/L01-a/checklist", json={"index": 9, "done": True}).status_code == 400


def test_runner_timeout(client, env, monkeypatch):
    from app import runner
    monkeypatch.setattr(runner, "TIMEOUT", 1)
    client.post("/api/lessons/L01-a/start")
    (env / "curriculum" / "L01-a" / "tests" / "test_slow.py").write_text("import time\ndef test_s():\n    time.sleep(5)\n")
    r = client.post("/api/lessons/L01-a/test").json()
    assert r["timeout"] and not r["ok"]


def test_no_key_gives_vietnamese_error(client):
    r = client.post("/api/tutor", json={"lesson_id": "L01-a", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503 and "NVIDIA_API_KEY" in r.json()["error"]
    r = client.post("/api/interview/grade", json={"lesson_id": "L01-a", "question": "q", "answer": "a"})
    assert r.status_code == 503 and r.json()["no_key"]
    assert client.get("/api/roadmap").json()["has_key"] is False


def test_tutor_and_grade_with_fake_llm(client, env, monkeypatch):
    seen = {}

    def fake_chat(msgs, model, **kw):
        seen.setdefault("calls", []).append((model, msgs))
        if model == llm.GRADER_MODEL:
            return '```json\n{"score": 7, "strengths": ["a"], "gaps": ["b"], "better_answer": "c"}\n```'
        return "gợi ý"
    monkeypatch.setattr(llm, "chat", fake_chat)
    client.post("/api/lessons/L01-a/start")
    r = client.post("/api/tutor", json={"lesson_id": "L01-a", "messages": [{"role": "user", "content": "help"}]})
    assert r.json() == {"reply": "gợi ý"}
    system = seen["calls"][0][1][0]["content"]
    assert "def add" in system and "xin chào" in system  # có code học sinh + lesson.md
    g = client.post("/api/interview/grade", json={"lesson_id": "L01-a", "question": "q", "answer": "a"}).json()
    assert g["score"] == 7 and g["gaps"] == ["b"]


def test_index_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "AI Academy" in r.text
