"""JobRadar — Bài L14: Embedding & cosine similarity.

Tìm tin tuyển dụng theo NGHĨA thay vì theo từ khóa: biến câu truy vấn và từng tin thành
vector (embedding), rồi xếp hạng theo cosine similarity.

Cần numpy + openai (đã có trong requirements.txt).
Chạy thật:  python semantic.py "làm pipeline dữ liệu cho ngân hàng"
            (cần .env có NVIDIA_API_KEY và CSDL sạch của L10)
Chạy test:  bấm "Chạy test" (client GIẢ, không gọi mạng).
"""
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

import numpy as np

BASE_URL = "https://integrate.api.nvidia.com/v1"
EMBED_MODEL = "nvidia/nemotron-3-embed-1b"   # vector 2048 chiều, đã chuẩn hóa độ dài 1
# workspace/L14-embedding-cosine/semantic.py → lên 2 cấp là thư mục academy/
HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "L10-etl-chat-luong-du-lieu" / "jobradar.db"  # CSDL sạch bạn tạo ở L10


def cosine_similarity(a, b):
    """Cosine similarity của hai vector (list số thực hoặc numpy array cùng độ dài).

    cos = (a · b) / (|a| * |b|), với a · b = tổng a[i] * b[i], |a| = căn bậc hai của tổng a[i]².
    Trả về float trong [-1, 1].
      - Hai vector khác độ dài → raise ValueError.
      - Một trong hai vector có độ dài 0 (toàn số 0) → trả 0.0 (không chia cho 0).
    """
    # TODO
    raise NotImplementedError("TODO: viết cosine_similarity")


def top_k(query_vec, doc_vecs, k=5):
    """k tài liệu gần query_vec nhất theo cosine similarity.

    query_vec: 1 vector; doc_vecs: danh sách n vector (list các list, hoặc numpy array n×d).
    Trả về list k tuple (chỉ_số_tài_liệu, điểm) — chỉ số là int, điểm là float —
    sắp xếp điểm GIẢM dần; bằng điểm thì chỉ số nhỏ đứng trước.
      - k lớn hơn số tài liệu → trả hết; k <= 0 hoặc không có tài liệu → [].
      - Điểm phải đúng cosine (kể cả khi vector chưa chuẩn hóa độ dài 1).
    """
    # TODO
    raise NotImplementedError("TODO: viết top_k")


def tokenize(text):
    """Chữ thường, tách theo ký tự không phải chữ/số. Đã viết sẵn — dùng trong keyword_search."""
    return re.findall(r"\w+", text.lower())


def keyword_search(query, docs, k=5):
    """Tìm theo từ khóa — mốc để so với tìm theo nghĩa.

    Điểm của một tài liệu = số từ KHÁC NHAU của query (theo tokenize) có xuất hiện trong
    tokenize(tài liệu). Bỏ tài liệu có điểm 0.
    Trả về list tối đa k tuple (chỉ_số, điểm_int), điểm giảm dần; bằng điểm thì chỉ số nhỏ trước.
    """
    # TODO
    raise NotImplementedError("TODO: viết keyword_search")


def embed_texts(client, texts, input_type, model=EMBED_MODEL, batch_size=64):
    """Gọi API embedding cho danh sách văn bản, theo từng lô (batch) tối đa batch_size văn bản.

    input_type: "query" (câu hỏi của người dùng) hoặc "passage" (tài liệu được tìm) —
      giá trị khác → raise ValueError (trước khi gọi API).
    Mỗi lô gọi đúng một lần:
        client.embeddings.create(model=model, input=lô, extra_body={"input_type": input_type})
    response.data là list phần tử có .index (vị trí trong lô) và .embedding (list float):
    sắp theo .index trước khi ghép, vì thứ tự trả về không được bảo đảm.
    Trả về list vector (list float) cùng thứ tự với texts. texts rỗng → [] và không gọi API.
    """
    # TODO
    raise NotImplementedError("TODO: viết embed_texts")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN.
# ----------------------------------------------------------------------------

def job_header(job):
    """Dòng đầu của văn bản một tin: tiêu đề — công ty (thành phố)."""
    return f"{job['title']} — {job['company']} ({job['city'] or 'không rõ thành phố'})"


def job_to_text(job):
    """Văn bản đại diện cho một tin khi tạo embedding: header + mô tả."""
    return f"{job_header(job)}\n{job['description']}"


def load_jobs(db_path=DB_PATH):
    """Đọc tin sạch từ CSDL L10 (chỉ đọc), kèm tên công ty."""
    if not Path(db_path).exists():
        raise SystemExit(f"Chưa có {db_path} — hãy chạy `python pipeline.py` ở bài L10 trước.")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    rows = conn.execute(
        "SELECT j.job_id, j.title, c.name, j.city, j.level, j.description FROM jobs j "
        "LEFT JOIN companies c ON c.company_id = j.company_id "
        "WHERE TRIM(COALESCE(j.description, '')) != '' ORDER BY j.job_id").fetchall()
    conn.close()
    keys = ("job_id", "title", "company", "city", "level", "description")
    return [dict(zip(keys, r)) for r in rows]


def load_api_key():
    """NVIDIA_API_KEY: biến môi trường trước, rồi .env cạnh file này, rồi .env ở gốc repo."""
    key = os.environ.get("NVIDIA_API_KEY")
    for env_path in (HERE / ".env", HERE.parents[2] / ".env"):
        if key:
            break
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                name, _, value = line.strip().partition("=")
                if name.strip() == "NVIDIA_API_KEY":
                    key = value.strip().strip('"').strip("'")
    if not key or "..." in key:
        raise RuntimeError("Thiếu NVIDIA_API_KEY — điền key vào file .env ở gốc repo (xem README)")
    return key


def make_client():
    from openai import OpenAI
    return OpenAI(base_url=BASE_URL, api_key=load_api_key(), timeout=60)


def load_or_embed_docs(client, texts, path=HERE / "doc_vectors.npy"):
    """Embedding của mọi tin, lưu ra .npy. Chạy lại với cùng văn bản + model → đọc file, không gọi API."""
    fingerprint = hashlib.sha256(json.dumps([EMBED_MODEL, texts], ensure_ascii=False).encode()).hexdigest()
    fp_path = path.with_suffix(".sha256")
    if path.exists() and fp_path.exists() and fp_path.read_text() == fingerprint:
        return np.load(path), False
    vectors = np.asarray(embed_texts(client, texts, "passage"), dtype=np.float32)
    np.save(path, vectors)
    fp_path.write_text(fingerprint)
    return vectors, True


if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) or "làm pipeline dữ liệu cho ngân hàng"
    jobs = load_jobs()
    texts = [job_to_text(j) for j in jobs]
    client = make_client()
    t0 = time.time()
    doc_vecs, called = load_or_embed_docs(client, texts)
    print(f"{len(texts)} tin, vector {doc_vecs.shape[1]} chiều "
          f"({'gọi API' if called else 'đọc từ doc_vectors.npy'}, {time.time() - t0:.1f}s)")
    t0 = time.time()
    q_vec = embed_texts(client, [query], "query")[0]
    t1 = time.time()
    hits = top_k(q_vec, doc_vecs, k=5)
    t2 = time.time()
    print(f"Embedding câu hỏi: {(t1 - t0) * 1000:.0f} ms · top_k trên {len(texts)} tin: {(t2 - t1) * 1000:.1f} ms")
    print(f"\nTìm theo nghĩa: {query!r}")
    for i, score in hits:
        print(f"  {score:.3f}  {jobs[i]['job_id']}  {job_header(jobs[i])}")
    print("\nTìm theo từ khóa:")
    kw = keyword_search(query, texts, k=5)
    for i, score in kw:
        print(f"  {score} từ  {jobs[i]['job_id']}  {job_header(jobs[i])}")
    if not kw:
        print("  (không tin nào chứa từ nào của câu truy vấn)")
