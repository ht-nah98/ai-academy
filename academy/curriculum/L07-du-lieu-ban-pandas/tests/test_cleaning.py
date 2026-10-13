"""Test tự chấm cho bài L07. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì."""
from pathlib import Path

import pandas as pd
import pytest

from cleaning import COLUMNS, clean_jobs, normalize_city, parse_date, parse_salary, split_skills

# tests/ → L07-... → curriculum → academy
DATASET = Path(__file__).resolve().parents[3] / "datasets" / "jobs_raw.csv"


def raw_df(rows):
    cols = ["job_id", "title", "company", "city", "salary", "level", "skills", "posted_date", "source", "description"]
    return pd.DataFrame([dict(zip(cols, r)) for r in rows], columns=cols)


FIXTURE = [
    ("J1", "Data Engineer", "Lotus AI", "HCM", "15-25 triệu", "Junior", "Python, SQL", "2026-09-01", "topcv", "a"),
    ("J2", "  data  engineer ", "LOTUS AI", "TP.HCM", "15-25 triệu", "junior", "python;sql", "01/09/2026", "itviec", "b"),
    ("J3", "AI Engineer Intern", "Công ty TNHH Lotus AI", "Ha Noi", "Thỏa thuận", "Thực tập sinh", "", "05-08-2026", "topcv", "c"),
    ("J1", "Data Engineer", "Lotus AI", "HCM", "15-25 triệu", "Junior", "Python, SQL", "2026-09-01", "topcv", "a"),
    ("J4", "", "Sao Mai Tech", "HN", "10 triệu", "Fresher", "Go", "2026-07-01", "linkedin", "d"),
    (None, "QA Engineer", "Sao Mai Tech", "HN", "10 triệu", "Fresher", "Java", "2026-07-01", "linkedin", "e"),
    ("J5", "Data Engineer", "Sao Mai  Tech ", "Đà Nẵng", "$1000-1500", None, "Spark", "31/02/2026", "topcv", "f"),
]


# ---------- normalize_city ----------

def test_normalize_city_bien_the():
    cases = {"HCM": "Hồ Chí Minh", "hcm ": "Hồ Chí Minh", "TP.HCM": "Hồ Chí Minh", "TP HCM": "Hồ Chí Minh",
             "tp. hồ chí minh": "Hồ Chí Minh", "Thành phố Hồ Chí Minh": "Hồ Chí Minh",
             " Hà Nội": "Hà Nội", "hanoi": "Hà Nội", "Da Nang": "Đà Nẵng"}
    for raw, want in cases.items():
        assert normalize_city(raw) == want, (
            f"normalize_city({raw!r}) phải ra {want!r}. Nhớ: bỏ khoảng trắng thừa, .lower(), bỏ tiền tố 'tp.'/'thành phố '"
        )


def test_normalize_city_khoang_trang_giua():
    assert normalize_city("  Hồ   Chí  Minh ") == "Hồ Chí Minh", (
        "Khoảng trắng thừa ở GIỮA cũng phải bỏ: ' '.join(s.split())"
    )


def test_normalize_city_rong_va_la():
    for raw in [None, float("nan"), "", "   ", "N/A", "Mars"]:
        assert normalize_city(raw) is None, f"normalize_city({raw!r}) phải trả về None (rỗng hoặc không có trong bảng)"


# ---------- parse_salary ----------

def test_parse_salary_khoang_trieu():
    assert parse_salary("15-25 triệu") == (15.0, 25.0), "'15-25 triệu' → (15.0, 25.0)"
    assert parse_salary("15 - 25 triệu") == (15.0, 25.0), "Có dấu cách quanh '-' vẫn phải đọc được"
    assert parse_salary("12-18tr") == (12.0, 18.0), "'tr' cũng là triệu"


def test_parse_salary_mot_so():
    assert parse_salary("20 triệu") == (20.0, 20.0), "Chỉ 1 số → (số, số)"


def test_parse_salary_usd():
    assert parse_salary("$1000-1500") == (25.0, 37.5), "USD × 25.000 / 1.000.000: $1000 → 25.0 triệu"
    assert parse_salary("$1,200 - $2,000") == (30.0, 50.0), "Bỏ dấu phẩy ngăn nghìn trước khi lấy số"
    assert parse_salary("800-1000 USD") == (20.0, 25.0), "Chữ 'usd' (không phân biệt hoa thường) cũng là USD"


def test_parse_salary_ty_gia_khac():
    assert parse_salary("$1000", usd_rate=20_000) == (20.0, 20.0), "Phải dùng tham số usd_rate, không gán cứng 25000"


def test_parse_salary_upto_va_tu():
    assert parse_salary("upto 30tr") == (None, 30.0), "'upto' → chỉ có mức tối đa: (None, 30.0)"
    assert parse_salary("Up to 30 triệu") == (None, 30.0), "Nhớ .lower() trước khi tìm 'up to'"
    assert parse_salary("Từ 15 triệu") == (15.0, None), "'từ' → chỉ có mức tối thiểu: (15.0, None)"
    assert parse_salary("15tr+") == (15.0, None), "Kết thúc bằng '+' → (15.0, None)"


def test_parse_salary_thoa_thuan_va_rong():
    for raw in ["Thỏa thuận", "Thoả thuận", "NEGOTIABLE", "Cạnh tranh", "", None, float("nan"), "liên hệ"]:
        assert parse_salary(raw) == (None, None), f"parse_salary({raw!r}) phải ra (None, None)"


# ---------- parse_date ----------

def test_parse_date_cac_dinh_dang():
    for raw in ["2026-09-15", "15/09/2026", "15-09-2026", "2026/09/15", " 15/09/2026 "]:
        assert parse_date(raw) == "2026-09-15", f"parse_date({raw!r}) phải ra '2026-09-15' (thử lần lượt từng định dạng)"


def test_parse_date_sai():
    for raw in ["31/02/2026", "hôm qua", "", None, float("nan")]:
        assert parse_date(raw) is None, f"parse_date({raw!r}) phải trả về None, không được báo lỗi"


# ---------- split_skills ----------

def test_split_skills_tach_va_chuan_hoa():
    assert split_skills(" Python, SQL;python ;") == ["python", "sql"], (
        "Tách theo cả ',' và ';', strip + lower, bỏ rỗng, bỏ trùng giữ thứ tự đầu"
    )
    assert split_skills("Docker ; AWS,Kafka") == ["docker", "aws", "kafka"]


def test_split_skills_rong():
    for raw in ["", None, float("nan"), " ; , "]:
        assert split_skills(raw) == [], f"split_skills({raw!r}) phải ra list rỗng []"


# ---------- clean_jobs ----------

def test_clean_jobs_cot_va_khong_sua_dau_vao():
    df = raw_df(FIXTURE)
    before = df.copy()
    out = clean_jobs(df)
    assert list(out.columns) == COLUMNS, f"Cột kết quả phải đúng COLUMNS theo thứ tự: {COLUMNS}"
    pd.testing.assert_frame_equal(df, before, obj="DataFrame đầu vào (không được sửa — hãy dùng df.copy())")
    assert list(out.index) == list(range(len(out))), "Nhớ reset_index(drop=True) để index chạy 0, 1, 2…"


def test_clean_jobs_bo_dong_thieu_va_trung():
    out = clean_jobs(raw_df(FIXTURE))
    assert list(out["job_id"]) == ["J1", "J3", "J5"], (
        "Phải bỏ: dòng thiếu title (J4), thiếu job_id, trùng job_id (J1 lần 2) "
        "và trùng gần đúng (J2 = J1 sau khi chuẩn hóa title/company/city). Giữ dòng xuất hiện đầu."
    )


def test_clean_jobs_gia_tri_chuan_hoa():
    out = clean_jobs(raw_df(FIXTURE)).set_index("job_id")
    assert out.loc["J3", "company"] == "Lotus AI", "Bỏ tiền tố 'Công ty TNHH ' rồi thống nhất cách viết phổ biến nhất"
    assert out.loc["J5", "company"] == "Sao Mai Tech", "Bỏ khoảng trắng thừa trong tên công ty"
    assert out.loc["J3", "city"] == "Hà Nội" and out.loc["J5", "city"] == "Đà Nẵng", "city phải qua normalize_city"
    assert out.loc["J3", "level"] == "intern", "level: chữ thường + LEVEL_ALIASES ('thực tập sinh' → 'intern')"
    assert pd.isna(out.loc["J5", "level"]), "level rỗng → None/NaN"
    assert (out.loc["J5", "salary_min"], out.loc["J5", "salary_max"]) == (25.0, 37.5), "salary_min/max lấy từ parse_salary"
    assert pd.isna(out.loc["J3", "salary_min"]), "Thỏa thuận → salary_min trống"
    assert out.loc["J1", "posted_date"] == "2026-09-01" and out.loc["J3", "posted_date"] == "2026-08-05"
    assert pd.isna(out.loc["J5", "posted_date"]), "31/02/2026 không tồn tại → trống"
    assert out.loc["J1", "skills"] == ["python", "sql"] and out.loc["J3", "skills"] == [], "skills là list từ split_skills"


def test_clean_jobs_company_pho_bien_nhat():
    rows = [(f"K{i}", f"Role {i}", name, "HN", "", "", "", "", "topcv", "")
            for i, name in enumerate(["VietData", "VietData", "VIETDATA", "Cty vietdata"])]
    out = clean_jobs(raw_df(rows))
    assert set(out["company"]) == {"VietData"}, (
        "Các tên giống nhau khi .lower() phải thống nhất về cách viết xuất hiện nhiều nhất ('VietData')"
    )


@pytest.mark.skipif(not DATASET.exists(), reason="không tìm thấy datasets/jobs_raw.csv")
def test_clean_jobs_du_lieu_that():
    raw = pd.read_csv(DATASET)
    out = clean_jobs(raw)
    assert len(out) == 268, f"Bộ dữ liệu thật sau khi làm sạch phải còn 268 tin (bạn có {len(out)})"
    assert out["job_id"].is_unique, "job_id phải duy nhất sau khi khử trùng"
    valid = {"Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ", "Hải Phòng"}
    assert set(out["city"].dropna()) <= valid, "Mọi city phải là 1 trong 5 tên chuẩn (hoặc trống)"
    assert out["company"].nunique() == 30, "Sau khi thống nhất cách viết phải còn đúng 30 công ty"
    assert set(out["level"].dropna()) == {"intern", "fresher", "junior", "middle", "senior"}
    assert out["salary_max"].notna().sum() == 179, "Có đúng 179 tin đọc được mức lương tối đa — kiểm tra lại parse_salary"
