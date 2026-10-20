"""Chạy test cho 1 bài: pytest (khóa Python) hoặc `node --test` (khóa Node)."""
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from . import curriculum
from .config import Course

TIMEOUT = 60
MAX_OUT = 6000
MAX_MSG = 300


class RunnerError(Exception):
    pass


def _trim(s: str) -> str:
    return s if len(s) <= MAX_OUT else "...(đã cắt bớt)...\n" + s[-MAX_OUT:]


def parse_counts(out: str) -> tuple[int, int]:
    def n(word):
        m = re.search(rf"(\d+) {word}", out)
        return int(m.group(1)) if m else 0
    return n("passed"), n("failed") + n("error")


def _short(msg: str) -> str:
    """Dòng đầu có nghĩa của thông báo lỗi, bỏ tiền tố AssertionError."""
    lines = [ln.strip() for ln in (msg or "").splitlines() if ln.strip()]
    msg = lines[0] if lines else ""
    if msg.startswith("AssertionError:"):
        msg = msg[len("AssertionError:"):].strip() or (lines[1] if len(lines) > 1 else "")
    return msg if len(msg) <= MAX_MSG else msg[: MAX_MSG - 1] + "…"


def _node_message(text: str) -> str:
    """Thông báo trong <failure> của node --test.

    Dạng "[Error [ERR_TEST_FAILURE]: <msg>] {...}" (test cấp file) hoặc "Error [ERR_TEST_FAILURE]: <msg>\n    at ..."
    (test trong describe). Lấy dòng đầu của <msg>; nếu dòng đó kết thúc bằng ":" (vd. "Expected values to be
    strictly equal:") thì nối thêm dòng có nghĩa tiếp theo ("0 !== 3").
    """
    body = re.sub(r"^\s*\[?Error \[ERR_TEST_FAILURE\]: ", "", text or "")
    lines = []
    for ln in body.splitlines():
        ln = ln.strip()
        if ln.startswith(("at ", "] {", "{")):
            break
        if ln:
            lines.append(re.sub(r"\] \{$", "", ln))
    if not lines:
        return ""
    msg = lines[0]
    if msg.endswith(":") and len(lines) > 1:
        msg += " " + lines[1]
    return msg


def _testcases(el, prefix=""):
    """(tên, testcase) theo thứ tự; tên test trong describe() của node được ghép "nhóm › test"."""
    for ch in el:
        if ch.tag == "testcase":
            yield prefix + ch.get("name", ""), ch
        elif ch.tag == "testsuite":
            yield from _testcases(ch, f"{prefix}{ch.get('name', '')} › " if ch.get("name") else prefix)


def parse_junit(path: Path, nested_names: bool = False) -> list[dict]:
    """Đọc file junitxml → [{name, outcome: passed|failed|error, message}]. Bỏ qua test bị skip.

    nested_names=True (node --test): tên test nằm trong testsuite lồng nhau được ghép tiền tố tên suite.
    """
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError):
        return []
    tests = []
    pairs = _testcases(root) if nested_names else ((tc.get("name", ""), tc) for tc in root.iter("testcase"))
    for name, tc in pairs:
        if tc.find("skipped") is not None:
            continue
        outcome, message = "passed", ""
        for tag in ("failure", "error"):
            el = tc.find(tag)
            if el is not None:
                outcome = "failed" if tag == "failure" else "error"
                lines = (el.text or "").strip().splitlines()
                if "ERR_TEST_FAILURE" in (el.text or ""):  # node --test
                    message = _node_message(el.text)
                else:
                    message = el.get("message") or (lines[-1] if lines else "")
                break
        tests.append({"name": name, "outcome": outcome, "message": _short(message)})
    return tests


def _timeout_result() -> dict:
    return {"passed": 0, "failed": 0, "total": 0, "ok": False, "timeout": True, "tests": [],
            "output": f"Quá {TIMEOUT} giây — test bị dừng. Kiểm tra vòng lặp vô hạn, server chưa đóng hoặc lệnh gọi mạng."}


def run_tests(course: Course, lesson_id: str) -> dict:
    ws = course.workspace / lesson_id
    tests = course.curriculum / lesson_id / "tests"
    if not ws.is_dir():
        raise RunnerError('Chưa có workspace cho bài này. Hãy bấm "Bắt đầu" trước.')
    if not tests.is_dir():
        raise RunnerError("Bài này chưa có test.")
    if curriculum.language(course) == "node":
        _require_node_modules(course)
        return _run_node(ws, tests)
    return _run_pytest(ws, tests)


def _require_node_modules(course: Course) -> None:
    """Khóa Node có thư viện trong package.json mà chưa `npm install` → báo rõ cách sửa thay vì lỗi import khó hiểu."""
    pkg = course.root / "package.json"
    try:
        deps = json.loads(pkg.read_text(encoding="utf-8")).get("dependencies") if pkg.is_file() else None
    except (OSError, ValueError):
        deps = None
    if deps and not (course.root / "node_modules").is_dir():
        raise RunnerError(f"Khóa này chưa cài thư viện Node ({', '.join(deps)}). Mở terminal tại thư mục "
                          f"{course.root} và chạy `npm install` (hoặc chạy lại ./start.sh / .\\start.ps1), rồi thử lại.")


def _run_pytest(ws: Path, tests: Path) -> dict:
    env = {**os.environ, "PYTHONPATH": os.pathsep.join([str(ws), os.environ.get("PYTHONPATH", "")]).rstrip(os.pathsep),
           "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    with tempfile.TemporaryDirectory(prefix="academy-junit-") as tmp:
        junit = Path(tmp) / "report.xml"
        cmd = [sys.executable, "-m", "pytest", str(tests), "-q", "--no-header", "-p", "no:cacheprovider",
               f"--junitxml={junit}", "-o", "junit_family=xunit1"]
        try:
            r = subprocess.run(cmd, cwd=ws, env=env, capture_output=True, text=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            return _timeout_result()
        results = parse_junit(junit)
    out = (r.stdout or "") + (r.stderr or "")
    passed, failed = parse_counts(out)
    total = passed + failed
    ok = r.returncode == 0 and failed == 0 and passed > 0
    return {"passed": passed, "failed": failed, "total": total, "ok": ok,
            "timeout": False, "tests": results, "output": _trim(out)}


def _run_node(ws: Path, tests: Path) -> dict:
    """node --test với cwd = workspace (test nạp code học viên qua process.cwd()).

    Node chạy mỗi file test trong tiến trình con → chạy trong process group riêng để khi quá giờ
    giết được cả cây (server WebSocket chưa đóng không làm treo app).
    """
    node = shutil.which("node")
    if not node:
        raise RunnerError("Không tìm thấy lệnh `node`. Hãy cài Node.js 22 trở lên (https://nodejs.org) "
                          "rồi mở lại terminal và chạy lại app.")
    files = sorted(str(p) for p in tests.glob("*.test.js"))
    if not files:
        raise RunnerError("Bài này chưa có test.")
    env = {**os.environ, "NODE_ENV": "test", "FORCE_COLOR": "0", "NO_COLOR": "1"}
    with tempfile.TemporaryDirectory(prefix="academy-junit-") as tmp:
        junit = Path(tmp) / "report.xml"
        cmd = [node, "--test", "--test-force-exit",
               "--test-reporter=junit", f"--test-reporter-destination={junit}",
               "--test-reporter=spec", "--test-reporter-destination=stdout", *files]
        proc = subprocess.Popen(cmd, cwd=ws, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8", errors="replace", start_new_session=os.name != "nt")
        try:
            stdout, stderr = proc.communicate(timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            try:
                if os.name == "nt":  # proc.kill() chỉ giết node cha; taskkill /T giết cả tiến trình con
                    subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
                else:
                    os.killpg(proc.pid, signal.SIGKILL)
            except OSError:
                pass
            try:
                proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            return _timeout_result()
        results = parse_junit(junit, nested_names=True)
    out = (stdout or "") + (stderr or "")
    # File test không nạp được (lỗi cú pháp, thiếu export...): node báo 1 testcase mang tên đường dẫn file
    load_err = re.search(r"^\s*(\w*Error\b.*)$", out, re.M)
    for t in results:
        if t["name"] in files and t["outcome"] != "passed":
            t.update(name=Path(t["name"]).name, outcome="error",
                     message=_short(load_err.group(1)) if load_err else "Không nạp được file test.")
    if results:
        passed = sum(t["outcome"] == "passed" for t in results)
        failed = len(results) - passed
    else:  # không có junit (node lỗi sớm) → đọc tổng kết của reporter spec
        n = lambda w: int(m.group(1)) if (m := re.search(rf"^ℹ {w} (\d+)", out, re.M)) else 0
        passed, failed = n("pass"), n("fail") + n("cancelled")
    ok = proc.returncode == 0 and failed == 0 and passed > 0
    return {"passed": passed, "failed": failed, "total": passed + failed, "ok": ok,
            "timeout": False, "tests": results, "output": _trim(out)}
