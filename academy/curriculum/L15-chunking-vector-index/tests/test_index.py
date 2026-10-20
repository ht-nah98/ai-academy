"""Test tự chấm cho bài L15. Embedder GIẢ: không gọi mạng, không cần API key.

Bài này qua test được kể cả trước khi copy semantic.py của L14 sang (chạy thật thì cần).
"""
import json
import sqlite3

import numpy as np
import pytest

from index import VectorIndex, chunk_text, embed_cached, embedding_key, make_chunks

WORDS = " ".join(f"w{i}" for i in range(10))


# ---------- chunk_text ----------

def test_chunk_text_cua_so_co_overlap():
    assert chunk_text(WORDS, size=4, overlap=1) == ["w0 w1 w2 w3", "w3 w4 w5 w6", "w6 w7 w8 w9"], (
        "Đoạn bắt đầu ở từ 0, 3, 6 (bước = size - overlap = 3); đoạn cuối chứa từ cuối thì dừng"
    )
    assert chunk_text(WORDS, size=4, overlap=0) == ["w0 w1 w2 w3", "w4 w5 w6 w7", "w8 w9"], (
        "overlap=0 → các đoạn nối tiếp; đoạn cuối có thể ngắn hơn size"
    )


def test_chunk_text_khong_sinh_doan_thua():
    assert chunk_text(WORDS, size=5, overlap=2) == ["w0 w1 w2 w3 w4", "w3 w4 w5 w6 w7", "w6 w7 w8 w9"]
    assert chunk_text(WORDS, size=20, overlap=5) == [WORDS], "Văn bản ngắn hơn size → đúng 1 đoạn"
    assert chunk_text("  nhiều   khoảng \n trắng ", size=10, overlap=2) == ["nhiều khoảng trắng"], (
        "Tách bằng text.split(), nối lại bằng một dấu cách"
    )


def test_chunk_text_dau_vao_khong_hop_le():
    assert chunk_text("   ", size=4, overlap=1) == []
    for size, overlap in [(0, 0), (4, 4), (4, 5), (4, -1)]:
        with pytest.raises(ValueError):
            chunk_text(WORDS, size=size, overlap=overlap)


# ---------- make_chunks ----------

JOBS = [
    {"job_id": "JR-1", "title": "Đầu bếp", "company": "Quán A", "city": "Huế", "description": WORDS},
    {"job_id": "JR-2", "title": "Phụ bếp", "company": "Quán B", "city": None, "description": "rửa rau"},
]


def test_make_chunks_gan_header_va_id():
    chunks = make_chunks(JOBS, size=4, overlap=1)
    assert [c["chunk_id"] for c in chunks] == ["JR-1#0", "JR-1#1", "JR-1#2", "JR-2#0"]
    assert [c["job_id"] for c in chunks] == ["JR-1", "JR-1", "JR-1", "JR-2"]
    assert chunks[1]["text"] == "Đầu bếp — Quán A (Huế)\nw3 w4 w5 w6", (
        "text = job_header(job) + '\\n' + đoạn: chunk ở giữa vẫn biết mình thuộc tin nào"
    )
    assert chunks[3]["text"] == "Phụ bếp — Quán B (không rõ thành phố)\nrửa rau"
    assert set(chunks[0]) == {"chunk_id", "job_id", "text"}


def test_make_chunks_khong_chia():
    chunks = make_chunks(JOBS, size=None)
    assert len(chunks) == 2, "size=None → mỗi tin đúng 1 chunk"
    assert chunks[0] == {"chunk_id": "JR-1#0", "job_id": "JR-1", "text": "Đầu bếp — Quán A (Huế)\n" + WORDS}


# ---------- embed_cached ----------

class FakeEmbedder:
    """Vector giả = [số ký tự, số dấu cách, 1]. Ghi lại từng lô được gọi."""

    def __init__(self):
        self.batches = []

    def __call__(self, texts):
        self.batches.append(list(texts))
        return [[float(len(t)), float(t.count(" ")), 1.0] for t in texts]


def test_embed_cached_lan_dau_goi_theo_lo(tmp_path):
    fake = FakeEmbedder()
    texts = ["a", "bb", "c c", "dddd", "e"]
    vecs, stats = embed_cached(texts, fake, tmp_path / "c.sqlite", model="m", batch_size=2)
    assert isinstance(vecs, np.ndarray) and vecs.dtype == np.float32 and vecs.shape == (5, 3)
    assert vecs[:, 0].tolist() == [1, 2, 3, 4, 1], "Đúng thứ tự texts"
    assert fake.batches == [["a", "bb"], ["c c", "dddd"], ["e"]], "Lô tối đa batch_size văn bản"
    assert stats == {"cached": 0, "embedded": 5, "calls": 3}


def test_embed_cached_lan_hai_khong_goi_lai(tmp_path):
    path = tmp_path / "c.sqlite"
    embed_cached(["a", "bb"], FakeEmbedder(), path, model="m")
    fake = FakeEmbedder()
    vecs, stats = embed_cached(["bb", "mới", "a"], fake, path, model="m")
    assert fake.batches == [["mới"]], "Chỉ gọi API cho văn bản chưa có trong cache"
    assert stats == {"cached": 2, "embedded": 1, "calls": 1}
    assert vecs[:, 0].tolist() == [2, 3, 1]


def test_embed_cached_van_ban_lap_va_khoa_gom_model(tmp_path):
    path = tmp_path / "c.sqlite"
    fake = FakeEmbedder()
    vecs, stats = embed_cached(["x", "y", "x"], fake, path, model="m")
    assert fake.batches == [["x", "y"]], "Văn bản lặp chỉ gửi API một lần"
    assert stats == {"cached": 0, "embedded": 2, "calls": 1} and vecs.shape == (3, 3)
    fake2 = FakeEmbedder()
    _, stats2 = embed_cached(["x"], fake2, path, model="m2")
    assert fake2.batches == [["x"]], "Khác model → khác khóa → phải gọi lại"
    _, stats3 = embed_cached(["x"], FakeEmbedder(), path, model="m", input_type="query")
    assert stats3["embedded"] == 1, "Khác input_type → khác khóa"


def test_embed_cached_dung_bang_sqlite(tmp_path):
    path = tmp_path / "c.sqlite"
    embed_cached(["xin chào"], FakeEmbedder(), path, model="m")
    conn = sqlite3.connect(path)
    rows = conn.execute("SELECT key, vec FROM embeddings").fetchall()
    conn.close()
    assert len(rows) == 1 and rows[0][0] == embedding_key("m", "passage", "xin chào")
    assert np.frombuffer(rows[0][1], dtype=np.float32).tolist() == [8.0, 1.0, 1.0], "vec = float32.tobytes()"
    vecs, stats = embed_cached([], FakeEmbedder(), path, model="m")
    assert vecs.shape == (0, 0) and stats == {"cached": 0, "embedded": 0, "calls": 0}


# ---------- VectorIndex ----------

RECORDS = [{"chunk_id": "A#0", "job_id": "A", "text": "a0"},
           {"chunk_id": "A#1", "job_id": "A", "text": "a1"},
           {"chunk_id": "B#0", "job_id": "B", "text": "b0"},
           {"chunk_id": "C#0", "job_id": "C", "text": "c0"}]
VECS = [[10, 0], [0.8, 0.6], [6, 8], [0, -1]]


def test_vector_index_chuan_hoa_va_kiem_tra_kich_thuoc():
    idx = VectorIndex(VECS, RECORDS, model="m")
    assert idx.vectors.dtype == np.float32
    assert np.allclose(np.linalg.norm(idx.vectors, axis=1), 1.0), "Mỗi dòng chuẩn hóa về độ dài 1"
    with pytest.raises(ValueError):
        VectorIndex(VECS[:3], RECORDS, model="m")


def test_vector_index_search_moi_tin_mot_lan():
    idx = VectorIndex(VECS, RECORDS, model="m")
    hits = idx.search([1, 0], k=3)
    assert [h["chunk_id"] for h in hits] == ["A#0", "B#0", "C#0"], (
        "A#1 (0.8) bị bỏ vì tin A đã có A#0 (1.0) → 3 tin khác nhau"
    )
    assert [round(h["score"], 4) for h in hits] == [1.0, 0.6, 0.0]
    assert hits[0]["text"] == "a0" and "score" not in RECORDS[0], "Trả bản sao record kèm score, không sửa record gốc"
    assert [h["chunk_id"] for h in idx.search([0, 2], k=2)] == ["B#0", "A#1"], "Query chưa chuẩn hóa vẫn đúng cosine"
    assert idx.search([1, 0], k=0) == [] and VectorIndex(np.zeros((0, 2)), [], "m").search([1, 0]) == []


def test_vector_index_save_load(tmp_path):
    idx = VectorIndex(VECS, RECORDS, model="m-embed")
    folder = tmp_path / "idx" / "c40"
    idx.save(folder)
    assert (folder / "vectors.npy").exists()
    meta = json.loads((folder / "records.json").read_text(encoding="utf-8"))
    assert meta == {"model": "m-embed", "records": RECORDS}
    loaded = VectorIndex.load(folder)
    assert loaded.model == "m-embed" and loaded.records == RECORDS
    assert [h["chunk_id"] for h in loaded.search([1, 0], k=4)] == ["A#0", "B#0", "C#0"]
