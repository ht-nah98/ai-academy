"""Client NVIDIA (OpenAI-compatible): cache đĩa, retry, model dự phòng."""
import hashlib
import json
import os
import re
import time
from pathlib import Path

from . import config

BASE_URL = "https://integrate.api.nvidia.com/v1"
TUTOR_MODEL = "nvidia/nemotron-3-super-120b-a12b"
GRADER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
FALLBACK_MODEL = "z-ai/glm-5.3-flash"
NO_THINK = {"chat_template_kwargs": {"enable_thinking": False}}
MAX_TRIES = 4
NO_KEY_MSG = ("Chưa có NVIDIA_API_KEY. Hãy thêm dòng NVIDIA_API_KEY=nvapi-... vào file "
              "academy/.env (hoặc biến môi trường) rồi thử lại.")


class LLMError(Exception):
    pass


class NoKeyError(LLMError):
    pass


def _env_candidates() -> list[Path]:
    return [config.root() / ".env", config.DEFAULT_ROOT / ".env", config.DEFAULT_ROOT.parent / ".env"]


def get_api_key() -> str | None:
    key = os.environ.get("NVIDIA_API_KEY")
    if key:
        return key.strip()
    for p in _env_candidates():
        try:
            for line in p.read_text(encoding="utf-8").splitlines():
                m = re.match(r"\s*(?:export\s+)?NVIDIA_API_KEY\s*=\s*(.*)", line)
                if m:
                    v = m.group(1).strip().strip("'\"")
                    if v:
                        return v
        except OSError:
            continue
    return None


def _client(key: str):
    from openai import OpenAI
    return OpenAI(base_url=BASE_URL, api_key=key, timeout=90, max_retries=0)


def _retryable(e: Exception) -> bool:
    status = getattr(e, "status_code", None)
    if status is None:  # lỗi mạng / timeout
        return True
    return status == 429 or status >= 500


def _cache_key(model, messages, params) -> str:
    blob = json.dumps({"m": model, "msgs": messages, "p": params}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()


def _call_with_retry(client, model, messages, params, sleep=time.sleep) -> str:
    last = None
    for attempt in range(MAX_TRIES):
        try:
            r = client.chat.completions.create(model=model, messages=messages, **params)
            return r.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001
            last = e
            if not _retryable(e) or attempt == MAX_TRIES - 1:
                break
            sleep(2 ** attempt)
    raise LLMError(f"{type(last).__name__}: {str(last)[:200]}")


def chat(messages: list[dict], model: str, temperature: float = 0.6,
         use_cache: bool = False, max_tokens: int = 1500, client=None, sleep=time.sleep) -> str:
    key = None
    if client is None:
        key = get_api_key()
        if not key:
            raise NoKeyError(NO_KEY_MSG)
    params = {"temperature": temperature, "max_tokens": max_tokens, "extra_body": NO_THINK}
    cpath = None
    if use_cache:
        cpath = config.cache_dir() / f"{_cache_key(model, messages, params)}.json"
        if cpath.exists():
            try:
                return json.loads(cpath.read_text(encoding="utf-8"))["text"]
            except (OSError, ValueError, KeyError):
                pass
    client = client or _client(key)
    try:
        text = _call_with_retry(client, model, messages, params, sleep)
    except LLMError:
        if model == FALLBACK_MODEL:
            raise
        text = _call_with_retry(client, FALLBACK_MODEL, messages, params, sleep)
    if cpath and text:
        cpath.parent.mkdir(parents=True, exist_ok=True)
        cpath.write_text(json.dumps({"text": text}, ensure_ascii=False), encoding="utf-8")
    return text


def parse_json(text: str) -> dict:
    """Bóc JSON từ câu trả lời: bỏ ```fences```, lấy {...} đầu tiên cân ngoặc."""
    t = re.sub(r"```(?:json)?", "", text)
    start = t.find("{")
    if start < 0:
        raise ValueError("không có JSON")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(t)):
        c = t[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(t[start:i + 1])
    raise ValueError("JSON không đầy đủ")


TUTOR_SYSTEM = """Bạn là gia sư AI theo phương pháp Socratic cho một học sinh mới học Python và AI, đang chuẩn bị phỏng vấn thực tập AI Engineer / Data Engineer.
Nguyên tắc:
- Trả lời bằng tiếng Việt, thân thiện, NGẮN (tối đa ~120 chữ), kết thúc bằng MỘT câu hỏi dẫn dắt để học sinh tự nghĩ bước tiếp theo.
- Giải thích "tại sao" đằng sau vấn đề; gợi ý từng bước nhỏ, mỗi lần một bước.
- TUYỆT ĐỐI KHÔNG viết code cho các hàm bài tập (kể cả một phần thân hàm, kể cả khi học sinh xin thẳng lời giải). Không viết `def <tên hàm bài tập>`.
- Được phép: nêu tên khái niệm/hàm có sẵn cần dùng (vd. dict.get, .lower()), hoặc ví dụ 1–3 dòng trên dữ liệu KHÁC hẳn bài (vd. trái cây, điểm số).
- Nếu học sinh gửi lỗi, giúp họ tự đọc traceback trước khi chỉ ra nguyên nhân."""

GRADER_SYSTEM = """Bạn là người phỏng vấn thực tập sinh AI/Data Engineer, chấm câu trả lời bằng tiếng Việt.
Chỉ trả về MỘT đối tượng JSON hợp lệ, không thêm chữ nào khác, đúng dạng:
{"score": <số nguyên 0-10>, "strengths": ["..."], "gaps": ["..."], "better_answer": "..."}
- strengths: điểm đúng/tốt; gaps: ý còn thiếu hoặc sai; better_answer: câu trả lời mẫu ngắn gọn (3-6 câu) cho cấp độ thực tập sinh.
Chấm công bằng, không nịnh."""


def truncate(s: str, n: int) -> str:
    return s if len(s) <= n else s[:n] + "\n...(đã cắt bớt)"


def build_tutor_messages(meta: dict, lesson_md: str, files: dict[str, str], messages: list[dict]) -> list[dict]:
    code = "\n\n".join(f"### {name}\n{content}" for name, content in files.items()) or "(chưa có code)"
    fns = ", ".join(t["fn"] for t in meta.get("tasks", []) if t.get("fn"))
    ctx = (f"## Bài học: {meta.get('title', '')}\nMục tiêu: {meta.get('goal', '')}\n"
           f"Ghi chú cho gia sư: {meta.get('tutor_notes', '')}\n\n"
           f"## Nội dung bài (rút gọn)\n{truncate(lesson_md, 6000)}\n\n"
           f"## Code hiện tại của học sinh (rút gọn)\n{truncate(code, 6000)}\n\n"
           f"## Nhắc lại\nKhông viết code cho các hàm bài tập: {fns or '(xem đề)'}. "
           "Chỉ gợi ý ngắn + 1 câu hỏi dẫn dắt.")
    clean = [{"role": m["role"], "content": m["content"]} for m in messages[-20:]
             if m.get("role") in ("user", "assistant")]
    return [{"role": "system", "content": TUTOR_SYSTEM + "\n\n" + ctx}] + clean


def grade(question: str, answer: str, client=None, sleep=time.sleep) -> dict:
    msgs = [{"role": "system", "content": GRADER_SYSTEM},
            {"role": "user", "content": f"Câu hỏi: {question}\n\nCâu trả lời của học sinh:\n{answer}"}]
    text = chat(msgs, GRADER_MODEL, temperature=0.2, use_cache=True, max_tokens=1200, client=client, sleep=sleep)
    try:
        d = parse_json(text)
    except ValueError as e:
        raise LLMError("Người chấm trả về định dạng không đọc được, hãy thử lại.") from e
    try:
        score = max(0, min(10, int(round(float(d.get("score", 0))))))
    except (TypeError, ValueError):
        score = 0
    as_list = lambda v: [str(x) for x in v] if isinstance(v, list) else ([str(v)] if v else [])
    return {"score": score, "strengths": as_list(d.get("strengths")),
            "gaps": as_list(d.get("gaps")), "better_answer": str(d.get("better_answer", ""))}
