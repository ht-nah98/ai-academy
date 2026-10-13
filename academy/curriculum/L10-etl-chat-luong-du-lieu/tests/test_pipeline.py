"""Test tự chấm cho bài L10.

quality_checks và split_rejects chỉ cần pipeline.py. upsert_jobs và run_pipeline cần thêm
cleaning.py (L07) và db.py (L08) mà bạn đã copy vào thư mục bài này (Bước 1).
"""
import logging
import sqlite3
from pathlib import Path

import pandas as pd
import pytest

from pipeline import DataQualityError, quality_checks, run_pipeline, split_rejects, upsert_jobs

DATASET = Path(__file__).resolve().parents[3] / "datasets" / "jobs_raw.csv"
NAN = float("nan")


def clean_row(job_id, **kw):
    row = {"job_id": job_id, "title": "Data Engineer", "company": "Lotus AI", "city": "Hà Nội", "level": "junior",
           "salary_min": 15.0, "salary_max": 25.0, "posted_date": "2026-09-01", "skills": ["python", "sql"],
           "source": "topcv", "description": "x"}
    row.update(kw)
    return row


GOOD = pd.DataFrame([clean_row("J1"), clean_row("J2", title="AI Engineer", skills=["llm"])])
MIXED = pd.DataFrame([
    clean_row("J1"),
    clean_row("J2", salary_min=40.0, salary_max=15.0),
    clean_row("J3", salary_min=500.0, salary_max=800.0, company=NAN),
    clean_row("J4", posted_date="2027-03-01"),
    clean_row("J5", salary_min=NAN, salary_max=NAN, posted_date=None),
    clean_row("J6", salary_min=NAN, salary_max=0.5),
])


# ---------- quality_checks ----------

def test_quality_checks_du_lieu_tot():
    assert quality_checks(GOOD) == [], "Dữ liệu hợp lệ thì trả về list rỗng"


def test_quality_checks_bat_loi_tung_dong():
    got = sorted(quality_checks(MIXED))
    want = sorted([("salary_min_gt_max", "J2"), ("salary_out_of_range", "J3"), ("company_null", "J3"),
                   ("date_in_future", "J4"), ("salary_out_of_range", "J6")])
    assert got == want, (
        f"Kỳ vọng {want}, nhận {got}. Nhớ: thiếu lương (NaN) KHÔNG phải lỗi; "
        "chỉ so min > max khi có cả hai; ngoài khoảng xét từng giá trị có mặt"
    )


def test_quality_checks_title_va_trung_id():
    df = pd.DataFrame([clean_row("J1"), clean_row("J1", title="Khác"), clean_row("J2", title="  ")])
    got = sorted(quality_checks(df))
    assert got == [("job_id_duplicate", "J1"), ("title_null", "J2")], (
        "job_id trùng báo MỘT lần cho mỗi id; title toàn khoảng trắng cũng là trống"
    )


def test_quality_checks_so_dong_va_as_of():
    assert ("row_count", None) in quality_checks(GOOD, min_rows=5), "Ít hơn min_rows dòng → ('row_count', None)"
    assert quality_checks(pd.DataFrame([clean_row("J4", posted_date="2027-03-01")]), as_of="2027-12-31") == [], (
        "Dùng tham số as_of, không gán cứng ngày"
    )


# ---------- split_rejects ----------

def test_split_rejects_tach_dong():
    valid, rejected = split_rejects(MIXED, quality_checks(MIXED))
    assert list(valid["job_id"]) == ["J1", "J5"], "Chỉ J1 và J5 hợp lệ"
    assert list(valid.index) == [0, 1], "Nhớ reset_index(drop=True)"
    assert rejected == [("J2", "salary_min_gt_max"), ("J3", "company_null, salary_out_of_range"),
                        ("J4", "date_in_future"), ("J6", "salary_out_of_range")], (
        "rejected: (job_id, lý do sắp A→Z nối bằng ', '), theo thứ tự dòng"
    )


def test_split_rejects_bo_qua_loi_ca_lo():
    valid, rejected = split_rejects(GOOD, [("row_count", None)])
    assert len(valid) == 2 and rejected == [], "Lỗi cả lô (BLOCKING_CHECKS) không loại dòng nào"


# ---------- upsert_jobs ----------

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;
CREATE TABLE companies (company_id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE jobs (job_id TEXT PRIMARY KEY, title TEXT NOT NULL, company_id INTEGER REFERENCES companies(company_id),
                   city TEXT, level TEXT, salary_min REAL, salary_max REAL, posted_date TEXT, source TEXT, description TEXT);
CREATE TABLE job_skills (job_id TEXT NOT NULL REFERENCES jobs(job_id), skill TEXT NOT NULL, PRIMARY KEY (job_id, skill));
"""


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.executescript(SCHEMA_SQL)  # giống schema L08
    yield c
    c.close()


def snapshot(conn):
    return {t: conn.execute(f"SELECT * FROM {t} ORDER BY 1, 2").fetchall() for t in ["companies", "jobs", "job_skills"]}


def test_upsert_jobs_chay_2_lan_nhu_1_lan(conn):
    assert upsert_jobs(conn, GOOD) == 2, "Trả về số tin đã nạp"
    first = snapshot(conn)
    upsert_jobs(conn, GOOD)
    assert snapshot(conn) == first, "Chạy lần 2 với cùng dữ liệu phải ra DB y hệt (không trùng, không lỗi)"


def test_upsert_jobs_cap_nhat_tin_cu(conn):
    upsert_jobs(conn, GOOD)
    changed = pd.DataFrame([clean_row("J1", salary_max=30.0, skills=["python", "spark"])])
    upsert_jobs(conn, changed)
    assert conn.execute("SELECT salary_max FROM jobs WHERE job_id = 'J1'").fetchone()[0] == 30.0, (
        "Tin đã có phải được CẬP NHẬT: ON CONFLICT(job_id) DO UPDATE SET ..."
    )
    skills = [r[0] for r in conn.execute("SELECT skill FROM job_skills WHERE job_id = 'J1' ORDER BY skill")]
    assert skills == ["python", "spark"], "Kỹ năng cũ ('sql') phải bị xóa: DELETE kỹ năng của tin rồi INSERT lại"
    assert conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 2, "Không được thêm dòng trùng"


# ---------- run_pipeline ----------

RAW_CSV = """job_id,title,company,city,salary,level,skills,posted_date,source,description
R1,Data Engineer,Lotus AI,HCM,15-25 triệu,Junior,"Python, SQL",2026-09-01,topcv,a
R2,AI Engineer,VietData,Ha Noi,Thỏa thuận,Middle,LLM;Python,01/09/2026,itviec,b
R1,Data Engineer,Lotus AI,HCM,15-25 triệu,Junior,"Python, SQL",2026-09-01,topcv,a
R3,Data Analyst,VietData,HN,40-15 triệu,Junior,SQL,2026-08-01,topcv,c
R4,QA Engineer,Mekong Soft,Đà Nẵng,10 triệu,Fresher,Java,2026-07-01,topcv,d
,Bad Row,X,HCM,,,,,topcv,e
"""


@pytest.fixture
def csv_path(tmp_path):
    p = tmp_path / "raw.csv"
    p.write_text(RAW_CSV, encoding="utf-8")
    return p


def test_run_pipeline_tom_tat(csv_path, tmp_path):
    summary = run_pipeline(csv_path, tmp_path / "out.db", max_reject_ratio=0.5)
    assert summary == {"raw": 6, "clean": 4, "rejected": 1, "loaded": 3}, (
        "6 dòng thô → clean_jobs còn 4 (bỏ trùng R1, bỏ dòng thiếu job_id) → R3 bị loại (40-15) → nạp 3"
    )


def test_run_pipeline_idempotent(csv_path, tmp_path):
    db = tmp_path / "out.db"
    run_pipeline(csv_path, db, max_reject_ratio=0.5)
    c = sqlite3.connect(db)
    first = snapshot(c)
    c.close()
    run_pipeline(csv_path, db, max_reject_ratio=0.5)
    c = sqlite3.connect(db)
    assert snapshot(c) == first, "Chạy pipeline 2 lần phải ra DB y hệt — dùng upsert_jobs, không INSERT thường"
    c.close()


def test_run_pipeline_dung_khi_loi_ca_lo(csv_path, tmp_path):
    db = tmp_path / "out.db"
    with pytest.raises(DataQualityError):
        run_pipeline(csv_path, db, min_rows=100)
    assert not db.exists() or sqlite3.connect(db).execute(
        "SELECT name FROM sqlite_master WHERE name = 'jobs'").fetchone() is None, (
        "Lỗi chất lượng phải dừng TRƯỚC khi đụng vào DB"
    )


def test_run_pipeline_dung_khi_loai_qua_nhieu(csv_path, tmp_path):
    with pytest.raises(DataQualityError):
        run_pipeline(csv_path, tmp_path / "out.db", max_reject_ratio=0.1)  # 1/4 = 25% > 10%


def test_run_pipeline_ghi_log(csv_path, tmp_path, caplog):
    with caplog.at_level(logging.INFO, logger="jobradar.pipeline"):
        run_pipeline(csv_path, tmp_path / "out.db", max_reject_ratio=0.5)
    ours = [r for r in caplog.records if r.name == "jobradar.pipeline"]
    assert len([r for r in ours if r.levelno == logging.INFO]) >= 3, "Cần log.info ở các bước extract, transform, load"
    warnings = [r.getMessage() for r in ours if r.levelno == logging.WARNING]
    assert any("R3" in m for m in warnings), "Mỗi dòng bị loại phải có log.warning chứa job_id (R3)"


@pytest.mark.skipif(not DATASET.exists(), reason="không tìm thấy datasets/jobs_raw.csv")
def test_run_pipeline_du_lieu_that(tmp_path):
    db = tmp_path / "jobradar.db"
    first = run_pipeline(DATASET, db)
    assert first == {"raw": 302, "clean": 268, "rejected": 4, "loaded": 264}, f"Kết quả trên dữ liệu thật: {first}"
    second = run_pipeline(DATASET, db)
    c = sqlite3.connect(db)
    counts = [c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ["companies", "jobs", "job_skills"]]
    c.close()
    assert second == first and counts[1] == 264, "Chạy lần 2: DB vẫn đúng 264 tin"
