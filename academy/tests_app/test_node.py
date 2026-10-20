"""Khóa Node: roadmap "language": "node" → chấm bằng `node --test` thật qua API."""
import json
import shutil

import pytest
from fastapi.testclient import TestClient

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="cần Node.js")

TESTS = """import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const { add, sub } = await import(pathToFileURL(join(process.cwd(), 'calc.js')).href);

test('add cộng hai số', () => {
  assert.equal(add(1, 2), 3, 'add(1, 2) phải trả 3');
});

describe('sub', () => {
  test('trừ hai số', () => { assert.equal(sub(5, 3), 2); });
  test.skip('bỏ qua', () => {});
});
"""
STARTER = "export function add(a, b) {\n  // TODO\n  return 0;\n}\n\nexport function sub(a, b) {\n  return 0;\n}\n"
SOLUTION = "export function add(a, b) { return a + b; }\nexport function sub(a, b) { return a - b; }\n"


def _w(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


@pytest.fixture
def node_env(tmp_path, monkeypatch):
    """Khóa Node tí hon: package.json "type": "module" ở gốc khóa (bao cả curriculum/ và workspace/)."""
    root = tmp_path / "courses" / "node-x"
    _w(root / "package.json", json.dumps({"type": "module", "private": True}))
    cur = root / "curriculum"
    roadmap = {"title": "Node.js & WebSocket", "language": "node",
               "projects": [{"id": "P1", "title": "P", "track": "Node", "lessons": [
                   {"id": "N01-calc", "title": "Calc", "goal": "g", "status": "ready"}]}]}
    _w(cur / "roadmap.json", json.dumps(roadmap))
    meta = {"id": "N01-calc", "title": "Calc", "goal": "g", "duration_min": 10, "entry": "calc.js", "concepts": [],
            "checklist": [], "interview_questions": ["Q?"], "tutor_notes": "",
            "tasks": [{"fn": "add", "test_prefix": "add"}, {"fn": "sub", "test_prefix": "sub"}]}
    _w(cur / "N01-calc" / "meta.json", json.dumps(meta))
    _w(cur / "N01-calc" / "lesson.md", "## Mục tiêu\nchào")
    _w(cur / "N01-calc" / "starter" / "calc.js", STARTER)
    _w(cur / "N01-calc" / "tests" / "calc.test.js", TESTS)
    monkeypatch.setenv("ACADEMY_ROOT", str(tmp_path))
    from app import llm
    monkeypatch.setattr(llm, "_env_candidates", lambda: [tmp_path / "nope.env"])
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    from app.main import app
    return root, TestClient(app)


def test_language_defaults_to_python(client):
    rm = client.get("/api/c/ai/roadmap").json()
    assert rm["language"] == "python" and rm["title"] == "T"


def test_roadmap_exposes_language_and_title(node_env):
    _, c = node_env
    rm = c.get("/api/c/node-x/roadmap").json()
    assert (rm["language"], rm["title"]) == ("node", "Node.js & WebSocket")
    assert rm["concepts"] == [] and rm["concept_groups"] == []  # trường tùy chọn thiếu → mảng rỗng


@needs_node
def test_node_fail_then_pass(node_env):
    root, c = node_env
    assert c.post("/api/c/node-x/lessons/N01-calc/start").json()["created"] is True
    r = c.post("/api/c/node-x/lessons/N01-calc/test").json()
    assert (r["passed"], r["failed"], r["total"], r["ok"], r["timeout"]) == (0, 2, 2, False, False)
    by = {t["name"]: t for t in r["tests"]}
    assert set(by) == {"add cộng hai số", "sub › trừ hai số"}  # test bị skip không tính
    assert by["add cộng hai số"] == {"name": "add cộng hai số", "outcome": "failed", "message": "add(1, 2) phải trả 3"}
    assert by["sub › trừ hai số"]["message"] == "Expected values to be strictly equal: 0 !== 2"
    assert "ℹ fail 2" in r["output"]

    (root / "workspace" / "N01-calc" / "calc.js").write_text(SOLUTION)
    r = c.post("/api/c/node-x/lessons/N01-calc/test").json()
    assert (r["passed"], r["failed"], r["ok"]) == (2, 0, True)
    assert [t["outcome"] for t in r["tests"]] == ["passed", "passed"]
    assert c.get("/api/c/node-x/lessons/N01-calc").json()["progress"]["passed"] is True


@needs_node
def test_node_syntax_error_is_error(node_env):
    root, c = node_env
    c.post("/api/c/node-x/lessons/N01-calc/start")
    (root / "workspace" / "N01-calc" / "calc.js").write_text("export function add(a, b) { return a +\n")
    r = c.post("/api/c/node-x/lessons/N01-calc/test").json()
    assert not r["ok"] and r["failed"] == 1
    assert r["tests"] == [{"name": "calc.test.js", "outcome": "error", "message": "SyntaxError: Unexpected end of input"}]


@needs_node
def test_node_timeout_kills_tree(node_env, monkeypatch):
    root, c = node_env
    from app import runner
    monkeypatch.setattr(runner, "TIMEOUT", 3)
    c.post("/api/c/node-x/lessons/N01-calc/start")
    (root / "workspace" / "N01-calc" / "calc.js").write_text("while (true) {}\nexport const add = 1, sub = 1;\n")
    r = c.post("/api/c/node-x/lessons/N01-calc/test").json()
    assert r["timeout"] is True and not r["ok"]


def test_missing_node_binary(node_env, monkeypatch):
    _, c = node_env
    from app import runner
    monkeypatch.setattr(runner.shutil, "which", lambda name: None)
    c.post("/api/c/node-x/lessons/N01-calc/start")
    r = c.post("/api/c/node-x/lessons/N01-calc/test")
    assert r.status_code == 400 and "Node.js" in r.json()["detail"]


def test_workspace_files_include_js_skip_node_modules(node_env):
    root, c = node_env
    c.post("/api/c/node-x/lessons/N01-calc/start")
    ws = root / "workspace" / "N01-calc"
    _w(ws / "public" / "index.html", "<h1>x</h1>")
    _w(ws / "node_modules" / "ws" / "index.js", "module.exports = 1")
    _w(ws / "package-lock.json", "{}")
    from app import config
    from app.main import _workspace_files
    assert sorted(_workspace_files(config.get_course("node-x"), "N01-calc")) == ["calc.js", "public/index.html"]


def test_tutor_and_grader_prompts_follow_language():
    from app import llm
    node = llm.build_tutor_messages({"title": "t"}, "", {}, [], language="node")[0]["content"]
    py = llm.build_tutor_messages({"title": "t"}, "", {}, [])[0]["content"]
    assert "Node.js" in node and "Python" not in node and "Python" in py
    assert "Node.js" in llm.GRADER_SYSTEM_NODE and "AI/Data" in llm.GRADER_SYSTEM
