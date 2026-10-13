"""Tiến độ lưu ở data/progress.json."""
import json
import threading

from . import config

_lock = threading.Lock()


def _path():
    return config.data_dir() / "progress.json"


def load() -> dict:
    p = _path()
    if not p.exists():
        return {"lessons": {}}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"lessons": {}}
    data.setdefault("lessons", {})
    return data


def save(data: dict) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def update(lesson_id: str, **fields) -> dict:
    with _lock:
        data = load()
        entry = data["lessons"].setdefault(lesson_id, {})
        entry.update(fields)
        save(data)
        return entry


def set_checklist(lesson_id: str, index: int, done: bool) -> dict:
    with _lock:
        data = load()
        entry = data["lessons"].setdefault(lesson_id, {})
        cl = entry.setdefault("checklist", {})
        cl[str(index)] = bool(done)
        save(data)
        return entry
