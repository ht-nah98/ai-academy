"""JobRadar — Bài L09: SQL phân tích.

8 hàm, mỗi hàm chạy MỘT câu SQL trên kết nối `conn` và trả về conn.execute(...).fetchall()
(list các tuple). Schema giống L08: companies, jobs, job_skills.

Chạy thử:   python queries.py   → chạy trên jobradar.db bạn tạo ở L08
Chạy test:  bấm "Chạy test" (test dùng DB nhỏ trong RAM, biết trước đáp án)
Mẹo: thử từng câu SQL trong SQLite Viewer/DB Browser trước, chạy đúng rồi mới dán vào hàm.
"""
import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "L08-mo-hinh-hoa-sqlite" / "jobradar.db"  # file bạn tạo ở L08


def jobs_by_city(conn):
    """Số tin theo thành phố → [(city, số_tin)].

    Bỏ tin không có city. Sắp xếp: số tin GIẢM dần, bằng nhau thì city A→Z.
    """
    # TODO: SELECT city, COUNT(*) AS n FROM jobs WHERE ... GROUP BY ... ORDER BY ...
    raise NotImplementedError("TODO: viết jobs_by_city")


def avg_salary_by_level(conn):
    """Lương trung bình theo cấp bậc → [(level, lương_TB)].

    Lương mỗi tin = (salary_min + salary_max) / 2, CHỈ tính tin có đủ cả min và max và có level.
    Làm tròn 1 chữ số (ROUND(x, 1)). Sắp xếp lương_TB GIẢM dần.
    """
    # TODO: AVG((salary_min + salary_max) / 2) bọc trong ROUND(..., 1)
    raise NotImplementedError("TODO: viết avg_salary_by_level")


def top_skills(conn, n=5):
    """n kỹ năng có nhiều tin nhất → [(skill, số_tin)].

    Sắp xếp số tin GIẢM dần, bằng nhau thì skill A→Z. Dùng LIMIT ? với tham số n.
    """
    # TODO: GROUP BY skill ... LIMIT ?  — truyền (n,)
    raise NotImplementedError("TODO: viết top_skills")


def companies_with_min_jobs(conn, k):
    """Công ty có ÍT NHẤT k tin → [(tên_công_ty, số_tin)].

    Cần JOIN jobs với companies, GROUP BY rồi lọc bằng HAVING. Sắp xếp số tin GIẢM dần, rồi tên A→Z.
    """
    # TODO: JOIN companies c ON c.company_id = j.company_id ... HAVING COUNT(*) >= ?
    raise NotImplementedError("TODO: viết companies_with_min_jobs")


def jobs_with_skill(conn, skill):
    """Các tin cần kỹ năng `skill` → [(job_id, title, tên_công_ty)], sắp xếp theo job_id.

    Kỹ năng trong DB là chữ thường; `skill` truyền vào có thể viết hoa → .lower() trước.
    JOIN cả 3 bảng. Bắt buộc dùng tham số ?, không ghép chuỗi.
    """
    # TODO: FROM job_skills s JOIN jobs j ON ... JOIN companies c ON ... WHERE s.skill = ?
    raise NotImplementedError("TODO: viết jobs_with_skill")


def top_skill_per_city(conn):
    """Kỹ năng được cần nhiều nhất ở MỖI thành phố → [(city, skill, số_tin)], sắp xếp theo city.

    Mỗi city đúng 1 dòng: bằng nhau thì lấy skill A→Z. Bỏ tin không có city.
    Gợi ý: đếm (city, skill) trong WITH ..., rồi ROW_NUMBER() OVER (PARTITION BY city ORDER BY ...).
    """
    # TODO: WITH counts AS (...), ranked AS (... ROW_NUMBER() OVER (...) AS rn ...) SELECT ... WHERE rn = 1
    raise NotImplementedError("TODO: viết top_skill_per_city")


def top_paid_per_city(conn, k=2):
    """Các tin lương tối đa cao nhất trong từng thành phố → [(city, job_id, salary_max, hạng)].

    Hạng = RANK() OVER (PARTITION BY city ORDER BY salary_max DESC) — bằng lương thì CÙNG hạng.
    Giữ các dòng có hạng <= k. Bỏ tin thiếu city hoặc salary_max.
    Sắp xếp theo city, hạng, job_id.
    """
    # TODO: WITH ranked AS (SELECT ..., RANK() OVER (...) AS rnk FROM jobs WHERE ...) SELECT ... WHERE rnk <= ?
    raise NotImplementedError("TODO: viết top_paid_per_city")


def monthly_trend(conn):
    """Số tin theo tháng và trung bình trượt 3 tháng → [(tháng "YYYY-MM", số_tin, TB_trượt)].

    tháng = substr(posted_date, 1, 7); bỏ tin không có ngày.
    TB_trượt = trung bình số_tin của tháng này và TỐI ĐA 2 tháng trước đó,
    ROUND(..., 2): AVG(...) OVER (ORDER BY tháng ROWS BETWEEN 2 PRECEDING AND CURRENT ROW).
    Sắp xếp theo tháng tăng dần.
    """
    # TODO: WITH monthly AS (SELECT substr(posted_date, 1, 7) AS month, COUNT(*) AS n ...) SELECT month, n, ROUND(AVG(n) OVER (...), 2) ...
    raise NotImplementedError("TODO: viết monthly_trend")


if __name__ == "__main__":
    if not DB_PATH.exists():
        raise SystemExit(f"Chưa có {DB_PATH} — hãy chạy `python db.py` ở bài L08 trước.")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)  # chỉ đọc
    print("Theo thành phố:", jobs_by_city(conn))
    print("Lương TB theo cấp:", avg_salary_by_level(conn))
    print("Top kỹ năng:", top_skills(conn))
    print("Công ty ≥ 12 tin:", companies_with_min_jobs(conn, 12))
    print("Tin cần Airflow:", len(jobs_with_skill(conn, "Airflow")))
    print("Kỹ năng hot mỗi thành phố:", top_skill_per_city(conn))
    print("Lương cao nhất mỗi thành phố:", top_paid_per_city(conn, 1))
    print("Xu hướng theo tháng:", monthly_trend(conn))
    conn.close()
