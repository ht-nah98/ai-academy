"""Test tự chấm cho bài L01. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì."""
import copy

from jobs import JOBS, average_salary, count_by_city, filter_by_skill, top_skills

SAMPLE = [
    {"title": "A", "company": "X", "city": "Hà Nội", "skills": ["Python", "SQL"], "salary": 10},
    {"title": "B", "company": "Y", "city": "Hồ Chí Minh", "skills": ["Go"], "salary": None},
    {"title": "C", "company": "Z", "city": "Hà Nội", "skills": ["python"], "salary": 15},
]


# ---------- filter_by_skill ----------

def test_filter_tra_ve_list_dung_tin():
    result = filter_by_skill(SAMPLE, "SQL")
    assert isinstance(result, list), "filter_by_skill phải trả về một list (dùng [... for ... in ...])"
    assert [j["title"] for j in result] == ["A"], "Chỉ tin 'A' có kỹ năng SQL"


def test_filter_khong_phan_biet_hoa_thuong():
    result = filter_by_skill(SAMPLE, "PYTHON")
    assert [j["title"] for j in result] == ["A", "C"], (
        "So sánh phải không phân biệt hoa thường: thử .lower() cho cả hai vế"
    )


def test_filter_khong_sua_dau_vao():
    before = copy.deepcopy(SAMPLE)
    filter_by_skill(SAMPLE, "python")
    assert SAMPLE == before, "Không được sửa list đầu vào — hãy tạo list mới"


def test_filter_khong_co_ket_qua():
    assert filter_by_skill(SAMPLE, "Rust") == [], "Không tin nào khớp thì trả về list rỗng []"


def test_filter_tren_du_lieu_that():
    companies = [j["company"] for j in filter_by_skill(JOBS, "llm")]
    assert companies == ["VNG", "Zalo"], "Trong JOBS có đúng 2 tin cần LLM: VNG và Zalo (giữ thứ tự)"


# ---------- count_by_city ----------

def test_count_by_city():
    assert count_by_city(SAMPLE) == {"Hà Nội": 2, "Hồ Chí Minh": 1}, (
        "Kết quả phải là dict {thành_phố: số_tin}. Gợi ý: counts[city] = counts.get(city, 0) + 1"
    )


def test_count_by_city_rong():
    assert count_by_city([]) == {}, "List rỗng thì trả về dict rỗng {}"


def test_count_by_city_du_lieu_that():
    assert count_by_city(JOBS) == {"Hà Nội": 2, "Hồ Chí Minh": 5, "Đà Nẵng": 1}


# ---------- average_salary ----------

def test_average_bo_qua_none():
    assert average_salary(SAMPLE) == 12.5, (
        "Phải bỏ qua tin có salary None: (10 + 15) / 2 = 12.5. "
        "Nếu bạn gặp TypeError với None — hãy lọc None trước khi cộng"
    )


def test_average_lam_tron_1_chu_so():
    jobs = [{"salary": 10}, {"salary": 10}, {"salary": 11}]
    assert average_salary(jobs) == 10.3, "Nhớ làm tròn 1 chữ số thập phân: round(x, 1)"


def test_average_khong_co_luong_tra_none():
    assert average_salary([]) is None, "List rỗng: trả về None, đừng chia cho 0 (ZeroDivisionError)"
    assert average_salary([{"salary": None}]) is None, "Không có lương nào: trả về None"


def test_average_du_lieu_that():
    assert average_salary(JOBS) == 12.0, "JOBS: (8+10+12+15+18+9)/6 = 12.0"


# ---------- top_skills ----------

def test_top_skills_mac_dinh_3():
    result = top_skills(JOBS)
    assert isinstance(result, list) and len(result) == 3, "n mặc định là 3 → trả về list 3 phần tử"
    assert all(isinstance(x, tuple) for x in result), "Mỗi phần tử là tuple (kỹ_năng, số_lần)"


def test_top_skills_gop_hoa_thuong_va_sap_xep():
    assert top_skills(JOBS, 2) == [("python", 6), ("sql", 4)], (
        "'Python' và 'python' phải gộp làm một (dùng .lower()), sắp xếp số lần giảm dần"
    )


def test_top_skills_bang_nhau_xep_theo_ten():
    jobs = [{"skills": ["b", "a"]}, {"skills": ["c"]}]
    assert top_skills(jobs, 3) == [("a", 1), ("b", 1), ("c", 1)], (
        "Khi số lần bằng nhau, xếp theo tên A→Z. Gợi ý: key=lambda kv: (-kv[1], kv[0])"
    )
