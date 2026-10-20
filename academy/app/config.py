"""Khóa học và đường dẫn của từng khóa.

- Khóa "ai" (AI & Data): thư mục cũ ở gốc academy/ — curriculum/, workspace/, data/, cache/.
  ACADEMY_CURRICULUM / ACADEMY_WORKSPACE / ACADEMY_DATA / ACADEMY_CACHE ghi đè riêng cho khóa này.
- Mỗi academy/courses/<id>/curriculum/roadmap.json là một khóa, id = tên thư mục, có curriculum/,
  workspace/, data/, cache/ riêng.
ACADEMY_ROOT đổi gốc (test dùng tmp_path); khóa được dò lại ở mỗi request (chỉ vài lệnh stat).
"""
import os
import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_COURSE = "ai"
COURSE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


@dataclass(frozen=True)
class Course:
    id: str
    root: Path        # gốc khóa: nơi có package.json / node_modules của khóa Node
    curriculum: Path
    workspace: Path
    data: Path
    cache: Path       # cache lời gọi LLM (…/cache/llm)


def root() -> Path:
    return Path(os.environ.get("ACADEMY_ROOT") or DEFAULT_ROOT)


def _ai_course() -> Course:
    r = root()
    d = lambda env, name: Path(os.environ[env]) if os.environ.get(env) else r / name
    return Course(DEFAULT_COURSE, r, d("ACADEMY_CURRICULUM", "curriculum"), d("ACADEMY_WORKSPACE", "workspace"),
                  d("ACADEMY_DATA", "data"), d("ACADEMY_CACHE", "cache") / "llm")


def _folder_course(course_id: str) -> Course:
    base = root() / "courses" / course_id
    return Course(course_id, base, base / "curriculum", base / "workspace", base / "data", base / "cache" / "llm")


def _exists(c: Course) -> bool:
    return (c.curriculum / "roadmap.json").is_file()


def get_course(course_id: str) -> Course | None:
    """Khóa theo id; None nếu id sai định dạng hoặc không có roadmap.json."""
    if not COURSE_ID_RE.match(course_id or ""):
        return None
    c = _ai_course() if course_id == DEFAULT_COURSE else _folder_course(course_id)
    return c if _exists(c) else None


def courses() -> list[Course]:
    """Mọi khóa: "ai" trước, rồi courses/<id>/ theo tên thư mục."""
    out = [c for c in [_ai_course()] if _exists(c)]
    base = root() / "courses"
    if base.is_dir():
        for d in sorted(base.iterdir()):
            if d.name != DEFAULT_COURSE and COURSE_ID_RE.match(d.name) and d.is_dir():
                c = _folder_course(d.name)
                if _exists(c):
                    out.append(c)
    return out
