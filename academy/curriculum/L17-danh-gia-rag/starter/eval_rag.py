"""JobRadar — Bài L17: Đánh giá RAG.

Đo hệ thống hỏi đáp của L16 bằng con số, trên 20 câu hỏi đã gán nhãn tay:
  - truy hồi (retrieval): recall@k, MRR — tin đúng có được tìm thấy, và ở thứ hạng nào?
  - câu trả lời: từ chối đúng lúc, trích nguồn hợp lệ, trích đúng tin liên quan.
Rồi so sánh hai cấu hình (không chia chunk vs chunk 10 từ) để chọn cấu hình bằng số liệu.

Không cần API key: kết quả chạy thật của hai cấu hình đã lưu sẵn trong runs_*.json.
Chạy thật:  python eval_rag.py
Chạy test:  bấm "Chạy test".
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
QUESTIONS = HERE / "questions_20.json"
RUNS = {"whole": HERE / "runs_whole.json", "c10": HERE / "runs_c10.json"}


def recall_at_k(relevant, retrieved, k):
    """Tỉ lệ tin liên quan nằm trong k kết quả đầu.

    relevant: list id tin đúng (nhãn); retrieved: list id theo thứ hạng (hạng 1 trước).
    recall@k = |relevant ∩ retrieved[:k]| / |relevant| (đếm id khác nhau).
    relevant rỗng → raise ValueError (câu hỏi không có đáp án thì không đo recall).
    """
    # TODO
    raise NotImplementedError("TODO: viết recall_at_k")


def reciprocal_rank(relevant, retrieved):
    """1 / thứ hạng của tin liên quan ĐẦU TIÊN trong retrieved (hạng tính từ 1).

    Không có tin liên quan nào trong retrieved → 0.0. relevant rỗng → raise ValueError.
    """
    # TODO
    raise NotImplementedError("TODO: viết reciprocal_rank")


def evaluate_retrieval(questions, runs, ks=(1, 3, 5)):
    """Chỉ số truy hồi, CHỈ trên câu hỏi có đáp án (relevant không rỗng).

    questions: list {"qid", "question", "relevant": [id...]}.
    runs: {qid: {"retrieved": [id...], ...}}; câu hỏi thiếu trong runs → coi retrieved = [].
    Trả về dict, mọi số làm tròn 4 chữ số:
      "recall@<k>" cho từng k trong ks: trung bình recall_at_k trên các câu có đáp án
      "mrr": trung bình reciprocal_rank
      "n": số câu có đáp án
      "misses": list qid có reciprocal_rank == 0 (không tìm thấy tin đúng nào), theo thứ tự questions
    Không có câu nào có đáp án → raise ValueError.
    """
    # TODO
    raise NotImplementedError("TODO: viết evaluate_retrieval")


def evaluate_answers(questions, runs):
    """Chỉ số câu trả lời.

    runs[qid] có "retrieved", "citations" (id model trích), "refused" (bool).
    Câu thiếu trong runs → coi như refused=False, citations=[], retrieved=[].
    Trả về dict, tỉ lệ làm tròn 4 chữ số (mẫu số 0 → 0.0):
      "answerable", "unanswerable": số câu có / không có đáp án
      "correct_refusal": câu KHÔNG có đáp án mà refused / số câu không có đáp án
      "false_refusal":   câu CÓ đáp án mà refused / số câu có đáp án
      "citation_valid":  trong các câu KHÔNG refused, tỉ lệ câu có ≥ 1 citation và
                         MỌI citation đều nằm trong retrieved của chính câu đó
      "citation_precision": gộp mọi câu CÓ đáp án và không refused:
                         tổng số citation thuộc relevant / tổng số citation (micro, như L13)
      "citation_recall":    gộp mọi câu CÓ đáp án (kể cả refused, khi đó citations coi là []):
                         tổng số tin relevant được trích / tổng số tin relevant
      "hallucinated":    list qid KHÔNG có đáp án mà vẫn trả lời (không refused), theo thứ tự questions
    """
    # TODO
    raise NotImplementedError("TODO: viết evaluate_answers")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN.
# ----------------------------------------------------------------------------

def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def print_table(rows, columns):
    print(" | ".join(f"{c:>18}" for c in ["config"] + columns))
    for name, row in rows.items():
        print(" | ".join(f"{v!s:>18}" for v in [name] + [row[c] for c in columns]))


if __name__ == "__main__":
    questions = load_json(QUESTIONS)
    names = sys.argv[1:] or list(RUNS)
    retrieval, answers = {}, {}
    for name in names:
        path = RUNS.get(name, HERE / f"runs_{name}.json")
        runs = load_json(path)
        retrieval[name] = evaluate_retrieval(questions, runs)
        answers[name] = evaluate_answers(questions, runs)
    print(f"Truy hồi ({retrieval[names[0]]['n']} câu có đáp án, k = 5):")
    print_table(retrieval, ["recall@1", "recall@3", "recall@5", "mrr"])
    print("\nCâu trả lời:")
    print_table(answers, ["correct_refusal", "false_refusal", "citation_valid", "citation_precision", "citation_recall"])
    for name in names:
        print(f"\n[{name}] không tìm thấy tin đúng: {retrieval[name]['misses']} · "
              f"trả lời câu không có đáp án: {answers[name]['hallucinated']}")
