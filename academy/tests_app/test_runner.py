"""Runner trả kết quả từng test (qua junitxml) để UI tô thẻ nhiệm vụ."""
import json


def _setup(env, client, test_src, code):
    (env / "curriculum" / "L01-a" / "tests" / "test_calc.py").write_text(test_src)
    client.post("/api/c/ai/lessons/L01-a/start")
    (env / "workspace" / "L01-a" / "calc.py").write_text(code)


TESTS = '''from calc import add, sub

def test_add_ok():
    assert add(1, 2) == 3

def test_add_negative():
    assert add(-1, -1) == -2

def test_sub_basic():
    assert sub(5, 3) == 2, "sub(5, 3) phải trả 2"

def test_sub_boom():
    raise RuntimeError("nổ")
'''


def test_per_test_results(client, env):
    _setup(env, client, TESTS, "def add(a, b):\n    return a + b\n\ndef sub(a, b):\n    return 0\n")
    r = client.post("/api/c/ai/lessons/L01-a/test").json()
    assert (r["passed"], r["failed"], r["total"], r["ok"]) == (2, 2, 4, False)
    by = {t["name"]: t for t in r["tests"]}
    assert set(by) == {"test_add_ok", "test_add_negative", "test_sub_basic", "test_sub_boom"}
    assert by["test_add_ok"] == {"name": "test_add_ok", "outcome": "passed", "message": ""}
    assert by["test_sub_basic"]["outcome"] == "failed"
    assert by["test_sub_basic"]["message"] == "sub(5, 3) phải trả 2"  # bỏ tiền tố AssertionError, 1 dòng
    assert by["test_sub_boom"]["outcome"] == "failed" and "nổ" in by["test_sub_boom"]["message"]
    assert "output" in r and "timeout" in r  # giữ các trường cũ
    saved = json.loads((env / "data" / "progress.json").read_text())["lessons"]["L01-a"]["last_test"]
    assert [t["name"] for t in saved["tests"]] == [t["name"] for t in r["tests"]]
    assert client.get("/api/c/ai/lessons/L01-a").json()["progress"]["last_test"]["tests"] == r["tests"]


def test_import_error_reported_as_error(client, env):
    _setup(env, client, TESTS, "def add(a, b):\n    return a +\n")  # SyntaxError → lỗi collect
    r = client.post("/api/c/ai/lessons/L01-a/test").json()
    assert not r["ok"] and r["tests"] and all(t["outcome"] == "error" for t in r["tests"])
    assert r["tests"][0]["message"]


def test_all_pass(client, env):
    _setup(env, client, TESTS.replace('raise RuntimeError("nổ")', "pass"),
           "def add(a, b):\n    return a + b\n\ndef sub(a, b):\n    return a - b\n")
    r = client.post("/api/c/ai/lessons/L01-a/test").json()
    assert r["ok"] and [t["outcome"] for t in r["tests"]] == ["passed"] * 4


def test_parse_junit_bad_file(tmp_path):
    from app import runner
    assert runner.parse_junit(tmp_path / "missing.xml") == []
    (tmp_path / "bad.xml").write_text("<not xml")
    assert runner.parse_junit(tmp_path / "bad.xml") == []


def test_roadmap_concept_lessons_and_edges(client, env):
    rm = client.get("/api/c/ai/roadmap").json()
    assert rm["concept_edges"] == []
    assert {c["id"]: c["lessons"] for c in rm["concepts"]} == {"c1": ["L01-a"], "c2": ["L02-b"]}
    p = env / "curriculum" / "roadmap.json"
    data = json.loads(p.read_text())
    data["concept_edges"] = [["c1", "c2"]]
    p.write_text(json.dumps(data))
    assert client.get("/api/c/ai/roadmap").json()["concept_edges"] == [["c1", "c2"]]
