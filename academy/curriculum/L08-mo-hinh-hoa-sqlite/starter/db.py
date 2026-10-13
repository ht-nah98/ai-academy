"""JobRadar — Bài L08: Mô hình hóa & nạp SQLite.

Đầu vào: DataFrame SẠCH từ L07 (cột: job_id, title, company, city, level, salary_min,
salary_max, posted_date, skills, source, description; mỗi ô skills là một list).
Đầu ra: file SQLite 3 bảng: companies, jobs, job_skills.

sqlite3 có sẵn trong Python, không cần cài. pandas: pip install pandas (đã cài ở L07).
Chạy thử:   python db.py      → dùng clean_jobs của bạn ở L07, tạo jobradar.db cạnh file này
Chạy test:  bấm "Chạy test" trên web app
"""
import sqlite3
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ACADEMY = HERE.parents[1]                          # workspace/L08-... → academy/
DATA_PATH = ACADEMY / "datasets" / "jobs_raw.csv"
L07_DIR = ACADEMY / "workspace" / "L07-du-lieu-ban-pandas"
DB_PATH = HERE / "jobradar.db"

JOB_COLUMNS = ["job_id", "title", "company_id", "city", "level", "salary_min", "salary_max",
               "posted_date", "source", "description"]


def to_db(value):
    """Đổi NaN/None của pandas thành None (SQLite hiểu là NULL). (Hàm có sẵn, dùng thoải mái.)"""
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    return value


def create_schema(conn):
    """Tạo 3 bảng (dùng CREATE TABLE IF NOT EXISTS để gọi nhiều lần không lỗi).

    companies(company_id INTEGER khóa chính, name TEXT NOT NULL UNIQUE)
    jobs(job_id TEXT khóa chính, title TEXT NOT NULL,
         company_id INTEGER khóa ngoại → companies(company_id),
         city TEXT, level TEXT, salary_min REAL, salary_max REAL,
         posted_date TEXT, source TEXT, description TEXT)
    job_skills(job_id TEXT NOT NULL khóa ngoại → jobs(job_id), skill TEXT NOT NULL,
               khóa chính GHÉP (job_id, skill))

    Đồng thời bật kiểm tra khóa ngoại: PRAGMA foreign_keys = ON.
    Gợi ý: conn.executescript(chuỗi_nhiều_lệnh_SQL).
    """
    # TODO: conn.executescript(""" PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS ... ; ... """)
    raise NotImplementedError("TODO: viết create_schema")


def get_or_create_company(conn, name):
    """Trả về company_id của công ty `name`; chưa có thì thêm mới rồi trả id mới.

    - name trống (None/NaN) → trả về None, không thêm gì.
    - Gọi 2 lần cùng tên → cùng một id, bảng companies không bị trùng.
    - Luôn dùng tham số `?`, KHÔNG ghép chuỗi SQL bằng f-string.
    """
    # TODO: to_db(name) is None → None
    # TODO: SELECT company_id ... WHERE name = ?  → có thì trả về
    # TODO: chưa có: cur = conn.execute("INSERT ...", (name,)); return cur.lastrowid
    raise NotImplementedError("TODO: viết get_or_create_company")


def load_jobs(conn, df):
    """Nạp DataFrame sạch vào 3 bảng, trả về số tin đã nạp vào bảng jobs.

    - Mọi thao tác nằm trong MỘT transaction: `with conn:` — lỗi ở bất kỳ dòng nào
      thì không bảng nào bị thay đổi (rollback), và lỗi được ném ra ngoài.
    - Mỗi tin: lấy company_id bằng get_or_create_company, rồi thêm 1 dòng vào jobs
      (theo thứ tự JOB_COLUMNS, giá trị đi qua to_db).
    - Mỗi kỹ năng trong list skills → 1 dòng (job_id, skill) trong job_skills.
    - Dùng conn.executemany cho jobs và job_skills (nhanh hơn gọi execute từng dòng).
    """
    # TODO: with conn:  (mọi thứ bên trong khối này)
    # TODO: duyệt df.to_dict("records"), gom list tuple cho jobs và job_skills
    # TODO: conn.executemany("INSERT INTO jobs (...) VALUES (?, ?, ...)", job_rows)
    raise NotImplementedError("TODO: viết load_jobs")


def count_rows(conn):
    """Đếm số dòng mỗi bảng → {"companies": n, "jobs": n, "job_skills": n}."""
    # TODO: SELECT COUNT(*) FROM <bảng> cho từng bảng; .fetchone()[0]
    raise NotImplementedError("TODO: viết count_rows")


if __name__ == "__main__":
    sys.path.insert(0, str(L07_DIR))
    from cleaning import clean_jobs  # hàm bạn viết ở L07

    clean = clean_jobs(pd.read_csv(DATA_PATH))
    DB_PATH.unlink(missing_ok=True)  # chạy lại từ đầu mỗi lần (L10 sẽ làm cách tốt hơn)
    conn = sqlite3.connect(DB_PATH)
    create_schema(conn)
    print("Đã nạp", load_jobs(conn, clean), "tin")
    print(count_rows(conn))
    conn.close()
