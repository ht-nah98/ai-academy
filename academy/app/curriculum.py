"""Đọc roadmap.json, meta.json, lesson.md của một khóa."""
import json
import re
from pathlib import Path

from .config import Course

LANGUAGES = ("python", "node")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


def valid_id(lesson_id: str) -> bool:
    return bool(ID_RE.match(lesson_id))


def load_roadmap(course: Course) -> dict:
    p = course.curriculum / "roadmap.json"
    if not p.exists():
        return {"title": "AI Academy", "concept_groups": [], "concepts": [], "projects": []}
    return json.loads(p.read_text(encoding="utf-8"))


def language(course: Course, roadmap: dict | None = None) -> str:
    """Ngôn ngữ chấm bài của khóa: "python" (mặc định) hoặc "node"."""
    lang = (roadmap if roadmap is not None else load_roadmap(course)).get("language") or "python"
    return lang if lang in LANGUAGES else "python"


def all_lessons(course: Course, roadmap: dict | None = None) -> list[dict]:
    """Danh sách phẳng các bài theo thứ tự, kèm project_id."""
    roadmap = roadmap or load_roadmap(course)
    out = []
    for proj in roadmap.get("projects", []):
        for les in proj.get("lessons", []):
            out.append({**les, "project_id": proj["id"]})
    return out


def lesson_dir(course: Course, lesson_id: str) -> Path | None:
    if not valid_id(lesson_id):
        return None
    d = course.curriculum / lesson_id
    return d if d.is_dir() else None


def load_meta(course: Course, lesson_id: str) -> dict | None:
    d = lesson_dir(course, lesson_id)
    if not d or not (d / "meta.json").exists():
        return None
    return json.loads((d / "meta.json").read_text(encoding="utf-8"))


def load_markdown(course: Course, lesson_id: str) -> str:
    d = lesson_dir(course, lesson_id)
    if not d or not (d / "lesson.md").exists():
        return ""
    return (d / "lesson.md").read_text(encoding="utf-8")
