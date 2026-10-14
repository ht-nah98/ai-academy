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


def test_brief_passthrough(client, env):
    cur = env / "curriculum"
    rm = json.loads((cur / "roadmap.json").read_text())
    rm["product_map"] = {"nodes": [{"id": "src", "title": "Nguồn"}, {"id": "db", "title": "CSDL"}], "edges": [["src", "db"]]}
    rm["projects"][0]["brief"] = {"goal": "g", "deliverable": "d"}
    (cur / "roadmap.json").write_text(json.dumps(rm))
    meta = json.loads((cur / "L01-a" / "meta.json").read_text())
    meta["brief"] = {"context": "c", "problem": "p", "requirements": [{"task": "add", "purpose": "u"}],
                     "deliverable": "d", "constraints": ["k"], "product_nodes": ["src"]}
    (cur / "L01-a" / "meta.json").write_text(json.dumps(meta))
    r = client.get("/api/roadmap").json()
    assert r["product_map"]["edges"] == [["src", "db"]]
    assert r["projects"][0]["brief"] == {"goal": "g", "deliverable": "d"}
    les = {l["id"]: l for l in r["projects"][0]["lessons"]}
    assert les["L01-a"]["product_nodes"] == ["src"] and les["L02-b"]["product_nodes"] == []
    assert les["L03-c"]["product_nodes"] == []  # bài planned không có meta
    b = client.get("/api/lessons/L01-a").json()["meta"]["brief"]
    assert b["requirements"][0] == {"task": "add", "purpose": "u"} and b["constraints"] == ["k"]


def test_legacy_story_ignored(client, env):
    meta_p = env / "curriculum" / "L01-a" / "meta.json"
    meta = json.loads(meta_p.read_text())
    meta["story"] = {"product_nodes": ["src"]}
    meta_p.write_text(json.dumps(meta))
    les = {l["id"]: l for p in client.get("/api/roadmap").json()["projects"] for l in p["lessons"]}
    assert les["L01-a"]["product_nodes"] == []


def test_roadmap_without_brief(client):
    r = client.get("/api/roadmap").json()
    assert "product_map" not in r and all(l["product_nodes"] == [] for p in r["projects"] for l in p["lessons"])


def test_static_assets_not_cached_stale(client):
    r = client.get("/style.css")
    assert r.status_code == 200
    assert r.headers.get("cache-control") == "no-cache"


def test_index_versions_assets_by_content_hash(client, tmp_path, monkeypatch):
    import hashlib
    import re
    import shutil
    from app import main
    web = tmp_path / "web"
    shutil.copytree(main.WEB_DIR, web)
    monkeypatch.setattr(main, "WEB_DIR", web)
    sha = lambda name: hashlib.sha1((web / name).read_bytes()).hexdigest()[:10]
    r = client.get("/")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-cache"
    assert f'href="style.css?v={sha("style.css")}"' in r.text
    assert f'src="app.js?v={sha("app.js")}"' in r.text
    assert "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js\"" in r.text  # CDN giữ nguyên
    assert not re.search(r'(?:href|src)="(?:style\.css|app\.js)"', r.text)
    old = sha("style.css")
    with open(web / "style.css", "a", encoding="utf-8") as f:
        f.write("\n/* đổi nội dung */\n")
    r2 = client.get("/")
    assert sha("style.css") != old and f"style.css?v={sha('style.css')}" in r2.text and old not in r2.text
    assert client.get("/index.html").text == r2.text
    assert client.get(f"/style.css?v={sha('style.css')}").status_code == 200


def test_brief_workflow_passthrough(client, env):
    meta_p = env / "curriculum" / "L01-a" / "meta.json"
    meta = json.loads(meta_p.read_text())
    wf = {"flow": "chain", "inputs": [{"label": "JOBS", "detail": "8 tin"}],
          "steps": [{"task": "add", "label": "Cộng hai số"}], "outputs": [{"label": "3", "detail": "add(1, 2)"}]}
    meta["brief"] = {"context": "c", "problem": "p", "requirements": [{"task": "add", "purpose": "u"}], "workflow": wf}
    meta_p.write_text(json.dumps(meta))
    assert client.get("/api/lessons/L01-a").json()["meta"]["brief"]["workflow"] == wf


def test_real_curriculum_workflows_cover_tasks():
    from pathlib import Path
    cur = Path(__file__).resolve().parent.parent / "curriculum"
    metas = sorted(cur.glob("L*/meta.json"))
    assert metas
    for p in metas:
        m = json.loads(p.read_text(encoding="utf-8"))
        wf = m["brief"]["workflow"]
        fns = [t["fn"] for t in m["tasks"]]
        steps = [s["task"] for s in wf["steps"]]
        assert sorted(steps) == sorted(fns) and len(set(steps)) == len(steps), p
        assert wf["inputs"] and wf["outputs"] and wf.get("flow", "chain") in ("chain", "parallel"), p
        for x in wf["inputs"] + wf["outputs"] + wf["steps"]:
            assert x["label"].strip() and len(x["label"].split()) <= 6, (p, x)
            assert len(x.get("detail", "").split()) <= 8, (p, x)
