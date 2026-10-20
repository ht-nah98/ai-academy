"""Test tự chấm cho bài L14. Client GIẢ: không gọi mạng, không cần API key."""
import math
from types import SimpleNamespace

import numpy as np
import pytest

from semantic import cosine_similarity, embed_texts, keyword_search, top_k


class FakeEmbeddings:
    """Vector giả = [độ dài văn bản, 1.0]. Trả data theo thứ tự NGƯỢC để kiểm tra việc sắp theo .index."""

    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        items = [SimpleNamespace(index=i, embedding=[float(len(t)), 1.0]) for i, t in enumerate(kwargs["input"])]
        return SimpleNamespace(data=list(reversed(items)))


def fake_client():
    emb = FakeEmbeddings()
    return SimpleNamespace(embeddings=emb), emb


# ---------- cosine_similarity ----------

def test_cosine_similarity_gia_tri_co_ban():
    assert cosine_similarity([1, 0], [1, 0]) == pytest.approx(1.0), "Cùng hướng → 1"
    assert cosine_similarity([1, 0], [0, 1]) == pytest.approx(0.0), "Vuông góc → 0"
    assert cosine_similarity([1, 2], [-1, -2]) == pytest.approx(-1.0), "Ngược hướng → -1"
    assert cosine_similarity([1, 2, 3], [4, 5, 6]) == pytest.approx(32 / (math.sqrt(14) * math.sqrt(77))), (
        "cos = a·b / (|a|·|b|) = 32 / (√14 · √77)"
    )


def test_cosine_similarity_khong_phu_thuoc_do_dai_vector():
    assert cosine_similarity([1, 1], [5, 5]) == pytest.approx(1.0), "Nhân vector với 5 không đổi hướng → vẫn 1"
    assert cosine_similarity(np.array([3.0, 4.0]), np.array([4.0, 3.0])) == pytest.approx(0.96), (
        "Phải nhận cả numpy array"
    )


def test_cosine_similarity_truong_hop_bien():
    assert cosine_similarity([0, 0], [1, 2]) == 0.0, "Vector toàn 0 → trả 0.0, không chia cho 0"
    with pytest.raises(ValueError):
        cosine_similarity([1, 2], [1, 2, 3])


# ---------- top_k ----------

DOCS = [[1, 0], [0.8, 0.6], [0, 1], [-1, 0], [0.6, 0.8]]


def test_top_k_thu_tu_va_diem():
    res = top_k([1, 0], DOCS, k=3)
    assert [i for i, _ in res] == [0, 1, 4], "Xếp theo cosine giảm dần: [1,0] > [0.8,0.6] > [0.6,0.8]"
    assert [round(s, 4) for _, s in res] == [1.0, 0.8, 0.6]
    assert all(isinstance(i, int) and isinstance(s, float) for i, s in res), "Chỉ số là int, điểm là float"


def test_top_k_vector_chua_chuan_hoa_va_bang_diem():
    res = top_k([2, 0], [[0, 3], [10, 0], [5, 0]], k=2)
    assert [i for i, _ in res] == [1, 2], "Bằng điểm (cùng hướng) → chỉ số nhỏ trước"
    assert res[0][1] == pytest.approx(1.0), "Điểm là cosine, không phải tích vô hướng (10*2 = 20)"


def test_top_k_k_lon_hon_so_tai_lieu_va_k_khong_hop_le():
    assert len(top_k([1, 0], DOCS, k=50)) == 5, "k lớn hơn số tài liệu → trả hết"
    assert top_k([1, 0], DOCS, k=0) == []
    assert top_k([1, 0], [], k=3) == []
    assert [i for i, _ in top_k([1, 0], np.array(DOCS), k=2)] == [0, 1], "Phải nhận numpy array n×d"


# ---------- keyword_search ----------

def test_keyword_search_dem_tu_khac_nhau():
    docs = ["Cam ngọt, cam sành", "Táo đỏ và cam", "Chuối chín", "TÁO xanh"]
    res = keyword_search("táo cam", docs, k=5)
    assert res == [(1, 2), (0, 1), (3, 1)], (
        "Doc 1 có cả 'táo' và 'cam' → 2; 'cam' lặp ở doc 0 chỉ tính 1; không phân biệt hoa thường; bỏ điểm 0"
    )


def test_keyword_search_gioi_han_k_va_khong_khop():
    docs = ["a b", "a", "b", "c"]
    assert keyword_search("a b", docs, k=2) == [(0, 2), (1, 1)], "Bằng điểm → chỉ số nhỏ trước, cắt còn k"
    assert keyword_search("xyz", docs, k=3) == [], "Không tài liệu nào chứa từ khóa → []"


# ---------- embed_texts ----------

def test_embed_texts_goi_dung_tham_so_va_giu_thu_tu():
    client, emb = fake_client()
    vecs = embed_texts(client, ["a", "bbb", "cc"], "passage", model="m-embed")
    assert vecs == [[1.0, 1.0], [3.0, 1.0], [2.0, 1.0]], "Sắp theo .index → vector đúng thứ tự texts"
    assert len(emb.calls) == 1
    call = emb.calls[0]
    assert call["model"] == "m-embed" and call["input"] == ["a", "bbb", "cc"]
    assert call["extra_body"] == {"input_type": "passage"}, "Gửi input_type qua extra_body"


def test_embed_texts_chia_lo():
    client, emb = fake_client()
    texts = [f"t{i}" * (i + 1) for i in range(7)]
    vecs = embed_texts(client, texts, "query", batch_size=3)
    assert [len(c["input"]) for c in emb.calls] == [3, 3, 1], "7 văn bản, batch_size=3 → 3 lần gọi: 3, 3, 1"
    assert [v[0] for v in vecs] == [float(len(t)) for t in texts], "Ghép các lô đúng thứ tự"
    assert all(c["extra_body"] == {"input_type": "query"} for c in emb.calls)


def test_embed_texts_rong_va_input_type_sai():
    client, emb = fake_client()
    assert embed_texts(client, [], "passage") == [] and emb.calls == [], "texts rỗng → [] và không gọi API"
    with pytest.raises(ValueError):
        embed_texts(client, ["a"], "document")
    assert emb.calls == [], "input_type sai → báo lỗi TRƯỚC khi gọi API"
