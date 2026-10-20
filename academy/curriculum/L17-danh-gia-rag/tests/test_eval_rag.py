"""Test tự chấm cho bài L17. Chỉ dùng dữ liệu nhỏ tính tay được, không gọi mạng."""
import pytest

from eval_rag import evaluate_answers, evaluate_retrieval, reciprocal_rank, recall_at_k

# ---------- recall_at_k ----------


def test_recall_at_k_co_ban():
    retrieved = ["A", "X", "B", "Y", "C"]
    assert recall_at_k(["A", "B", "C"], retrieved, 1) == pytest.approx(1 / 3), "Top 1 = [A] → 1/3 tin đúng"
    assert recall_at_k(["A", "B", "C"], retrieved, 3) == pytest.approx(2 / 3), "Top 3 có A, B → 2/3"
    assert recall_at_k(["A", "B", "C"], retrieved, 5) == pytest.approx(1.0)
    assert recall_at_k(["Z"], retrieved, 5) == 0.0


def test_recall_at_k_khong_dem_trung_va_k_lon():
    assert recall_at_k(["A", "A", "B"], ["A", "A", "Q"], 3) == pytest.approx(0.5), (
        "Đếm id khác nhau: relevant = {A, B}, tìm được {A} → 0.5"
    )
    assert recall_at_k(["A"], ["X", "A"], 10) == 1.0, "k lớn hơn số kết quả → xét hết"
    with pytest.raises(ValueError):
        recall_at_k([], ["A"], 5)


# ---------- reciprocal_rank ----------

def test_reciprocal_rank():
    assert reciprocal_rank(["B", "C"], ["X", "B", "C"]) == pytest.approx(0.5), "Tin đúng đầu tiên ở hạng 2 → 1/2"
    assert reciprocal_rank(["A"], ["A", "B"]) == 1.0
    assert reciprocal_rank(["A"], ["X", "Y", "Z"]) == 0.0, "Không tìm thấy → 0.0"
    assert reciprocal_rank(["A"], []) == 0.0
    with pytest.raises(ValueError):
        reciprocal_rank([], ["A"])


# ---------- evaluate_retrieval ----------

QUESTIONS = [
    {"qid": "Q1", "question": "q1", "relevant": ["A", "B"]},
    {"qid": "Q2", "question": "q2", "relevant": ["C"]},
    {"qid": "Q3", "question": "q3", "relevant": ["D"]},
    {"qid": "Q4", "question": "q4", "relevant": []},
]
RUNS = {
    "Q1": {"retrieved": ["A", "X", "B"], "citations": ["A", "X"], "refused": False},
    "Q2": {"retrieved": ["Y", "Z", "W", "C"], "citations": [], "refused": True},
    "Q3": {"retrieved": ["E", "F"], "citations": ["E", "Q"], "refused": False},
    "Q4": {"retrieved": ["A"], "citations": ["A"], "refused": False},
}


def test_evaluate_retrieval_tinh_tay():
    rep = evaluate_retrieval(QUESTIONS, RUNS, ks=(1, 3))
    assert rep["n"] == 3, "Câu không có đáp án (Q4) không tính vào truy hồi"
    assert rep["recall@1"] == 0.1667, "(1/2 + 0 + 0) / 3"
    assert rep["recall@3"] == 0.3333, "(2/2 + 0 + 0) / 3 — C của Q2 ở hạng 4, ngoài top 3"
    assert rep["mrr"] == 0.4167, "(1/1 + 1/4 + 0) / 3"
    assert rep["misses"] == ["Q3"], "Q3 không có tin đúng nào trong kết quả"
    assert set(rep) == {"recall@1", "recall@3", "mrr", "n", "misses"}


def test_evaluate_retrieval_cau_thieu_va_khong_co_dap_an():
    rep = evaluate_retrieval(QUESTIONS[:2], {"Q1": RUNS["Q1"]}, ks=(5,))
    assert rep["recall@5"] == 0.5 and rep["misses"] == ["Q2"], "Câu thiếu trong runs → retrieved = [] → tính là trượt"
    with pytest.raises(ValueError):
        evaluate_retrieval([QUESTIONS[3]], RUNS)
    assert set(evaluate_retrieval(QUESTIONS, RUNS)) == {"recall@1", "recall@3", "recall@5", "mrr", "n", "misses"}, (
        "Mặc định ks=(1, 3, 5)"
    )


# ---------- evaluate_answers ----------

def test_evaluate_answers_tinh_tay():
    rep = evaluate_answers(QUESTIONS, RUNS)
    assert rep["answerable"] == 3 and rep["unanswerable"] == 1
    assert rep["correct_refusal"] == 0.0 and rep["hallucinated"] == ["Q4"], (
        "Q4 không có đáp án mà vẫn trả lời → bịa"
    )
    assert rep["false_refusal"] == 0.3333, "Q2 có đáp án mà từ chối: 1/3"
    assert rep["citation_valid"] == 0.6667, (
        "Câu không refused: Q1, Q3, Q4. Q1 (A, X ⊆ retrieved) và Q4 hợp lệ; Q3 trích Q không có trong retrieved → 2/3"
    )
    assert rep["citation_precision"] == 0.25, (
        "Câu có đáp án, không refused: Q1 trích {A, X}, Q3 trích {E, Q} → 1 đúng (A) / 4 trích"
    )
    assert rep["citation_recall"] == 0.25, "Tin relevant: A, B, C, D = 4; được trích: A → 1/4"


def test_evaluate_answers_tu_choi_dung_va_mau_so_0():
    qs = [{"qid": "U1", "question": "u", "relevant": []}, {"qid": "U2", "question": "u", "relevant": []}]
    runs = {"U1": {"retrieved": ["A"], "citations": [], "refused": True}}
    rep = evaluate_answers(qs, runs)
    assert rep["correct_refusal"] == 0.5, "U1 từ chối đúng; U2 thiếu trong runs → coi như không từ chối"
    assert rep["hallucinated"] == ["U2"]
    assert rep["false_refusal"] == 0.0 and rep["citation_precision"] == 0.0 and rep["citation_recall"] == 0.0, (
        "Mẫu số 0 → 0.0, không chia cho 0"
    )
    assert rep["citation_valid"] == 0.0, "U2 trả lời mà không trích nguồn nào → không hợp lệ"


# ---------- dữ liệu thật ----------

def test_ket_qua_tren_du_lieu_that():
    import eval_rag

    questions = eval_rag.load_json(eval_rag.QUESTIONS)
    runs = eval_rag.load_json(eval_rag.RUNS["whole"])
    ret = evaluate_retrieval(questions, runs)
    assert ret["n"] == 16 and ret["recall@5"] == 0.8333 and ret["mrr"] == 0.9688, (
        "Cấu hình whole: 16 câu có đáp án, recall@5 = 0.8333, MRR = 0.9688 (xem bảng ở lesson.md, Bước 5)"
    )
    ans = evaluate_answers(questions, runs)
    assert ans["correct_refusal"] == 1.0 and ans["citation_precision"] == 0.7812 and ans["citation_recall"] == 0.7353
