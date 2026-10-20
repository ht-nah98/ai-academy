"""JobRadar — Bài L15: Chunking & vector index.

Chia văn bản thành đoạn (chunk), tạo embedding một lần rồi lưu đĩa (cache theo nội dung),
dựng chỉ mục vector để truy vấn nhanh mà không gọi lại API cho tài liệu đã có.

Trước tiên: copy semantic.py (L14) của bạn vào thư mục bài này (xem lesson.md, Bước 1).
Chạy thật:  python index.py            (dựng chỉ mục từ CSDL L10; chạy lần 2 → 0 lần gọi API)
Chạy test:  bấm "Chạy test" (embedder GIẢ, không gọi mạng).
"""
import hashlib
import json
import sqlite3
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
EMBED_MODEL = "nvidia/nemotron-3-embed-1b"
CACHE_PATH = HERE / "embeddings.sqlite"
INDEX_DIR = HERE / "index_c40"


def chunk_text(text, size=40, overlap=10):
    """Chia text thành các đoạn, mỗi đoạn tối đa `size` TỪ (tách bằng text.split()),
    hai đoạn liền nhau dùng chung `overlap` từ.

      - Đoạn i bắt đầu ở từ thứ i * (size - overlap); nối các từ bằng một dấu cách.
      - Dừng khi một đoạn đã chứa từ cuối cùng (không sinh đoạn thừa chỉ toàn phần overlap).
      - text rỗng hoặc chỉ có khoảng trắng → [].
      - size <= 0, overlap < 0, hoặc overlap >= size → raise ValueError.
    Ví dụ: 10 từ, size=4, overlap=1 → đoạn bắt đầu ở từ 0, 3, 6: [w0..w3], [w3..w6], [w6..w9].
    """
    # TODO
    raise NotImplementedError("TODO: viết chunk_text")


def make_chunks(jobs, size=40, overlap=10):
    """Biến danh sách tin thành danh sách chunk (dict) để tạo embedding.

    Mỗi job có "job_id", "title", "company", "city", "description".
      - size=None → không chia: mỗi tin đúng 1 chunk, phần thân là nguyên description.
      - Ngược lại → thân là từng đoạn của chunk_text(description, size, overlap).
    Mỗi chunk: {"chunk_id": f"{job_id}#{i}" (i = 0, 1, ... trong cùng tin),
                "job_id": job_id,
                "text": job_header(job) + "\\n" + thân}
    job_header (đã viết sẵn bên dưới) gắn tiêu đề — công ty (thành phố) vào MỌI chunk, để
    chunk ở giữa mô tả vẫn biết mình thuộc tin nào. Giữ thứ tự tin, rồi thứ tự đoạn.
    """
    # TODO
    raise NotImplementedError("TODO: viết make_chunks")


def embedding_key(model, input_type, text):
    """Khóa cache của một embedding. Đã viết sẵn (cùng ý tưởng cache_key ở L12)."""
    raw = json.dumps({"model": model, "input_type": input_type, "text": text},
                     sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def embed_cached(texts, embed_fn, cache_path, model=EMBED_MODEL, input_type="passage", batch_size=64):
    """Embedding cho texts, có cache SQLite: văn bản đã có trong cache thì không gọi lại.

    embed_fn(list_văn_bản) → list vector (mỗi vector là list float), cùng thứ tự đầu vào.
    Cache: file SQLite cache_path, bảng
        CREATE TABLE IF NOT EXISTS embeddings (key TEXT PRIMARY KEY, vec BLOB NOT NULL)
      key = embedding_key(model, input_type, text); vec = np.asarray(v, dtype=np.float32).tobytes()
      (đọc lại: np.frombuffer(blob, dtype=np.float32)).
    Các bước:
      1. Tra cache cho mọi text. Văn bản chưa có → danh sách "cần gọi" (mỗi văn bản khác nhau
         chỉ một lần, kể cả khi lặp trong texts; giữ thứ tự xuất hiện đầu tiên).
      2. Gọi embed_fn theo lô tối đa batch_size văn bản; sau MỖI lô ghi vào cache và commit
         (chết giữa chừng thì các lô đã xong vẫn còn).
      3. Trả về (vectors, stats):
           vectors: np.ndarray float32, shape (len(texts), số_chiều), đúng thứ tự texts;
                    texts rỗng → np.zeros((0, 0), dtype=np.float32)
           stats = {"cached": số phần tử của texts lấy từ cache (đếm cả phần tử lặp),
                    "embedded": số văn bản khác nhau vừa gọi API,
                    "calls": số lần gọi embed_fn}
    """
    # TODO
    raise NotImplementedError("TODO: viết embed_cached")


class VectorIndex:
    """Chỉ mục vector tìm kiếm vét cạn (brute force), lưu được ra đĩa.

    VectorIndex(vectors, records, model):
      vectors: mảng n×d (list hoặc numpy); records: list n dict (chunk), cùng thứ tự.
      Số dòng vectors khác len(records) → raise ValueError.
      Lưu self.vectors = vectors (float32) ĐÃ CHUẨN HÓA mỗi dòng về độ dài 1 (dòng toàn 0 giữ
      nguyên 0), self.records, self.model — để search chỉ cần một phép nhân ma trận.

    search(query_vec, k=5): cosine của query với mọi vector; trả về list tối đa k dict, mỗi dict
      là bản sao record kèm "score" (float), điểm giảm dần (bằng điểm: thứ tự trong index).
      Mỗi job_id xuất hiện TỐI ĐA MỘT LẦN (giữ chunk điểm cao nhất của tin đó) → k tin khác nhau.
      Index rỗng hoặc k <= 0 → [].

    save(folder): tạo folder nếu chưa có; ghi folder/"vectors.npy" (np.save) và
      folder/"records.json" = {"model": model, "records": records} (ensure_ascii=False).
    VectorIndex.load(folder) (classmethod): đọc lại đúng hai file đó → VectorIndex.
    """

    def __init__(self, vectors, records, model=EMBED_MODEL):
        # TODO
        raise NotImplementedError("TODO: viết VectorIndex.__init__")

    def search(self, query_vec, k=5):
        # TODO
        raise NotImplementedError("TODO: viết VectorIndex.search")

    def save(self, folder):
        # TODO
        raise NotImplementedError("TODO: viết VectorIndex.save")

    @classmethod
    def load(cls, folder):
        # TODO
        raise NotImplementedError("TODO: viết VectorIndex.load")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN.
# ----------------------------------------------------------------------------

def job_header(job):
    """Giống job_header của L14: tiêu đề — công ty (thành phố)."""
    return f"{job['title']} — {job['company']} ({job['city'] or 'không rõ thành phố'})"


def build_index(jobs, embed_fn, size=40, overlap=10, cache_path=CACHE_PATH, model=EMBED_MODEL):
    """chunk → embedding (có cache) → VectorIndex. Trả về (index, stats)."""
    chunks = make_chunks(jobs, size, overlap)
    vectors, stats = embed_cached([c["text"] for c in chunks], embed_fn, cache_path, model, "passage")
    return VectorIndex(vectors, chunks, model), stats


def make_query_embedder(client, cache_path=CACHE_PATH, model=EMBED_MODEL):
    """Hàm câu_hỏi → vector, có cache (input_type="query"). Cần semantic.py của L14."""
    from semantic import embed_texts

    def embed_query(question):
        vecs, _ = embed_cached([question], lambda b: embed_texts(client, b, "query", model),
                               cache_path, model, "query")
        return vecs[0]
    return embed_query


if __name__ == "__main__":
    from semantic import embed_texts, load_jobs, make_client  # semantic.py của bạn ở L14

    size = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    overlap = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    jobs = load_jobs()
    client = make_client()
    t0 = time.time()
    index, stats = build_index(jobs, lambda b: embed_texts(client, b, "passage"), size, overlap)
    index.save(HERE / f"index_c{size}")
    print(f"{len(jobs)} tin → {len(index.records)} chunk (size={size}, overlap={overlap}) · "
          f"{stats} · {time.time() - t0:.1f}s")
    loaded = VectorIndex.load(HERE / f"index_c{size}")
    embed_query = make_query_embedder(client)
    question = "làm pipeline dữ liệu cho ngân hàng"
    q = embed_query(question)
    loaded.search(q, k=5)  # chạy nháp 1 lần (numpy khởi động lần đầu), rồi mới đo
    t0 = time.perf_counter()
    for _ in range(100):
        hits = loaded.search(q, k=5)
    ms = (time.perf_counter() - t0) * 1000 / 100
    print(f"search trên {len(loaded.records)} chunk: {ms:.2f} ms/truy vấn (trung bình 100 lần)")
    for h in hits:
        print(f"  {h['score']:.3f}  {h['chunk_id']:<11} {h['text'][:90]!r}")
