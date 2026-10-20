"""Tiến độ của mỗi khóa lưu ở <data của khóa>/progress.json."""
import json
import threading

from .config import Course

_lock = threading.Lock()


def _path(course: Course):
    return course.data / "progress.json"


def load(course: Course) -> dict:
    p = _path(course)
    if not p.exists():
        return {"lessons": {}}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"lessons": {}}
    data.setdefault("lessons", {})
    return data


def save(course: Course, data: dict) -> None:
    p = _path(course)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def update(course: Course, lesson_id: str, **fields) -> dict:
    with _lock:
        data = load(course)
        entry = data["lessons"].setdefault(lesson_id, {})
        entry.update(fields)
        save(course, data)
        return entry


def set_checklist(course: Course, lesson_id: str, index: int, done: bool) -> dict:
    with _lock:
        data = load(course)
        entry = data["lessons"].setdefault(lesson_id, {})
        cl = entry.setdefault("checklist", {})
        cl[str(index)] = bool(done)
        save(course, data)
        return entry
