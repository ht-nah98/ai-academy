"""JobRadar — Bài L12: Batch — rate limit, cache, retry, chi phí.

Chạy bộ trích xuất của L11 cho cả bộ tin tuyển dụng. Một lần gọi thì dễ; vài trăm lần gọi
thì gặp: 429 Too Many Requests, lỗi mạng giữa chừng, chạy lại phải trả tiền lần nữa.

Trước tiên: copy extract.py (L11) của bạn vào thư mục bài này (xem lesson.md, Bước 1).
Chạy thật:  python batch.py 40       (40 tin đầu; chạy lại lần 2 → toàn bộ lấy từ cache)
Chạy test:  bấm "Chạy test" (client GIẢ, đồng hồ GIẢ — test chạy trong vài giây).
"""
import hashlib
import json
import os
import sqlite3
import sys
import time
from collections import deque
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "L10-etl-chat-luong-du-lieu" / "jobradar.db"  # CSDL sạch bạn tạo ở L10
CACHE_DIR = HERE / "cache"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"
# Tham số gửi kèm mỗi request. Thuộc khóa cache: đổi tham số = câu hỏi khác.
PARAMS = {"temperature": 0, "max_tokens": 400,
          "extra_body": {"chat_template_kwargs": {"enable_thinking": False}}}
# Giá giả định (USD / 1 triệu token) để ước tính khi chuyển sang nhà cung cấp trả phí.
PRICE_PER_M = {"input": 0.30, "output": 0.90}


def cache_key(model, messages, params):
    """Khóa cache = SHA-256 (hex) của JSON {"model", "messages", "params"}.

    Dùng json.dumps(..., sort_keys=True, ensure_ascii=False) rồi .encode("utf-8"):
      - sort_keys → cùng nội dung thì cùng chuỗi, bất kể thứ tự key trong dict
      - mọi thứ ảnh hưởng tới câu trả lời (model, prompt, temperature...) đều nằm trong khóa
    Trả về chuỗi 64 ký tự hex.
    """
    # TODO
    raise NotImplementedError("TODO: viết cache_key")


class RateLimiter:
    """Giới hạn tối đa `rpm` lần gọi trong MỌI cửa sổ 60 giây (sliding window).

    wait(): gọi ngay TRƯỚC mỗi request.
      1. now = clock(); bỏ khỏi self.calls mọi mốc thời gian t có t <= now - 60
      2. nếu len(self.calls) >= rpm: sleep(self.calls[0] + 60 - now) — chờ tới khi mốc cũ nhất
         ra khỏi cửa sổ; rồi lấy lại now = clock() và bỏ mốc cũ lần nữa
      3. ghi now vào self.calls
    clock, sleep được truyền vào để test dùng đồng hồ giả (không phải chờ thật).
    """

    def __init__(self, rpm, clock=time.monotonic, sleep=time.sleep):
        self.rpm, self.clock, self.sleep = rpm, clock, sleep
        self.calls = deque()

    def wait(self):
        # TODO
        raise NotImplementedError("TODO: viết RateLimiter.wait")


def estimate_cost(prompt_tokens, completion_tokens, n_sampled, n_total, prices=PRICE_PER_M):
    """Chạy thử n_sampled tin → ước tính chi phí cho n_total tin, TRƯỚC khi chạy thật.

    Trả về dict:
      "prompt_tokens_per_job":     prompt_tokens / n_sampled, làm tròn 1 chữ số
      "completion_tokens_per_job": completion_tokens / n_sampled, làm tròn 1 chữ số
      "per_job_usd": chi phí trung bình 1 tin, làm tròn 6 chữ số
      "total_usd":   per_job (CHƯA làm tròn) * n_total, làm tròn 2 chữ số
    Tính chi phí từ token GỐC (prompt_tokens, completion_tokens), không từ số token/tin đã làm tròn.
    Chi phí = token_vào / 1e6 * prices["input"] + token_ra / 1e6 * prices["output"].
    n_sampled <= 0 → raise ValueError (không ước tính được từ 0 mẫu).
    """
    # TODO
    raise NotImplementedError("TODO: viết estimate_cost")


def run_batch(jobs, client, cache_dir=CACHE_DIR, model=DEFAULT_MODEL, limiter=None,
              build_messages=None, parse=None, sleep=time.sleep, prices=PRICE_PER_M):
    """Trích xuất cho cả lô tin, có cache đĩa, rate limit, retry, thống kê chi phí.

    jobs: list dict có "job_id", "title", "description".
    build_messages(title, description) → messages; parse(content) → dict.
      None → dùng từ extract.py của L11:
        build_messages = build_extraction_messages
        parse = lambda content: JobInfo.model_validate(parse_json_reply(content)).model_dump()
      Import extract BÊN TRONG run_batch, chỉ khi cần (test truyền hàm giả, không có extract.py).
      Batch không dùng vòng tự sửa của L11: tin lỗi vào errors, xem lại và chạy lại riêng.

    Tạo cache_dir nếu chưa có (mkdir parents=True, exist_ok=True).

    Với từng tin:
      1. messages = build_messages(...); key = cache_key(model, messages, PARAMS)
      2. Có file <cache_dir>/<key>.json → đọc {"content", "prompt_tokens", "completion_tokens"},
         KHÔNG gọi API, cache_hits += 1.
      3. Không có → limiter.wait() (nếu có limiter) rồi
            call_with_retry(lambda: client.chat.completions.create(model=model, messages=messages, **PARAMS),
                            sleep=sleep)
         api_calls += 1; cộng prompt_tokens, completion_tokens từ response.usage.
         Gọi thất bại hẳn → errors[job_id] = "api: <lỗi>", sang tin tiếp (KHÔNG dừng cả lô).
      4. results[job_id] = parse(content). parse lỗi (ValueError) → errors[job_id] = "parse: <lỗi>".
      5. CHỈ ghi cache khi response mới VÀ parse thành công (output hỏng không được cache).
         Ghi an toàn: ghi file tạm "<key>.json.tmp" rồi os.replace sang "<key>.json".

    Trả về {"results": {job_id: dict}, "errors": {job_id: str}, "stats": {...}}
    stats = {"total", "ok", "failed", "cache_hits", "api_calls",
             "prompt_tokens", "completion_tokens", "cost_usd"}
      api_calls = số request trả về THÀNH CÔNG (không tính lần retry, không tính lần thất bại hẳn)
      token và chi phí chỉ tính cho lần gọi API THẬT (cache hit = 0 đồng);
      cost_usd = prompt_tokens/1e6 * prices["input"] + completion_tokens/1e6 * prices["output"],
      làm tròn 6 chữ số.
    """
    # TODO
    raise NotImplementedError("TODO: viết run_batch")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN.
# ----------------------------------------------------------------------------

def call_with_retry(fn, max_retries=4, base_delay=2.0, sleep=time.sleep):
    """Tương tự with_retry ở L06 (bỏ jitter để kết quả xác định): lỗi tạm thời (429, 5xx, mạng) → chờ base_delay * 2**lần_thử rồi gọi lại;
    lỗi khác (400, 401) → raise ngay; hết max_retries lần thử lại → raise lỗi cuối."""
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as e:
            if not is_retryable(e) or attempt == max_retries:
                raise
            sleep(base_delay * 2 ** attempt)


def is_retryable(exc):
    """Lỗi tạm thời → nên thử lại. Nhận ra theo status_code (lỗi HTTP của thư viện openai
    có thuộc tính này) hoặc theo loại lỗi mạng/timeout."""
    status = getattr(exc, "status_code", None)
    if status is not None:
        return status == 429 or status >= 500
    return isinstance(exc, (TimeoutError, ConnectionError)) or type(exc).__name__ in (
        "APIConnectionError", "APITimeoutError")


def load_jobs(db_path=DB_PATH, limit=None):
    """Đọc các tin đã qua pipeline L10 (sạch, không trùng, đã loại tin lỗi) có mô tả."""
    if not Path(db_path).exists():
        raise SystemExit(f"Chưa có {db_path} — hãy chạy `python pipeline.py` ở bài L10 trước.")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)  # chỉ đọc
    rows = conn.execute("SELECT job_id, title, description FROM jobs "
                        "WHERE TRIM(COALESCE(description, '')) != '' ORDER BY job_id").fetchall()
    conn.close()
    jobs = [{"job_id": j, "title": t, "description": d} for j, t, d in rows]
    return jobs[:limit]


def make_client():
    from openai import OpenAI
    from extract import BASE_URL, load_api_key
    # max_retries=0: tắt retry ngầm của thư viện openai để call_with_retry của bạn làm việc đó.
    return OpenAI(base_url=BASE_URL, api_key=load_api_key(), max_retries=0, timeout=60)


if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    jobs = load_jobs(limit=limit)
    t0 = time.time()
    report = run_batch(jobs, make_client(), limiter=RateLimiter(rpm=35))
    (HERE / "extracted.json").write_text(json.dumps(report["results"], ensure_ascii=False, indent=1),
                                         encoding="utf-8")
    stats = report["stats"]
    print(json.dumps(stats, ensure_ascii=False))
    if stats["api_calls"]:
        print("Ước tính 100.000 tin:", estimate_cost(stats["prompt_tokens"], stats["completion_tokens"],
                                                     stats["api_calls"], 100_000))
    print(f"Thời gian: {time.time() - t0:.1f}s · lỗi: {dict(list(report['errors'].items())[:5])}")
