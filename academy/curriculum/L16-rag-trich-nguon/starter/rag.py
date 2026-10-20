"""JobRadar — Bài L16: RAG có trích nguồn.

Retrieval-Augmented Generation: tìm các tin liên quan (L14, L15), đưa vào prompt làm NGUỒN,
yêu cầu model chỉ trả lời từ nguồn và ghi id tin sau mỗi ý, rồi KIỂM TRA id đó.

Trước tiên: copy semantic.py (L14) và index.py (L15) của bạn vào thư mục bài này; chỉ mục
đọc từ thư mục L15 (đã dựng bằng `python index.py` ở L15) — xem lesson.md, Bước 1.
Chạy thật:  python rag.py "Ngân hàng nào đang tuyển kỹ sư dữ liệu?"
Chạy test:  bấm "Chạy test" (search và chat GIẢ, không gọi mạng).
"""
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHAT_MODEL = "nvidia/nemotron-3-super-120b-a12b"
CHAT_PARAMS = {"temperature": 0, "max_tokens": 500,
               "extra_body": {"chat_template_kwargs": {"enable_thinking": False}}}
CACHE_DIR = HERE / "cache"
REFUSAL = "Không tìm thấy thông tin trong các tin tuyển dụng hiện có."

RAG_RULES = f"""Bạn là trợ lý JobRadar, trả lời câu hỏi về tin tuyển dụng IT.
Chỉ dùng thông tin trong phần NGUỒN bên dưới; mỗi nguồn bắt đầu bằng id trong ngoặc vuông, ví dụ [JR-10001].
Quy tắc:
- Mỗi ý trong câu trả lời phải kèm id nguồn trong ngoặc vuông ngay sau ý đó, ví dụ: "PayNow tuyển Junior Data Engineer [JR-10015]."
- Chỉ dùng id có trong NGUỒN. Không bịa id, không bịa thông tin.
- Nếu NGUỒN không chứa câu trả lời, trả lời đúng một câu: "{REFUSAL}"
- Trả lời ngắn gọn bằng tiếng Việt, tối đa 5 ý."""


def format_sources(hits):
    """Ghép các chunk truy hồi được thành phần NGUỒN của prompt.

    hits: list dict có "job_id" và "text" (thứ tự = thứ tự truy hồi).
    Mỗi job_id thành MỘT khối "[<job_id>] <text>"; nhiều chunk cùng job_id → nối text của
    chúng (theo thứ tự xuất hiện) bằng " … " trong cùng một khối. Thứ tự khối = thứ tự job_id
    xuất hiện lần đầu. Các khối nối với nhau bằng một dòng trống ("\\n\\n").
    hits rỗng → "".
    """
    # TODO
    raise NotImplementedError("TODO: viết format_sources")


def build_rag_messages(question, hits):
    """Messages gửi model:
        [{"role": "system", "content": RAG_RULES},
         {"role": "user", "content": "NGUỒN:\\n" + format_sources(hits) + "\\n\\nCÂU HỎI: " + question}]
    """
    # TODO
    raise NotImplementedError("TODO: viết build_rag_messages")


def extract_citations(answer):
    """Các id tin (dạng JR- và 5 chữ số, vd. JR-10015) được trích trong ngoặc vuông.

    Một cặp ngoặc có thể chứa nhiều id: "[JR-10015, JR-10090]" → cả hai.
    id KHÔNG nằm trong ngoặc vuông (vd. "tin JR-10015") → không tính.
    Trả về list id không trùng, theo thứ tự xuất hiện đầu tiên.
    """
    # TODO
    raise NotImplementedError("TODO: viết extract_citations")


def answer_question(question, search_fn, chat_fn, k=5, min_score=0.0):
    """Hỏi đáp RAG có kiểm tra trích nguồn.

    search_fn(question, k) → list hit (dict có "job_id", "text", "score"), điểm giảm dần.
    chat_fn(messages) → chuỗi trả lời của model.
    Các bước:
      1. hits = search_fn(question, k); sources = các job_id của hits, không trùng, theo thứ tự.
      2. Không có hit, hoặc hits[0]["score"] < min_score → KHÔNG gọi chat_fn; answer = REFUSAL.
      3. Ngược lại: answer = chat_fn(build_rag_messages(question, hits)).strip().
      4. citations = extract_citations(answer);
         invalid_citations = các id trong citations KHÔNG thuộc sources (model bịa nguồn);
         refused = REFUSAL có nằm trong answer.
    Trả về dict:
      {"answer", "citations", "invalid_citations", "sources", "refused",
       "llm_called": bool,
       "ok": KHÔNG refused, có ít nhất 1 citation và invalid_citations rỗng}
    """
    # TODO
    raise NotImplementedError("TODO: viết answer_question")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN.
# ----------------------------------------------------------------------------

def make_chat(client, model=CHAT_MODEL, cache_dir=CACHE_DIR):
    """chat_fn(messages) → nội dung trả lời, có cache đĩa như L12 (khóa = model + messages + params)."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    def chat(messages):
        raw = json.dumps({"model": model, "messages": messages, "params": CHAT_PARAMS},
                         sort_keys=True, ensure_ascii=False)
        path = cache_dir / (hashlib.sha256(raw.encode("utf-8")).hexdigest() + ".json")
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))["content"]
        resp = client.chat.completions.create(model=model, messages=messages, **CHAT_PARAMS)
        content = resp.choices[0].message.content or ""
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps({"content": content}, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)
        return content
    return chat


INDEX_DIR = HERE.parent / "L15-chunking-vector-index" / "index_c40"  # chỉ mục bạn dựng ở L15


def make_search(client, index_dir=INDEX_DIR):
    """search_fn(question, k) từ chỉ mục đã lưu ở L15. Cần index.py + semantic.py."""
    from index import VectorIndex, make_query_embedder
    if not Path(index_dir).exists():
        raise SystemExit(f"Chưa có {index_dir} — chạy `python index.py` ở bài L15 trước.")
    index = VectorIndex.load(index_dir)
    embed_query = make_query_embedder(client)
    return lambda question, k: index.search(embed_query(question), k)


if __name__ == "__main__":
    from semantic import make_client  # semantic.py của bạn ở L14

    questions = sys.argv[1:] or [
        "Ngân hàng hoặc công ty tài chính nào đang tuyển kỹ sư dữ liệu?",
        "Có tin thực tập AI nào làm remote không?",
        "Có công ty nào tuyển lập trình viên Rust không?",
    ]
    client = make_client()
    search_fn, chat_fn = make_search(client), make_chat(client)
    for q in questions:
        t0 = time.time()
        res = answer_question(q, search_fn, chat_fn, k=5)
        print(f"\nHỏi: {q}\n{res['answer']}")
        print(f"→ nguồn truy hồi: {res['sources']}")
        print(f"→ trích: {res['citations']} · id bịa: {res['invalid_citations']} · "
              f"từ chối: {res['refused']} · ok: {res['ok']} · {time.time() - t0:.1f}s")
