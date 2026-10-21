"""FastAPI: phục vụ web/ và /api/*."""
import hashlib
import os
import re
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, curriculum, llm, progress, runner
from .config import Course

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
app = FastAPI(title="AI Academy")
_LEGACY_API = ("/api/roadmap", "/api/lessons/", "/api/tutor", "/api/interview/")


@app.middleware("http")
async def no_stale_assets(request, call_next):
    """Bắt trình duyệt kiểm tra lại HTML/CSS/JS mỗi lần tải (tránh dùng bản cũ sau khi cập nhật).

    Route cũ không có khóa (/api/roadmap, /api/lessons/…, /api/tutor, /api/interview/…) là alias của khóa "ai".
    """
    path = request.scope["path"]
    if path.startswith(_LEGACY_API):
        request.scope["path"] = f"/api/c/{config.DEFAULT_COURSE}" + path[len("/api"):]
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-cache")
    return response


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


def _course(course_id: str) -> Course:
    c = config.get_course(course_id)
    if c is None:
        raise HTTPException(404, "Không tìm thấy khóa học.")
    return c


def _workspace(course: Course, lesson_id: str) -> Path:
    return course.workspace / lesson_id


def compute_status(course: Course, lesson: dict, prev_passed: bool, first: bool, prog: dict) -> str:
    entry = prog["lessons"].get(lesson["id"], {})
    if lesson.get("status", "ready") == "planned":
        return "planned"
    if entry.get("passed"):
        return "passed"
    # Bài đã bắt đầu không bị khóa lại (vd. khi lộ trình chèn thêm bài phía trước)
    if entry.get("started") or _workspace(course, lesson["id"]).is_dir():
        return "in_progress"
    if not (first or prev_passed or entry.get("unlocked")):
        return "locked"
    return "not_started"


def all_statuses(course: Course, roadmap: dict | None = None) -> dict[str, str]:
    prog = progress.load(course)
    out, prev_passed, first = {}, False, True
    for les in curriculum.all_lessons(course, roadmap):
        st = compute_status(course, les, prev_passed, first, prog)
        out[les["id"]] = st
        if st != "planned":
            prev_passed, first = st == "passed", False
    return out


def _require_lesson(course: Course, lesson_id: str) -> dict:
    meta = curriculum.load_meta(course, lesson_id)
    if meta is None:
        raise HTTPException(404, "Không tìm thấy bài học.")
    return meta


def _require_unlocked(course: Course, lesson_id: str) -> None:
    st = all_statuses(course).get(lesson_id)
    if st == "locked":
        raise HTTPException(403, "Bài này đang khóa. Hoàn thành bài trước hoặc mở khóa thủ công.")
    if st == "planned":
        raise HTTPException(403, "Bài này sắp có.")


def _brand(rm: dict, lang: str) -> dict:
    """Tên/logo hiển thị của khóa (mặc định theo ngôn ngữ)."""
    title = rm.get("title") or "AI Academy"
    return {"title": title, "short_title": rm.get("short_title") or title,
            "logo_mark": rm.get("logo_mark") or ("JS" if lang == "node" else "AI")}


@app.get("/api/courses")
def list_courses():
    """Thư viện khóa học: mỗi khóa kèm sản phẩm, số project/bài và tiến độ."""
    out = []
    for c in config.courses():
        rm = curriculum.load_roadmap(c)
        lang = curriculum.language(c, rm)
        st = list(all_statuses(c, rm).values())
        pr = rm.get("product") if isinstance(rm.get("product"), dict) else {}
        out.append({"id": c.id, **_brand(rm, lang), "language": lang,
                    "product_name": pr.get("name", ""), "tagline": pr.get("tagline", ""),
                    "projects": len(rm.get("projects", [])),
                    "lessons": sum(s != "planned" for s in st), "passed": st.count("passed"),
                    "in_progress": st.count("in_progress"), "planned": st.count("planned")})
    return out


@app.get("/api/c/{course_id}/roadmap")
def get_roadmap(course_id: str):
    course = _course(course_id)
    rm = curriculum.load_roadmap(course)
    statuses = all_statuses(course, rm)
    lessons = curriculum.all_lessons(course, rm)
    metas = {l["id"]: curriculum.load_meta(course, l["id"]) or {} for l in lessons}
    learned: set[str] = set()
    taught: dict[str, list[str]] = {}  # concept → các bài dạy nó (theo thứ tự lộ trình)
    for les in lessons:
        meta = metas[les["id"]]
        if statuses[les["id"]] == "passed":
            learned.update(meta.get("concepts", []))
        for c in les.get("concepts") or meta.get("concepts", []):
            taught.setdefault(c, []).append(les["id"])
    for proj in rm.get("projects", []):
        for les in proj.get("lessons", []):
            meta = metas[les["id"]]
            brief = meta.get("brief") if isinstance(meta.get("brief"), dict) else {}
            les["status"] = statuses[les["id"]]
            les["product_nodes"] = brief.get("product_nodes", [])
            les["duration_min"] = meta.get("duration_min")
    for c in rm.get("concepts", []):
        c["learned"] = c["id"] in learned
        c["lessons"] = taught.get(c["id"], [])
    for k in ("concept_edges", "concept_groups", "concepts", "projects"):
        rm.setdefault(k, [])
    rm["language"] = curriculum.language(course, rm)
    rm.update(_brand(rm, rm["language"]))
    rm["course"] = course.id
    ready = [l for l in lessons if statuses[l["id"]] != "planned"]
    rm["summary"] = {"total": len(ready), "passed": sum(1 for l in ready if statuses[l["id"]] == "passed"),
                     "planned": len(lessons) - len(ready)}
    rm["workspace_root"] = str(course.workspace)
    rm["platform"] = "windows" if os.name == "nt" else "posix"
    rm["has_key"] = llm.get_api_key() is not None
    return rm


@app.get("/api/c/{course_id}/lessons/{lesson_id}")
def get_lesson(course_id: str, lesson_id: str):
    course = _course(course_id)
    meta = _require_lesson(course, lesson_id)
    status = all_statuses(course).get(lesson_id, "not_started")
    entry = progress.load(course)["lessons"].get(lesson_id, {})
    ws = _workspace(course, lesson_id)
    return {
        "meta": meta,
        "markdown": curriculum.load_markdown(course, lesson_id),
        "workspace_path": str(ws.resolve()),
        "workspace_exists": ws.is_dir(),
        "status": status,
        "progress": {"checklist": entry.get("checklist", {}), "last_test": entry.get("last_test"),
                     "passed": bool(entry.get("passed"))},
    }


@app.post("/api/c/{course_id}/lessons/{lesson_id}/start")
def start_lesson(course_id: str, lesson_id: str):
    course = _course(course_id)
    _require_lesson(course, lesson_id)
    _require_unlocked(course, lesson_id)
    ws = _workspace(course, lesson_id)
    starter = curriculum.lesson_dir(course, lesson_id) / "starter"
    created = False
    if not ws.exists():
        if starter.is_dir():
            shutil.copytree(starter, ws, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".omc", ".pytest_cache", "node_modules"))
        else:
            ws.mkdir(parents=True)
        created = True
    progress.update(course, lesson_id, started=True)
    return {"workspace_path": str(ws.resolve()), "created": created}


@app.post("/api/c/{course_id}/lessons/{lesson_id}/test")
def test_lesson(course_id: str, lesson_id: str):
    course = _course(course_id)
    _require_lesson(course, lesson_id)
    _require_unlocked(course, lesson_id)
    try:
        res = runner.run_tests(course, lesson_id)
    except runner.RunnerError as e:
        raise HTTPException(400, str(e))
    entry = {"passed": res["passed"], "failed": res["failed"], "total": res["total"], "tests": res.get("tests", [])}
    fields = {"last_test": entry}
    if res["ok"]:
        fields["passed"] = True
    progress.update(course, lesson_id, **fields)
    return res


@app.post("/api/c/{course_id}/lessons/{lesson_id}/checklist")
def set_checklist(course_id: str, lesson_id: str, body: ChecklistIn):
    course = _course(course_id)
    meta = _require_lesson(course, lesson_id)
    if not 0 <= body.index < len(meta.get("checklist", [])):
        raise HTTPException(400, "Chỉ số checklist không hợp lệ.")
    return {"checklist": progress.set_checklist(course, lesson_id, body.index, body.done)["checklist"]}


@app.post("/api/c/{course_id}/lessons/{lesson_id}/unlock")
def unlock_lesson(course_id: str, lesson_id: str):
    course = _course(course_id)
    _require_lesson(course, lesson_id)
    progress.update(course, lesson_id, unlocked=True)
    return {"status": all_statuses(course).get(lesson_id)}


_CODE_SUFFIXES = {".py", ".md", ".txt", ".json", ".sql", ".yaml", ".yml", ".js", ".mjs", ".cjs", ".html", ".css"}
_SKIP_DIRS = {"__pycache__", "node_modules", ".git", ".pytest_cache"}


def _workspace_files(course: Course, lesson_id: str, limit: int = 6000) -> dict[str, str]:
    ws, files, used = _workspace(course, lesson_id), {}, 0
    if not ws.is_dir():
        return files
    paths = []
    for d, dirs, names in os.walk(ws):
        dirs[:] = [x for x in dirs if x not in _SKIP_DIRS]  # không đi vào node_modules, __pycache__...
        paths += [Path(d) / n for n in names]
    for p in sorted(paths):
        if used >= limit:
            break
        if p.suffix not in _CODE_SUFFIXES or p.name == "package-lock.json":
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


@app.post("/api/c/{course_id}/tutor")
def tutor(course_id: str, body: TutorIn):
    course = _course(course_id)
    meta = _require_lesson(course, body.lesson_id)
    msgs = llm.build_tutor_messages(meta, curriculum.load_markdown(course, body.lesson_id),
                                    _workspace_files(course, body.lesson_id), body.messages,
                                    language=curriculum.language(course))
    try:
        return {"reply": llm.chat(msgs, llm.TUTOR_MODEL, temperature=0.6)}
    except llm.LLMError as e:
        return _llm_error(e)


@app.post("/api/c/{course_id}/interview/grade")
def grade(course_id: str, body: GradeIn):
    course = _course(course_id)
    _require_lesson(course, body.lesson_id)
    if not body.answer.strip():
        raise HTTPException(400, "Hãy nhập câu trả lời trước khi chấm.")
    try:
        return llm.grade(body.question, body.answer, language=curriculum.language(course), cache_dir=course.cache)
    except llm.LLMError as e:
        return _llm_error(e)


_ASSET_RE = re.compile(r'(\b(?:href|src)=")([\w./-]+\.(?:css|js))(")')
_index_cache: dict = {"key": None, "html": ""}


def _file_key(p: Path):
    st = p.stat()
    return (str(p), st.st_mtime_ns, st.st_size)


def _asset_hash(name: str) -> str | None:
    p = (WEB_DIR / name).resolve()
    if WEB_DIR.resolve() not in p.parents or not p.is_file():
        return None
    return hashlib.sha1(p.read_bytes()).hexdigest()[:10]


def render_index() -> str:
    """index.html với URL asset nội bộ gắn ?v=<sha1[:10]> của nội dung file.

    Trình duyệt giữ bản style.css cũ (cache trước khi có no-cache) vẫn phải tải bản mới vì URL đổi.
    Băm lại chỉ khi mtime/size của index hoặc asset thay đổi.
    """
    index = WEB_DIR / "index.html"
    raw = index.read_text(encoding="utf-8")
    names = sorted({m.group(2) for m in _ASSET_RE.finditer(raw)})
    key = (_file_key(index), *(_file_key(WEB_DIR / n) for n in names if (WEB_DIR / n).is_file()))
    if _index_cache["key"] != key:
        hashes = {n: _asset_hash(n) for n in names}
        _index_cache["html"] = _ASSET_RE.sub(
            lambda m: f"{m.group(1)}{m.group(2)}?v={hashes[m.group(2)]}{m.group(3)}" if hashes.get(m.group(2)) else m.group(0), raw)
        _index_cache["key"] = key
    return _index_cache["html"]


@app.get("/")
@app.get("/index.html")
def index():
    return HTMLResponse(render_index(), headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=WEB_DIR), name="web")
