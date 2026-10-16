"""JobRadar — Bài L07: Dữ liệu bẩn & pandas.

Bộ dữ liệu thô: academy/datasets/jobs_raw.csv (~300 tin, cột: job_id, title, company,
city, salary, level, skills, posted_date, source, description). Biến DATA_PATH bên dưới
tự tìm file đó từ vị trí của file này — không cần sửa.

Cần pandas:  pip install pandas   (trong venv của bạn)
Chạy thử:   python cleaning.py
Chạy test:  bấm "Chạy test" trên web app
"""
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

# workspace/L07-du-lieu-ban-pandas/cleaning.py → lên 2 cấp là thư mục academy/
DATA_PATH = Path(__file__).resolve().parents[2] / "datasets" / "jobs_raw.csv"

USD_RATE = 25_000  # 1 USD = 25.000 VND (tỷ giá cố định cho bài tập)

# Tên đã làm sạch (chữ thường, bỏ tiền tố "tp.") → tên chuẩn
CITY_ALIASES = {
    "hồ chí minh": "Hồ Chí Minh", "ho chi minh": "Hồ Chí Minh", "hcm": "Hồ Chí Minh",
    "sài gòn": "Hồ Chí Minh", "saigon": "Hồ Chí Minh",
    "hà nội": "Hà Nội", "ha noi": "Hà Nội", "hanoi": "Hà Nội", "hn": "Hà Nội",
    "đà nẵng": "Đà Nẵng", "da nang": "Đà Nẵng",
    "cần thơ": "Cần Thơ", "can tho": "Cần Thơ",
    "hải phòng": "Hải Phòng", "hai phong": "Hải Phòng",
}
CITY_PREFIXES = ["thành phố ", "tp. ", "tp.", "tp "]

LEVEL_ALIASES = {"thực tập sinh": "intern", "mới tốt nghiệp": "fresher", "mid": "middle"}
COMPANY_PREFIXES = ["công ty tnhh ", "công ty ", "cty "]
NEGOTIABLE_WORDS = ["thỏa thuận", "thoả thuận", "negotiable", "cạnh tranh"]
DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"]

COLUMNS = ["job_id", "title", "company", "city", "level", "salary_min", "salary_max",
           "posted_date", "skills", "source", "description"]


def is_blank(value):
    """True nếu value là None, NaN hoặc chuỗi chỉ toàn khoảng trắng. (Hàm có sẵn, dùng thoải mái.)"""
    if value is None:
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    return str(value).strip() == ""


def normalize_city(raw):
    """Chuẩn hóa tên thành phố về 1 trong 5 tên chuẩn của CITY_ALIASES.

    - Bỏ khoảng trắng thừa (đầu, cuối, giữa), chuyển chữ thường.
    - Bỏ tiền tố trong CITY_PREFIXES nếu có ("tp.hcm" → "hcm", "thành phố hà nội" → "hà nội").
    - Tra CITY_ALIASES. Không có trong bảng, hoặc rỗng/None/NaN → trả về None.

    Ví dụ: normalize_city(" TP.HCM ") → "Hồ Chí Minh";  normalize_city("Mars") → None
    """
    # TODO: is_blank, str.split/join, str.startswith, dict.get
    raise NotImplementedError("TODO: viết normalize_city")


def parse_salary(raw, usd_rate=USD_RATE):
    """Đọc lương dạng chữ → tuple (min, max) tính bằng TRIỆU VND/tháng (float, làm tròn 2 số).

    Quy tắc (xét chuỗi đã .lower()):
    - Rỗng/None/NaN, hoặc chứa một từ trong NEGOTIABLE_WORDS, hoặc không có số → (None, None)
    - Lấy các số bằng regex sau khi bỏ dấu phẩy: "$1,200" → 1200.
    - Có "$" hoặc "usd" → đổi ra triệu: số * usd_rate / 1_000_000.
    - Có "up to", "upto" hoặc "tới"      → (None, số_đầu)
    - Có "từ", "trên", "from" hoặc kết thúc bằng "+" → (số_đầu, None)
    - Có 2 số trở lên → (số_1, số_2);  đúng 1 số → (số, số)

    Ví dụ: "15-25 triệu" → (15.0, 25.0);  "$1000-1500" → (25.0, 37.5);  "upto 30tr" → (None, 30.0)
    """
    # TODO: re.findall; xét các quy tắc theo đúng thứ tự trên
    raise NotImplementedError("TODO: viết parse_salary")


def parse_date(raw):
    """Đọc ngày ở một trong các định dạng DATE_FORMATS → chuỗi "YYYY-MM-DD".

    Bỏ khoảng trắng hai đầu trước khi đọc.
    Không đọc được (rỗng/None/NaN, sai định dạng, ngày không tồn tại như 31/02) → None.
    Ví dụ: parse_date("15/09/2026") → "2026-09-15"
    """
    # TODO: datetime.strptime, try/except ValueError
    raise NotImplementedError("TODO: viết parse_date")


def split_skills(raw):
    """Tách chuỗi kỹ năng ngăn bởi dấu phẩy HOẶC chấm phẩy → list chữ thường.

    - Bỏ khoảng trắng hai đầu mỗi kỹ năng, bỏ phần tử rỗng.
    - Bỏ trùng nhưng GIỮ thứ tự xuất hiện đầu tiên.
    - Rỗng/None/NaN → [].
    Ví dụ: " Python, SQL;python ;" → ["python", "sql"]
    """
    # TODO: re.split, dict.fromkeys
    raise NotImplementedError("TODO: viết split_skills")


def clean_jobs(df):
    """Làm sạch DataFrame thô → DataFrame sạch có đúng các cột COLUMNS (đúng thứ tự).

    1. Không sửa df đầu vào (làm trên bản copy).
    2. Bỏ dòng thiếu job_id hoặc title (dùng is_blank).
    3. title: bỏ khoảng trắng thừa (" ".join(s.split())), giữ nguyên hoa thường.
    4. company: bỏ khoảng trắng thừa, bỏ tiền tố COMPANY_PREFIXES (không phân biệt hoa thường),
       rỗng → None. Các tên trùng nhau khi .lower() được thống nhất về cách viết
       xuất hiện NHIỀU NHẤT trong nhóm (gợi ý: groupby + .mode()[0]).
    5. city = normalize_city;  level = chữ thường + LEVEL_ALIASES, rỗng → None.
    6. salary → 2 cột salary_min, salary_max bằng parse_salary;  posted_date = parse_date;
       skills = split_skills (mỗi ô là một list).
    7. Khử trùng: trước theo job_id, sau theo bộ (title chữ thường, company chữ thường, city);
       giữ dòng xuất hiện ĐẦU TIÊN.
    8. Trả về chỉ các cột COLUMNS, index đánh lại từ 0 (reset_index(drop=True)).
    """
    # TODO: mask với is_blank, .apply, groupby().agg + .map, drop_duplicates
    raise NotImplementedError("TODO: viết clean_jobs")


if __name__ == "__main__":
    raw = pd.read_csv(DATA_PATH)
    print("Thô:", raw.shape)
    print(raw["city"].value_counts(dropna=False).head(8))
    clean = clean_jobs(raw)
    print("Sạch:", clean.shape)
    print(clean["city"].value_counts(dropna=False))
    print(clean.head(3).T)
