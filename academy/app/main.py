"""FastAPI: phục vụ web/ và /api/*."""
import os
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, curriculum, llm, progress, runner

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
app = FastAPI(title="AI Academy")


class ChecklistIn(BaseModel):
    index: int
    done: bool


class TutorIn(BaseModel):
    lesson_id: str
    messages: list[dict]


class GradeIn(BaseModel):
    lesson_id: str
    question: str
    answer: str


def _ready_lessons():
    return [l for l in curriculum.all_lessons() if l.get("status", "ready") != "planned"]


def _workspace(lesson_id: str) -> Path:
    return config.workspace_dir() / lesson_id


def compute_status(lesson: dict, prev_passed: bool, first: bool, prog: dict) -> str:
    entry = prog["lessons"].get(lesson["id"], {})
    if lesson.get("status", "ready") == "planned":
        return "planned"
    if entry.get("passed"):
        return "passed"
    if not (first or prev_passed or entry.get("unlocked")):
        return "locked"
    if entry.get("started") or _workspace(lesson["id"]).is_dir():
        return "in_progress"
    return "not_started"


def all_statuses() -> dict[str, str]:
    prog = progress.load()
    out, prev_passed, first = {}, False, True
    for les in curriculum.all_lessons():
        st = compute_status(les, prev_passed, first, prog)
        out[les["id"]] = st
        if st != "planned":
            prev_passed, first = st == "passed", False
    return out


def _require_lesson(lesson_id: str) -> dict:
    meta = curriculum.load_meta(lesson_id)
    if meta is None:
        raise HTTPException(404, "Không tìm thấy bài học.")
    return meta


def _require_unlocked(lesson_id: str) -> None:
    st = all_statuses().get(lesson_id)
    if st == "locked":
        raise HTTPException(403, "Bài này đang khóa. Hoàn thành bài trước hoặc mở khóa thủ công.")
    if st == "planned":
        raise HTTPException(403, "Bài này sắp có.")


@app.get("/api/roadmap")
def get_roadmap():
    rm = curriculum.load_roadmap()
    statuses = all_statuses()
    prog = progress.load()
    learned: set[str] = set()
    for pid, st in statuses.items():
        if st == "passed":
            learned.update((curriculum.load_meta(pid) or {}).get("concepts", []))
    for proj in rm.get("projects", []):
        for les in proj.get("lessons", []):
            les["status_declared"] = les.get("status", "ready")
            les["status"] = statuses[les["id"]]
    taught: dict[str, list[str]] = {}  # concept → các bài dạy nó (theo thứ tự lộ trình)
    for les in curriculum.all_lessons(rm):
        cs = les.get("concepts") or (curriculum.load_meta(les["id"]) or {}).get("concepts", [])
        for c in cs:
            taught.setdefault(c, []).append(les["id"])
    for c in rm.get("concepts", []):
        c["learned"] = c["id"] in learned
        c["lessons"] = taught.get(c["id"], [])
    rm.setdefault("concept_edges", [])
    ready = _ready_lessons()
    rm["summary"] = {"total": len(ready), "passed": sum(1 for l in ready if statuses[l["id"]] == "passed"),
                     "planned": len(curriculum.all_lessons()) - len(ready)}
    rm["workspace_root"] = str(config.workspace_dir())
    rm["platform"] = "windows" if os.name == "nt" else "posix"
    rm["has_key"] = llm.get_api_key() is not None
    return rm


@app.get("/api/lessons/{lesson_id}")
def get_lesson(lesson_id: str):
    meta = _require_lesson(lesson_id)
    status = all_statuses().get(lesson_id, "not_started")
    entry = progress.load()["lessons"].get(lesson_id, {})
    return {
        "meta": meta,
        "markdown": curriculum.load_markdown(lesson_id),
        "workspace_path": str(_workspace(lesson_id).resolve()),
        "workspace_exists": _workspace(lesson_id).is_dir(),
        "status": status,
        "progress": {"checklist": entry.get("checklist", {}), "last_test": entry.get("last_test"),
                     "passed": bool(entry.get("passed"))},
    }


@app.post("/api/lessons/{lesson_id}/start")
def start_lesson(lesson_id: str):
    _require_lesson(lesson_id)
    _require_unlocked(lesson_id)
    ws = _workspace(lesson_id)
    starter = curriculum.lesson_dir(lesson_id) / "starter"
    created = False
    if not ws.exists():
        if starter.is_dir():
            shutil.copytree(starter, ws)
        else:
            ws.mkdir(parents=True)
        created = True
    progress.update(lesson_id, started=True)
    return {"workspace_path": str(ws.resolve()), "created": created}


@app.post("/api/lessons/{lesson_id}/test")
def test_lesson(lesson_id: str):
    _require_lesson(lesson_id)
    _require_unlocked(lesson_id)
    try:
        res = runner.run_tests(lesson_id)
    except runner.RunnerError as e:
        raise HTTPException(400, str(e))
    entry = {"passed": res["passed"], "failed": res["failed"], "total": res["total"], "tests": res.get("tests", [])}
    fields = {"last_test": entry}
    if res["ok"]:
        fields["passed"] = True
    progress.update(lesson_id, **fields)
    res["lesson_passed"] = bool(res["ok"]) or bool(progress.load()["lessons"][lesson_id].get("passed"))
    return res


@app.post("/api/lessons/{lesson_id}/checklist")
def set_checklist(lesson_id: str, body: ChecklistIn):
    meta = _require_lesson(lesson_id)
    if not 0 <= body.index < len(meta.get("checklist", [])):
        raise HTTPException(400, "Chỉ số checklist không hợp lệ.")
    return {"checklist": progress.set_checklist(lesson_id, body.index, body.done)["checklist"]}


@app.post("/api/lessons/{lesson_id}/unlock")
def unlock_lesson(lesson_id: str):
    _require_lesson(lesson_id)
    progress.update(lesson_id, unlocked=True)
    return {"status": all_statuses().get(lesson_id)}


def _workspace_files(lesson_id: str, limit: int = 6000) -> dict[str, str]:
    ws, files, used = _workspace(lesson_id), {}, 0
    if not ws.is_dir():
        return files
    for p in sorted(ws.rglob("*")):
        if used >= limit:
            break
        if not p.is_file() or "__pycache__" in p.parts or p.suffix not in {".py", ".md", ".txt", ".json", ".sql", ".yaml", ".yml"}:
            continue
        try:
            txt = p.read_text(encoding="utf-8")[: limit - used]
        except (OSError, UnicodeDecodeError):
            continue
        files[str(p.relative_to(ws))] = txt
        used += len(txt)
    return files


def _llm_error(e: Exception) -> JSONResponse:
    if isinstance(e, llm.NoKeyError):
        return JSONResponse({"error": llm.NO_KEY_MSG, "no_key": True}, status_code=503)
    return JSONResponse({"error": f"Không gọi được mô hình AI: {e}"}, status_code=502)


@app.post("/api/tutor")
def tutor(body: TutorIn):
    meta = _require_lesson(body.lesson_id)
    msgs = llm.build_tutor_messages(meta, curriculum.load_markdown(body.lesson_id),
                                    _workspace_files(body.lesson_id), body.messages)
    try:
        return {"reply": llm.chat(msgs, llm.TUTOR_MODEL, temperature=0.6)}
    except llm.LLMError as e:
        return _llm_error(e)


@app.post("/api/interview/grade")
def grade(body: GradeIn):
    _require_lesson(body.lesson_id)
    if not body.answer.strip():
        raise HTTPException(400, "Hãy nhập câu trả lời trước khi chấm.")
    try:
        return llm.grade(body.question, body.answer)
    except llm.LLMError as e:
        return _llm_error(e)


@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/", StaticFiles(directory=WEB_DIR), name="web")
