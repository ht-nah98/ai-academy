"""JobRadar — Bài L01: Python cơ bản qua dữ liệu tuyển dụng.

File này chứa một danh sách nhỏ tin tuyển dụng (JOBS) và 4 hàm bạn cần viết.
Mỗi tin là một dict (bảng tra key → value):

    {
        "title": "Data Engineer Intern",   # tên vị trí
        "company": "FPT Software",         # công ty
        "city": "Hà Nội",                  # thành phố
        "skills": ["Python", "SQL"],       # danh sách kỹ năng yêu cầu
        "salary": 8,                       # lương (triệu VND/tháng), None = "thỏa thuận"
    }

Chạy thử:   python jobs.py
Chạy test:  python -m pytest ../../curriculum/L01-python-co-ban/tests -q
            (hoặc bấm "Chạy test" trên web app)
"""

JOBS = [
    {"title": "Data Engineer Intern", "company": "FPT Software", "city": "Hà Nội",
     "skills": ["Python", "SQL", "Airflow"], "salary": 8},
    {"title": "AI Engineer Intern", "company": "VNG", "city": "Hồ Chí Minh",
     "skills": ["Python", "PyTorch", "LLM"], "salary": 10},
    {"title": "Backend Developer (Python)", "company": "Tiki", "city": "Hồ Chí Minh",
     "skills": ["Python", "FastAPI", "PostgreSQL"], "salary": None},
    {"title": "Data Analyst Fresher", "company": "MoMo", "city": "Hồ Chí Minh",
     "skills": ["SQL", "Excel", "Power BI"], "salary": 12},
    {"title": "Machine Learning Intern", "company": "Viettel AI", "city": "Hà Nội",
     "skills": ["Python", "scikit-learn", "SQL"], "salary": None},
    {"title": "Frontend Developer", "company": "Haravan", "city": "Hồ Chí Minh",
     "skills": ["TypeScript", "React", "CSS"], "salary": 15},
    {"title": "Data Engineer Fresher", "company": "Grab Vietnam", "city": "Hồ Chí Minh",
     "skills": ["python", "Spark", "SQL"], "salary": 18},
    {"title": "AI Engineer Intern", "company": "Zalo", "city": "Đà Nẵng",
     "skills": ["Python", "LLM", "Docker"], "salary": 9},
]


def filter_by_skill(jobs, skill):
    """Trả về list các tin có yêu cầu kỹ năng `skill`.

    - So sánh KHÔNG phân biệt hoa thường: "python" khớp với "Python".
    - Giữ nguyên thứ tự ban đầu của các tin.
    - Không được sửa list `jobs` đầu vào (trả về list mới).

    Ví dụ: filter_by_skill(JOBS, "llm") -> 2 tin (VNG, Zalo)
    """
    # TODO: tạo list rỗng, duyệt từng job, job đúng điều kiện thì append (hoặc dùng list comprehension)
    raise NotImplementedError("TODO: viết filter_by_skill")


def count_by_city(jobs):
    """Đếm số tin theo thành phố, trả về dict {thành_phố: số_tin}.

    Ví dụ: count_by_city(JOBS) -> {"Hà Nội": 2, "Hồ Chí Minh": 5, "Đà Nẵng": 1}
    List rỗng -> {} (dict rỗng).
    """
    # TODO: tạo dict rỗng, duyệt từng job, tăng bộ đếm. Gợi ý: counts.get(city, 0)
    raise NotImplementedError("TODO: viết count_by_city")


def average_salary(jobs):
    """Lương trung bình (triệu VND), BỎ QUA các tin có salary là None.

    - Làm tròn 1 chữ số thập phân: round(x, 1).
    - Nếu không có tin nào có lương (hoặc list rỗng) -> trả về None,
      KHÔNG được chia cho 0.

    Ví dụ: average_salary(JOBS) -> 12.0   (8+10+12+15+18+9 = 72, chia 6)
    """
    # TODO: lọc ra các lương khác None trước, rồi mới tính sum(...) / len(...)
    raise NotImplementedError("TODO: viết average_salary")


def top_skills(jobs, n=3):
    """Trả về n kỹ năng xuất hiện nhiều nhất, dạng list các tuple (kỹ_năng, số_lần).

    - Gộp không phân biệt hoa thường và trả tên kỹ năng ở dạng chữ thường:
      "Python" và "python" đều tính là "python".
    - Sắp xếp: số lần GIẢM dần; nếu bằng nhau thì theo tên kỹ năng A→Z.
    - n mặc định là 3.

    Ví dụ: top_skills(JOBS, 2) -> [("python", 6), ("sql", 4)]
    Gợi ý: sorted(items, key=lambda kv: (-kv[1], kv[0]))
    """
    # TODO: đếm bằng dict giống count_by_city, rồi sắp xếp và cắt [:n]
    #       (lambda kv: ... = một hàm def không tên, xem lesson Bước 6)
    raise NotImplementedError("TODO: viết top_skills")


if __name__ == "__main__":
    # Khối này chỉ chạy khi bạn gõ `python jobs.py`, KHÔNG chạy khi file bị import.
    print("Tin cần Python:", len(filter_by_skill(JOBS, "python")))
    print("Theo thành phố:", count_by_city(JOBS))
    print("Lương TB:", average_salary(JOBS), "triệu")
    print("Top kỹ năng:", top_skills(JOBS))
