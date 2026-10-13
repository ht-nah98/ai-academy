"""JobRadar — Bài L10: ETL lặp lại được & chất lượng dữ liệu.

Ghép L07 + L08 thành MỘT pipeline:  CSV thô → làm sạch → kiểm tra chất lượng → nạp SQLite,
chạy lại bao nhiêu lần cũng ra cùng kết quả.

TRƯỚC KHI LÀM (Bước 1 trong bài): copy 2 file của bạn vào thư mục này
    workspace/L07-du-lieu-ban-pandas/cleaning.py  → workspace/L10-etl-chat-luong-du-lieu/cleaning.py
    workspace/L08-mo-hinh-hoa-sqlite/db.py        → workspace/L10-etl-chat-luong-du-lieu/db.py

Chạy thử:   python pipeline.py      → tạo jobradar.db cạnh file này; chạy 2 lần để thấy idempotent
Chạy test:  bấm "Chạy test" trên web app
"""
import logging
import sqlite3
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE.parents[1] / "datasets" / "jobs_raw.csv"  # workspace/L10-... → academy/datasets
DB_PATH = HERE / "jobradar.db"

log = logging.getLogger("jobradar.pipeline")

AS_OF = "2026-10-13"            # "hôm nay" cố định để kết quả lặp lại được
SALARY_RANGE = (1, 200)         # lương hợp lệ (triệu VND/tháng), tính cả hai đầu
BLOCKING_CHECKS = {"row_count", "job_id_duplicate"}  # lỗi cả lô → dừng pipeline

JOB_COLUMNS = ["job_id", "title", "company_id", "city", "level", "salary_min", "salary_max",
               "posted_date", "source", "description"]


class DataQualityError(Exception):
    """Ném ra khi dữ liệu không đạt chất lượng — pipeline dừng, KHÔNG ghi gì vào DB."""


def quality_checks(df, as_of=AS_OF, min_rows=1):
    """Kiểm tra DataFrame SẠCH (đầu ra clean_jobs), trả về list các lỗi dạng (tên_kiểm_tra, job_id).

    Không có lỗi → []. Không sửa df. Các kiểm tra (đúng tên):
    - "row_count"           : số dòng < min_rows                    → ("row_count", None)
    - "job_id_duplicate"    : job_id xuất hiện > 1 lần               → mỗi job_id trùng MỘT lần
    - "title_null"          : title trống
    - "company_null"        : company trống
    - "salary_min_gt_max"   : có cả min và max, và min > max
    - "salary_out_of_range" : min hoặc max (cái nào có) nằm ngoài SALARY_RANGE
    - "date_in_future"      : posted_date > as_of (so sánh chuỗi "YYYY-MM-DD" được luôn)
    Một dòng có thể dính nhiều lỗi. Thứ tự các phần tử trong list không quan trọng.
    """
    # TODO: issues = []; kiểm tra len(df) trước
    # TODO: trùng: df.loc[df["job_id"].duplicated(), "job_id"].unique()
    # TODO: duyệt df.to_dict("records"), dùng pd.isna / pd.notna cho ô trống
    raise NotImplementedError("TODO: viết quality_checks")


def split_rejects(df, issues):
    """Tách df thành (hợp_lệ, bị_loại).

    - Dòng bị loại: job_id có trong issues với tên kiểm tra KHÔNG thuộc BLOCKING_CHECKS.
    - hợp_lệ: DataFrame các dòng còn lại, index đánh lại từ 0.
    - bị_loại: list tuple (job_id, lý_do), lý_do = các tên kiểm tra của dòng đó, sắp A→Z,
      nối bằng ", ". Thứ tự list theo thứ tự dòng trong df.
    Ví dụ: [("J7", "company_null, salary_out_of_range")]
    """
    # TODO: gom lý do theo job_id: dict job_id → set tên kiểm tra (bỏ BLOCKING_CHECKS)
    # TODO: mask = df["job_id"].isin(...)
    raise NotImplementedError("TODO: viết split_rejects")


def upsert_jobs(conn, df):
    """Nạp df vào DB theo kiểu IDEMPOTENT, trả về số tin đã nạp/cập nhật (= len(df)).

    - Tất cả trong MỘT transaction (`with conn:`).
    - jobs: INSERT ... ON CONFLICT(job_id) DO UPDATE SET <mọi cột còn lại> = excluded.<cột>
      → tin mới thì thêm, tin cũ thì cập nhật, không bao giờ trùng.
    - job_skills của mỗi tin: DELETE hết kỹ năng cũ của tin đó rồi INSERT lại (delete-insert).
    - company_id: get_or_create_company từ db.py của bạn (L08).
    Chạy 2 lần với cùng df → DB y hệt như chạy 1 lần.
    """
    # TODO: from db import get_or_create_company, to_db   (db.py bạn copy từ L08)
    # TODO: INSERT INTO jobs (...) VALUES (...) ON CONFLICT(job_id) DO UPDATE SET title = excluded.title, ...
    # TODO: mỗi tin: DELETE FROM job_skills WHERE job_id = ? rồi INSERT lại
    raise NotImplementedError("TODO: viết upsert_jobs")


def run_pipeline(csv_path, db_path, as_of=AS_OF, min_rows=1, max_reject_ratio=0.1):
    """Extract → Transform → Quality → Load. Trả về dict tóm tắt:
        {"raw": số_dòng_thô, "clean": số_dòng_sau_clean_jobs, "rejected": số_dòng_bị_loại, "loaded": số_tin_nạp}

    1. Extract: pd.read_csv(csv_path).            log.info số dòng thô.
    2. Transform: clean_jobs (cleaning.py của bạn). log.info số dòng sạch.
    3. Quality: quality_checks(clean, as_of, min_rows).
       - Có lỗi thuộc BLOCKING_CHECKS → raise DataQualityError (chưa đụng tới DB).
       - split_rejects; tỷ lệ bị loại / số dòng sạch > max_reject_ratio → raise DataQualityError.
       - Mỗi dòng bị loại: log.warning có job_id và lý do.
    4. Load: sqlite3.connect(db_path), create_schema (db.py của bạn), upsert_jobs, đóng kết nối.
       log.info số tin đã nạp.
    """
    # TODO: from cleaning import clean_jobs; from db import create_schema   (Bước 1)
    # TODO: extract → transform → quality (raise DataQualityError) → load; log.info / log.warning ở mỗi bước
    raise NotImplementedError("TODO: viết run_pipeline")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(run_pipeline(DATA_PATH, DB_PATH))
