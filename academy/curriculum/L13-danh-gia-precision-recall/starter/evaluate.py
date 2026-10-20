"""JobRadar — Bài L13: Đánh giá bộ trích xuất — tập nhãn, precision/recall.

Dữ liệu đi kèm bài (cùng thư mục):
  gold_30.json        30 tin đã gán nhãn tay theo HƯỚNG DẪN GÁN NHÃN (xem lesson.md)
  predictions_v1.json output thật của extract.py (L11) với prompt v1
  predictions_v2.json output thật với prompt v2 (thêm quy đổi lương USD, quy tắc cấp bậc, work_mode)

Chạy thật:  python evaluate.py         → in bảng so sánh v1 vs v2
Chạy test:  bấm "Chạy test".
Chỉ dùng thư viện chuẩn.
"""
import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Các cách viết khác nhau của cùng một kỹ năng (đã chữ thường) → tên chuẩn
SKILL_ALIASES = {
    "postgres": "postgresql", "k8s": "kubernetes", "sklearn": "scikit-learn",
    "scikit learn": "scikit-learn", "js": "javascript", "ts": "typescript",
    "nodejs": "node.js", "node": "node.js", "reactjs": "react", "react.js": "react",
    "nextjs": "next.js", "next": "next.js", "powerbi": "power bi", "golang": "go",
    "cicd": "ci/cd", "ci-cd": "ci/cd", "rest": "rest api", "restful api": "rest api",
}


def normalize_skill(skill):
    """Đưa tên kỹ năng về dạng chuẩn để so sánh.

    1. strip, chữ thường, gộp nhiều khoảng trắng thành một  ("  Power   BI " → "power bi")
    2. tra SKILL_ALIASES: có thì thay bằng tên chuẩn ("Postgres" → "postgresql")
    """
    # TODO
    raise NotImplementedError("TODO: viết normalize_skill")


def evaluate_skills(gold, pred):
    """Precision / recall / F1 cho kỹ năng, tính kiểu MICRO (cộng dồn mọi tin rồi mới chia).

    gold: dict job_id → {"skills": [...], ...}     pred: cùng dạng.
    Với mỗi job_id trong gold:
      G = tập kỹ năng gold (đã normalize_skill), P = tập kỹ năng dự đoán (đã normalize)
      tin không có trong pred → P rỗng, và đếm vào "missing"
      pred[id]["skills"] là None hoặc thiếu → coi như []
      tp += |G ∩ P|    fp += |P − G|    fn += |G − P|
    Tin chỉ có trong pred (không có trong gold) → bỏ qua.

    precision = tp / (tp + fp)    recall = tp / (tp + fn)    f1 = 2PR / (P + R)
    Mẫu số bằng 0 → giá trị đó là 0.0. Làm tròn 4 chữ số.
    Trả về: {"precision", "recall", "f1", "tp", "fp", "fn", "missing"}
    """
    # TODO
    raise NotImplementedError("TODO: viết evaluate_skills")


def field_accuracy(gold, pred, field):
    """Tỉ lệ tin mà trường `field` (vd. "level", "work_mode", "salary_max") dự đoán đúng.

    Duyệt mọi job_id trong gold. Đúng khi tin có trong pred VÀ pred[id].get(field) == gold[id][field]
    (None == None cũng là đúng: "tin không nói" và model cũng để trống).
    Sai thì ghi cặp (giá_trị_gold, giá_trị_pred) vào Counter `confusions`;
    tin thiếu trong pred → giá_trị_pred là "<missing>".
    Trả về: {"accuracy": round(correct / total, 4), "correct", "total", "confusions": Counter}
    gold rỗng → accuracy 0.0.
    """
    # TODO
    raise NotImplementedError("TODO: viết field_accuracy")


def error_report(gold, pred, top=5):
    """Phân tích lỗi kỹ năng: kỹ năng nào hay bị THỪA (fp), kỹ năng nào hay bị SÓT (fn).

    Cùng quy tắc như evaluate_skills (normalize, tin thiếu hoặc skills None → P rỗng).
    Trả về {"false_positives": [(skill, count), ...], "false_negatives": [...]}
    mỗi list tối đa `top` phần tử, sắp theo count GIẢM DẦN, bằng nhau thì skill A→Z.
    """
    # TODO
    raise NotImplementedError("TODO: viết error_report")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN.
# ----------------------------------------------------------------------------

def load_gold(path=HERE / "gold_30.json"):
    """gold_30.json là list tin → dict job_id → nhãn."""
    by_id = {}
    for item in json.loads(Path(path).read_text(encoding="utf-8")):
        by_id[item["job_id"]] = item
    return by_id


def load_pred(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def report(name, gold, pred):
    s = evaluate_skills(gold, pred)
    row = {"version": name, "skill_P": s["precision"], "skill_R": s["recall"], "skill_F1": s["f1"]}
    for field in ("level", "work_mode", "salary_min", "salary_max"):
        row[field] = field_accuracy(gold, pred, field)["accuracy"]
    return row


if __name__ == "__main__":
    gold = load_gold()
    rows = []
    for ver in ("v1", "v2", "mine"):
        path = HERE / f"predictions_{ver}.json"
        if path.exists():
            pred = load_pred(path)
            rows.append(report(ver, gold, pred))
            lv = field_accuracy(gold, pred, "level")["confusions"]
            print(f"[{ver}] level sai (gold, pred): {dict(lv)}")
            print(f"[{ver}] lỗi kỹ năng: {error_report(gold, pred)}")
    cols = list(rows[0])                  # tên cột = các key của dòng đầu
    header = []
    for c in cols:
        header.append(f"{c:>10}")         # :>10 — căn phải, rộng 10 ký tự
    print("\n" + " | ".join(header))
    for r in rows:
        cells = []
        for c in cols:
            cells.append(f"{r[c]:>10}")
        print(" | ".join(cells))
