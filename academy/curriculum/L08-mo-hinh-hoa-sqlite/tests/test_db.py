"""Test tự chấm cho bài L08. Mỗi test dùng SQLite trong RAM (":memory:"), không đụng file thật."""
import sqlite3

import pandas as pd
import pytest

from db import count_rows, create_schema, get_or_create_company, load_jobs

NAN = float("nan")
CLEAN = pd.DataFrame([
    {"job_id": "J1", "title": "Data Engineer", "company": "Lotus AI", "city": "Hà Nội", "level": "junior",
     "salary_min": 15.0, "salary_max": 25.0, "posted_date": "2026-09-01", "skills": ["python", "sql"],
     "source": "topcv", "description": "a"},
    {"job_id": "J2", "title": "AI Engineer Intern", "company": "Lotus AI", "city": "Hồ Chí Minh", "level": "intern",
     "salary_min": NAN, "salary_max": 8.0, "posted_date": None, "skills": ["python", "llm", "docker"],
     "source": "itviec", "description": "b"},
    {"job_id": "J3", "title": "Data Analyst", "company": "VietData", "city": NAN, "level": NAN,
     "salary_min": NAN, "salary_max": NAN, "posted_date": "2026-08-05", "skills": [],
     "source": "topcv", "description": "c"},
])


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    yield c
    c.close()


def columns(conn, table):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]


def pk_columns(conn, table):
    return [r[1] for r in sorted(conn.execute(f"PRAGMA table_info({table})"), key=lambda r: r[5]) if r[5] > 0]


# ---------- create_schema ----------

def test_create_schema_co_3_bang_dung_cot(conn):
    create_schema(conn)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"companies", "jobs", "job_skills"} <= tables, f"Cần đủ 3 bảng companies, jobs, job_skills (đang có {tables})"
    assert set(columns(conn, "companies")) == {"company_id", "name"}
    assert set(columns(conn, "jobs")) == {"job_id", "title", "company_id", "city", "level", "salary_min",
                                          "salary_max", "posted_date", "source", "description"}, "Bảng jobs thiếu/thừa cột"
    assert set(columns(conn, "job_skills")) == {"job_id", "skill"}


def test_create_schema_khoa_chinh(conn):
    create_schema(conn)
    assert pk_columns(conn, "companies") == ["company_id"], "companies: company_id INTEGER PRIMARY KEY"
    assert pk_columns(conn, "jobs") == ["job_id"], "jobs: job_id là khóa chính"
    assert pk_columns(conn, "job_skills") == ["job_id", "skill"], "job_skills: khóa chính GHÉP PRIMARY KEY (job_id, skill)"


def test_create_schema_khoa_ngoai(conn):
    create_schema(conn)
    fk_jobs = [(r[2], r[3], r[4]) for r in conn.execute("PRAGMA foreign_key_list(jobs)")]
    fk_skills = [(r[2], r[3], r[4]) for r in conn.execute("PRAGMA foreign_key_list(job_skills)")]
    assert ("companies", "company_id", "company_id") in fk_jobs, "jobs.company_id phải REFERENCES companies(company_id)"
    assert ("jobs", "job_id", "job_id") in fk_skills, "job_skills.job_id phải REFERENCES jobs(job_id)"
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1, "Nhớ bật PRAGMA foreign_keys = ON"
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO job_skills (job_id, skill) VALUES ('KHONG-CO', 'python')")


def test_create_schema_rang_buoc(conn):
    create_schema(conn)
    conn.execute("INSERT INTO companies (name) VALUES ('A')")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO companies (name) VALUES ('A')")  # name UNIQUE
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO jobs (job_id, title) VALUES ('X', NULL)")  # title NOT NULL


def test_create_schema_goi_2_lan(conn):
    create_schema(conn)
    create_schema(conn)  # không được lỗi "table already exists" — dùng IF NOT EXISTS


# ---------- get_or_create_company ----------

def test_get_or_create_company_khong_trung(conn):
    create_schema(conn)
    a = get_or_create_company(conn, "Lotus AI")
    b = get_or_create_company(conn, "VietData")
    again = get_or_create_company(conn, "Lotus AI")
    assert isinstance(a, int) and a != b, "Mỗi công ty mới có một id riêng (số nguyên)"
    assert again == a, "Gọi lại cùng tên phải trả về id cũ, không thêm dòng mới"
    assert conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0] == 2


def test_get_or_create_company_trong(conn):
    create_schema(conn)
    assert get_or_create_company(conn, None) is None and get_or_create_company(conn, NAN) is None, (
        "Tên trống → None (dùng to_db để đổi NaN thành None)"
    )
    assert conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0] == 0


def test_get_or_create_company_ky_tu_dac_biet(conn):
    create_schema(conn)
    get_or_create_company(conn, "O'Reilly Data")
    assert conn.execute("SELECT name FROM companies").fetchone()[0] == "O'Reilly Data", (
        "Tên có dấu ' làm hỏng SQL ghép chuỗi — hãy dùng tham số ?"
    )


# ---------- load_jobs ----------

def test_load_jobs_dem_dong(conn):
    create_schema(conn)
    assert load_jobs(conn, CLEAN) == 3, "load_jobs trả về số tin đã nạp"
    assert count_rows(conn) == {"companies": 2, "jobs": 3, "job_skills": 5}, (
        "3 tin, 2 công ty (Lotus AI dùng chung id), 2 + 3 + 0 = 5 kỹ năng"
    )


def test_load_jobs_null_va_khoa_ngoai(conn):
    create_schema(conn)
    load_jobs(conn, CLEAN)
    row = conn.execute("SELECT city, level, salary_min, salary_max, posted_date FROM jobs WHERE job_id = 'J3'").fetchone()
    assert row == (None, None, None, None, "2026-08-05"), "NaN phải thành NULL (None) — đi qua to_db"
    names = conn.execute("""SELECT c.name FROM jobs j JOIN companies c ON c.company_id = j.company_id
                            ORDER BY j.job_id""").fetchall()
    assert names == [("Lotus AI",), ("Lotus AI",), ("VietData",)], "jobs.company_id phải trỏ đúng công ty"
    skills = conn.execute("SELECT skill FROM job_skills WHERE job_id = 'J2' ORDER BY skill").fetchall()
    assert skills == [("docker",), ("llm",), ("python",)]


def test_load_jobs_loi_thi_rollback(conn):
    create_schema(conn)
    bad = pd.concat([CLEAN, CLEAN.iloc[[0]]], ignore_index=True)  # J1 lặp → vi phạm khóa chính
    with pytest.raises(sqlite3.IntegrityError):
        load_jobs(conn, bad)
    assert count_rows(conn) == {"companies": 0, "jobs": 0, "job_skills": 0}, (
        "Lỗi giữa chừng thì KHÔNG bảng nào được giữ dữ liệu: đặt mọi lệnh trong `with conn:`"
    )


def test_load_jobs_commit(tmp_path):
    path = tmp_path / "t.db"
    c = sqlite3.connect(path)
    create_schema(c)
    load_jobs(c, CLEAN)
    c.close()  # đóng mà chưa commit thì mất dữ liệu
    c2 = sqlite3.connect(path)
    assert c2.execute("SELECT COUNT(*) FROM jobs").fetchone()[0] == 3, "Dữ liệu phải được commit (`with conn:` tự commit)"
    c2.close()


# ---------- count_rows ----------

def test_count_rows_bang_rong(conn):
    create_schema(conn)
    assert count_rows(conn) == {"companies": 0, "jobs": 0, "job_skills": 0}, (
        "count_rows trả dict đủ 3 khóa companies, jobs, job_skills"
    )
