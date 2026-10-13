"""Test tự chấm cho bài L09. Dùng một DB nhỏ trong RAM (10 tin) nên đáp án biết trước.

Muốn xem dữ liệu mẫu: đọc FIXTURE_SQL bên dưới, dán vào SQLite Viewer để thử câu truy vấn.
"""
import sqlite3

import pytest

from queries import (avg_salary_by_level, companies_with_min_jobs, jobs_by_city, jobs_with_skill,
                     monthly_trend, top_paid_per_city, top_skill_per_city, top_skills)

FIXTURE_SQL = """
CREATE TABLE companies (company_id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE jobs (job_id TEXT PRIMARY KEY, title TEXT NOT NULL, company_id INTEGER REFERENCES companies(company_id),
                   city TEXT, level TEXT, salary_min REAL, salary_max REAL, posted_date TEXT, source TEXT, description TEXT);
CREATE TABLE job_skills (job_id TEXT NOT NULL REFERENCES jobs(job_id), skill TEXT NOT NULL, PRIMARY KEY (job_id, skill));
INSERT INTO companies VALUES (1, 'Lotus AI'), (2, 'VietData'), (3, 'Mekong Soft');
INSERT INTO jobs (job_id, title, company_id, city, level, salary_min, salary_max, posted_date) VALUES
 ('J01', 'Data Engineer',        1, 'Hà Nội',      'junior',  15,   25,   '2026-07-03'),
 ('J02', 'AI Engineer Intern',   1, 'Hồ Chí Minh', 'intern',  5,    8,    '2026-07-15'),
 ('J03', 'Senior Data Engineer', 2, 'Hồ Chí Minh', 'senior',  40,   60,   '2026-08-01'),
 ('J04', 'Data Analyst',         2, 'Hồ Chí Minh', 'junior',  12,   18,   '2026-08-10'),
 ('J05', 'Backend Developer',    3, 'Hà Nội',      'middle',  25,   35,   '2026-08-20'),
 ('J06', 'Data Engineer Intern', 3, 'Đà Nẵng',     'intern',  NULL, 7,    '2026-09-02'),
 ('J07', 'ML Engineer',          1, 'Hồ Chí Minh', 'middle',  30,   40,   '2026-09-05'),
 ('J08', 'Fresher Data Analyst', 2, 'Hà Nội',      'fresher', 9,    13,   '2026-09-09'),
 ('J09', 'DevOps Engineer',      3, NULL,          'senior',  NULL, NULL, NULL),
 ('J10', 'Junior AI Engineer',   1, 'Hồ Chí Minh', 'junior',  20,   40,   '2026-10-01');
INSERT INTO job_skills VALUES
 ('J01','python'),('J01','sql'),('J01','airflow'), ('J02','python'),('J02','llm'),
 ('J03','python'),('J03','sql'),('J03','spark'), ('J04','sql'),('J04','excel'),
 ('J05','python'),('J05','docker'), ('J06','sql'),('J06','spark'), ('J07','python'),('J07','pytorch'),
 ('J08','sql'),('J08','excel'),('J08','power bi'), ('J09','docker'),('J09','kubernetes'),
 ('J10','python'),('J10','llm'),('J10','docker');
"""


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.executescript(FIXTURE_SQL)
    yield c
    c.close()


# ---------- 1. GROUP BY ----------

def test_jobs_by_city(conn):
    assert jobs_by_city(conn) == [("Hồ Chí Minh", 5), ("Hà Nội", 3), ("Đà Nẵng", 1)], (
        "GROUP BY city, bỏ city NULL (WHERE city IS NOT NULL), ORDER BY số tin DESC"
    )


def test_avg_salary_by_level(conn):
    assert avg_salary_by_level(conn) == [("senior", 50.0), ("middle", 32.5), ("junior", 21.7),
                                         ("fresher", 11.0), ("intern", 6.5)], (
        "Lương mỗi tin = (min + max) / 2, chỉ tin có đủ min và max; AVG rồi ROUND(…, 1); junior = (20+15+30)/3 = 21.7"
    )


def test_top_skills_mac_dinh(conn):
    assert top_skills(conn) == [("python", 6), ("sql", 5), ("docker", 3), ("excel", 2), ("llm", 2)], (
        "Đếm theo skill, ORDER BY số tin DESC rồi skill A→Z, LIMIT 5"
    )


def test_top_skills_tham_so_n(conn):
    assert top_skills(conn, 2) == [("python", 6), ("sql", 5)], "Dùng LIMIT ? với tham số n"


# ---------- 2. JOIN + HAVING ----------

def test_companies_with_min_jobs(conn):
    assert companies_with_min_jobs(conn, 3) == [("Lotus AI", 4), ("Mekong Soft", 3), ("VietData", 3)], (
        "JOIN companies để lấy tên; HAVING COUNT(*) >= ?; bằng số tin thì tên A→Z"
    )
    assert companies_with_min_jobs(conn, 4) == [("Lotus AI", 4)]
    assert companies_with_min_jobs(conn, 99) == []


def test_jobs_with_skill(conn):
    assert jobs_with_skill(conn, "Spark") == [("J03", "Senior Data Engineer", "VietData"),
                                             ("J06", "Data Engineer Intern", "Mekong Soft")], (
        "JOIN 3 bảng; kỹ năng trong DB là chữ thường nên .lower() tham số trước"
    )


def test_jobs_with_skill_chong_injection(conn):
    assert jobs_with_skill(conn, "x' OR '1'='1") == [], (
        "Chuỗi lạ phải trả về [] — nếu ra nhiều tin là bạn đang ghép chuỗi SQL. Dùng tham số ?"
    )


# ---------- 3. Window functions ----------

def test_top_skill_per_city(conn):
    assert top_skill_per_city(conn) == [("Hà Nội", "python", 2), ("Hồ Chí Minh", "python", 4),
                                        ("Đà Nẵng", "spark", 1)], (
        "Mỗi city 1 dòng: ROW_NUMBER() OVER (PARTITION BY city ORDER BY n DESC, skill); "
        "Hà Nội python = sql = 2 → lấy python (A→Z); Đà Nẵng spark = sql = 1 → spark"
    )


def test_top_paid_per_city_hang_bang_nhau(conn):
    assert top_paid_per_city(conn) == [
        ("Hà Nội", "J05", 35.0, 1), ("Hà Nội", "J01", 25.0, 2),
        ("Hồ Chí Minh", "J03", 60.0, 1), ("Hồ Chí Minh", "J07", 40.0, 2), ("Hồ Chí Minh", "J10", 40.0, 2),
        ("Đà Nẵng", "J06", 7.0, 1),
    ], "RANK() cho J07 và J10 CÙNG hạng 2 (cùng 40 triệu) — ROW_NUMBER thì không; sắp theo city, hạng, job_id"


def test_top_paid_per_city_k1(conn):
    assert top_paid_per_city(conn, 1) == [("Hà Nội", "J05", 35.0, 1), ("Hồ Chí Minh", "J03", 60.0, 1),
                                          ("Đà Nẵng", "J06", 7.0, 1)], "Lọc hạng <= k với tham số ?"


def test_monthly_trend(conn):
    assert monthly_trend(conn) == [("2026-07", 2, 2.0), ("2026-08", 3, 2.5),
                                   ("2026-09", 3, 2.67), ("2026-10", 1, 2.33)], (
        "Tháng = substr(posted_date, 1, 7), bỏ ngày NULL. TB trượt chỉ gồm 3 tháng gần nhất: "
        "tháng 10 = (3 + 3 + 1) / 3 = 2.33, KHÔNG phải trung bình từ đầu (2.25)"
    )
