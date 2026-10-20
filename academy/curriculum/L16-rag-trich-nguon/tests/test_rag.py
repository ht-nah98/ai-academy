"""Test tự chấm cho bài L16. search và chat GIẢ: không gọi mạng, không cần API key.

Bài này qua test được kể cả trước khi copy semantic.py, index.py sang (chạy thật thì cần).
"""
from rag import REFUSAL, RAG_RULES, answer_question, build_rag_messages, extract_citations, format_sources

HITS = [
    {"job_id": "JR-10001", "chunk_id": "JR-10001#0", "text": "Đầu bếp — Quán A (Huế)\nNấu phở", "score": 0.62},
    {"job_id": "JR-10002", "chunk_id": "JR-10002#0", "text": "Phụ bếp — Quán B (Huế)\nRửa rau", "score": 0.55},
    {"job_id": "JR-10001", "chunk_id": "JR-10001#1", "text": "Đầu bếp — Quán A (Huế)\nCa tối", "score": 0.41},
]


class FakeChat:
    def __init__(self, reply):
        self.reply, self.calls = reply, []

    def __call__(self, messages):
        self.calls.append(messages)
        return self.reply


def fake_search(hits):
    calls = []

    def search(question, k):
        calls.append((question, k))
        return hits[:k]
    search.calls = calls
    return search


# ---------- format_sources ----------

def test_format_sources_gop_chunk_cung_tin():
    assert format_sources(HITS) == (
        "[JR-10001] Đầu bếp — Quán A (Huế)\nNấu phở … Đầu bếp — Quán A (Huế)\nCa tối\n\n"
        "[JR-10002] Phụ bếp — Quán B (Huế)\nRửa rau"
    ), "Mỗi job_id một khối '[id] text'; chunk cùng tin nối bằng ' … '; khối cách nhau một dòng trống"
    assert format_sources([]) == ""


# ---------- build_rag_messages ----------

def test_build_rag_messages_dung_cau_truc():
    msgs = build_rag_messages("Quán nào tuyển đầu bếp?", HITS[:2])
    assert [m["role"] for m in msgs] == ["system", "user"]
    assert msgs[0]["content"] == RAG_RULES
    assert msgs[1]["content"] == "NGUỒN:\n" + format_sources(HITS[:2]) + "\n\nCÂU HỎI: Quán nào tuyển đầu bếp?"
    assert REFUSAL in RAG_RULES, "Quy tắc phải dạy model câu từ chối chuẩn"


# ---------- extract_citations ----------

def test_extract_citations_trong_ngoac_vuong():
    answer = "Quán A tuyển đầu bếp [JR-10001]. Quán B tuyển phụ bếp [JR-10002, JR-10001]; xem thêm tin JR-10009."
    assert extract_citations(answer) == ["JR-10001", "JR-10002"], (
        "Lấy id trong ngoặc vuông, một ngoặc có thể nhiều id; bỏ trùng, giữ thứ tự; 'tin JR-10009' không trong ngoặc → bỏ"
    )


def test_extract_citations_khong_co_hoac_sai_dang():
    assert extract_citations(REFUSAL) == []
    assert extract_citations("[JR-1001] [nguồn 1]") == [], "JR-1001 (4 chữ số) không phải id hợp lệ"


# ---------- answer_question ----------

def test_answer_question_tra_loi_co_nguon_hop_le():
    chat = FakeChat("  Quán A tuyển đầu bếp nấu phở [JR-10001].  ")
    search = fake_search(HITS)
    res = answer_question("Quán nào tuyển đầu bếp?", search, chat, k=3)
    assert search.calls == [("Quán nào tuyển đầu bếp?", 3)], "Gọi search_fn(question, k)"
    assert chat.calls == [build_rag_messages("Quán nào tuyển đầu bếp?", HITS)], "Gửi đúng messages của build_rag_messages"
    assert res == {"answer": "Quán A tuyển đầu bếp nấu phở [JR-10001].", "citations": ["JR-10001"],
                   "invalid_citations": [], "sources": ["JR-10001", "JR-10002"], "refused": False,
                   "llm_called": True, "ok": True}, "answer đã strip(); sources không trùng, theo thứ tự truy hồi"


def test_answer_question_phat_hien_nguon_bia():
    chat = FakeChat("Quán C tuyển bếp trưởng [JR-10999]. Quán A tuyển đầu bếp [JR-10001].")
    res = answer_question("Bếp trưởng?", fake_search(HITS), chat, k=3)
    assert res["citations"] == ["JR-10999", "JR-10001"]
    assert res["invalid_citations"] == ["JR-10999"], "JR-10999 không có trong nguồn truy hồi → model bịa nguồn"
    assert res["ok"] is False


def test_answer_question_model_tu_choi_hoac_khong_trich():
    res = answer_question("Có tuyển phi công không?", fake_search(HITS), FakeChat(REFUSAL), k=3)
    assert res["refused"] is True and res["ok"] is False and res["llm_called"] is True
    res2 = answer_question("Quán nào?", fake_search(HITS), FakeChat("Quán A tuyển đầu bếp."), k=3)
    assert res2["refused"] is False and res2["citations"] == [] and res2["ok"] is False, (
        "Trả lời không trích nguồn → không ok"
    )


def test_answer_question_khong_goi_llm_khi_khong_co_nguon_du_tot():
    chat = FakeChat("không được gọi")
    res = answer_question("Phi công?", fake_search([]), chat)
    assert chat.calls == [] and res["answer"] == REFUSAL and res["refused"] is True
    assert res["llm_called"] is False and res["sources"] == []
    res2 = answer_question("Phi công?", fake_search(HITS), chat, k=3, min_score=0.7)
    assert chat.calls == [], "Điểm cao nhất 0.62 < min_score 0.7 → từ chối, không tốn lời gọi LLM"
    assert res2["refused"] is True and res2["sources"] == ["JR-10001", "JR-10002"]
