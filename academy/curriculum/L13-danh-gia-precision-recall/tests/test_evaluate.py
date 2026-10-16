"""Test tự chấm cho bài L13. Dữ liệu nhỏ viết tay — tính được bằng giấy bút để đối chiếu."""
from collections import Counter

import pytest

from evaluate import error_report, evaluate_skills, field_accuracy, normalize_skill

GOLD = {
    "A": {"skills": ["Python", "SQL", "Airflow"], "level": "junior", "work_mode": "remote", "salary_max": 30},
    "B": {"skills": ["Java", "Spring Boot"], "level": None, "work_mode": "onsite", "salary_max": None},
    "C": {"skills": ["Power BI", "SQL"], "level": "senior", "work_mode": None, "salary_max": 50},
}
PRED = {
    "A": {"skills": ["python", "SQL", "Docker"], "level": "junior", "work_mode": "remote", "salary_max": 30},
    "B": {"skills": ["Java", "Spring Boot", "Kafka"], "level": "middle", "work_mode": "onsite", "salary_max": None},
    "C": {"skills": ["powerbi", "sql", "Docker"], "level": "senior", "work_mode": None, "salary_max": 2000},
}
# Tính tay: A: tp=2 (python, sql) fp=1 (docker) fn=1 (airflow)
#           B: tp=2 fp=1 (kafka) fn=0      C: tp=2 (power bi, sql) fp=1 (docker) fn=0
# → tp=6 fp=3 fn=1 · P=6/9=0.6667 · R=6/7=0.8571 · F1=0.75


# ---------- normalize_skill ----------

@pytest.mark.parametrize("raw, expected", [
    ("Python", "python"),
    ("  Power   BI ", "power bi"),
    ("Postgres", "postgresql"),
    ("k8s", "kubernetes"),
    ("ReactJS", "react"),
    ("NodeJS", "node.js"),
    ("Golang", "go"),
    ("dbt", "dbt"),
])
def test_normalize_skill(raw, expected):
    assert normalize_skill(raw) == expected, (
        "strip + lower + gộp khoảng trắng (' '.join(s.split())), rồi tra SKILL_ALIASES"
    )


# ---------- evaluate_skills ----------

def test_evaluate_skills_micro():
    r = evaluate_skills(GOLD, PRED)
    assert (r["tp"], r["fp"], r["fn"]) == (6, 3, 1), (
        "Đếm trên tập đã normalize: tp = |G∩P|, fp = |P−G|, fn = |G−P|, cộng dồn mọi tin"
    )
    assert r["precision"] == 0.6667 and r["recall"] == 0.8571 and r["f1"] == 0.75, (
        "P = tp/(tp+fp), R = tp/(tp+fn), F1 = 2PR/(P+R), làm tròn 4 chữ số"
    )
    assert r["missing"] == 0


def test_evaluate_skills_hoan_hao_va_trung_lap():
    pred = {k: {"skills": v["skills"] + [s.upper() for s in v["skills"]]} for k, v in GOLD.items()}
    r = evaluate_skills(GOLD, pred)
    assert r["precision"] == 1.0 and r["recall"] == 1.0 and r["f1"] == 1.0, (
        "Dùng set: 'SQL' và 'sql' là một kỹ năng, không đếm 2 lần"
    )


def test_evaluate_skills_thieu_du_doan():
    pred = {"A": PRED["A"], "Z": {"skills": ["Rust"]}}
    r = evaluate_skills(GOLD, pred)
    assert r["missing"] == 2, "B và C không có trong pred → missing = 2"
    assert (r["tp"], r["fp"], r["fn"]) == (2, 1, 5), (
        "Tin thiếu → P rỗng → toàn bộ kỹ năng gold là fn; tin Z không có trong gold → bỏ qua"
    )


def test_evaluate_skills_mau_so_bang_0():
    r = evaluate_skills({"A": {"skills": ["SQL"]}}, {"A": {"skills": []}})
    assert r["precision"] == 0.0 and r["recall"] == 0.0 and r["f1"] == 0.0, (
        "Không dự đoán gì → tp+fp = 0 → precision = 0.0 (không chia cho 0)"
    )
    r2 = evaluate_skills({"A": {"skills": []}}, {"A": {"skills": None}})
    assert r2["f1"] == 0.0, "skills = None trong pred coi như []"


# ---------- field_accuracy ----------

def test_field_accuracy_level():
    r = field_accuracy(GOLD, PRED, "level")
    assert r["correct"] == 2 and r["total"] == 3 and r["accuracy"] == 0.6667
    assert r["confusions"] == Counter({(None, "middle"): 1}), (
        "confusions đếm cặp (gold, pred) khi sai — ở đây model tự suy 'middle' khi tin không ghi"
    )


def test_field_accuracy_none_bang_none_la_dung():
    r = field_accuracy(GOLD, PRED, "work_mode")
    assert r["accuracy"] == 1.0, "Gold None và pred None → đúng (tin không nói, model cũng để trống)"
    r2 = field_accuracy(GOLD, PRED, "salary_max")
    assert r2["correct"] == 2 and r2["confusions"] == Counter({(50, 2000): 1})


def test_field_accuracy_tin_thieu():
    r = field_accuracy(GOLD, {"A": PRED["A"]}, "level")
    assert r["correct"] == 1 and r["total"] == 3
    assert r["confusions"] == Counter({(None, "<missing>"): 1, ("senior", "<missing>"): 1}), (
        "Tin thiếu trong pred → sai, giá trị pred ghi là '<missing>' (kể cả khi gold là None)"
    )
    assert field_accuracy({}, {}, "level")["accuracy"] == 0.0


# ---------- error_report ----------

def test_error_report_xep_hang():
    r = error_report(GOLD, PRED)
    assert r["false_positives"] == [("docker", 2), ("kafka", 1)], (
        "Kỹ năng thừa, đã normalize, sắp count giảm dần rồi tên A→Z"
    )
    assert r["false_negatives"] == [("airflow", 1)]


def test_error_report_gioi_han_top():
    gold = {f"J{i}": {"skills": []} for i in range(3)}
    pred = {"J0": {"skills": ["c", "b", "a"]}, "J1": {"skills": ["b", "a"]}, "J2": {"skills": ["d"]}}
    r = error_report(gold, pred, top=3)
    assert r["false_positives"] == [("a", 2), ("b", 2), ("c", 1)], "Bằng count thì A→Z; cắt còn `top` phần tử"
    assert r["false_negatives"] == []
