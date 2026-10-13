"""Chạy pytest cho 1 bài."""
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from . import config

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


def parse_junit(path: Path) -> list[dict]:
    """Đọc file junitxml → [{name, outcome: passed|failed|error, message}]. Bỏ qua test bị skip."""
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError):
        return []
    tests = []
    for tc in root.iter("testcase"):
        if tc.find("skipped") is not None:
            continue
        outcome, message = "passed", ""
        for tag in ("failure", "error"):
            el = tc.find(tag)
            if el is not None:
                outcome = "failed" if tag == "failure" else "error"
                lines = (el.text or "").strip().splitlines()
                message = el.get("message") or (lines[-1] if lines else "")
                break
        tests.append({"name": tc.get("name", ""), "outcome": outcome, "message": _short(message)})
    return tests


def run_tests(lesson_id: str) -> dict:
    ws = config.workspace_dir() / lesson_id
    tests = config.curriculum_dir() / lesson_id / "tests"
    if not ws.is_dir():
        raise RunnerError('Chưa có workspace cho bài này. Hãy bấm "Bắt đầu" trước.')
    if not tests.is_dir():
        raise RunnerError("Bài này chưa có test.")
    env = {**os.environ, "PYTHONPATH": os.pathsep.join([str(ws), os.environ.get("PYTHONPATH", "")]).rstrip(os.pathsep),
           "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    with tempfile.TemporaryDirectory(prefix="academy-junit-") as tmp:
        junit = Path(tmp) / "report.xml"
        cmd = [sys.executable, "-m", "pytest", str(tests), "-q", "--no-header", "-p", "no:cacheprovider",
               f"--junitxml={junit}", "-o", "junit_family=xunit1"]
        try:
            r = subprocess.run(cmd, cwd=ws, env=env, capture_output=True, text=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            return {"passed": 0, "failed": 0, "total": 0, "ok": False, "timeout": True, "tests": [],
                    "output": f"Quá {TIMEOUT} giây — test bị dừng. Kiểm tra vòng lặp vô hạn hoặc lệnh gọi mạng."}
        results = parse_junit(junit)
    out = (r.stdout or "") + (r.stderr or "")
    passed, failed = parse_counts(out)
    total = passed + failed
    ok = r.returncode == 0 and failed == 0 and passed > 0
    return {"passed": passed, "failed": failed, "total": total, "ok": ok,
            "timeout": False, "tests": results, "output": _trim(out)}
