"""Sinh bộ dữ liệu JobRadar: ~300 tin tuyển dụng IT (giả lập) có lỗi như dữ liệu thật.

Chạy:  python make_jobs.py        → ghi jobs_raw.csv cạnh file này.
Chỉ dùng thư viện chuẩn; seed cố định nên chạy lại luôn ra đúng cùng một file.
Tên công ty là hư cấu.
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 2026
OUT = Path(__file__).resolve().parent / "jobs_raw.csv"
USD_RATE = 25_000  # VND / USD dùng khi quy đổi lương ghi bằng USD

COMPANIES = [
    "Lotus AI", "Sao Mai Tech", "VietData", "Mekong Soft", "Hanoi Analytics",
    "Saigon Fintech", "Bamboo Cloud", "Red River Labs", "Cửu Long Software", "Phượng Hoàng Games",
    "TopShop Vietnam", "PayNow", "MediCare Tech", "EduViet", "LogiFast",
    "GreenGrid Energy", "Trúc Xanh Bank", "Sky Mobile", "Orchid Studio", "Hải Âu Solutions",
    "NovaHR", "Kite Robotics", "Mây Trắng Data", "Hùng Vương Tech", "SmartFarm VN",
    "TravelGo", "CodeCraft Vietnam", "BlueWhale Analytics", "Ánh Dương Media", "Sen Vàng Insurance",
]

ROLES = {
    "Data Engineer": ["Python", "SQL", "Airflow", "Spark", "dbt", "Kafka", "AWS", "Docker"],
    "AI Engineer": ["Python", "PyTorch", "LLM", "RAG", "Docker", "FastAPI", "LangChain"],
    "Machine Learning Engineer": ["Python", "scikit-learn", "PyTorch", "SQL", "MLflow", "Docker"],
    "Data Analyst": ["SQL", "Excel", "Power BI", "Python", "Tableau", "Statistics"],
    "Data Scientist": ["Python", "SQL", "scikit-learn", "Statistics", "pandas", "TensorFlow"],
    "Backend Developer (Python)": ["Python", "FastAPI", "Django", "PostgreSQL", "Redis", "Docker"],
    "Backend Developer (Java)": ["Java", "Spring Boot", "MySQL", "Kafka", "Docker", "Microservices"],
    "Frontend Developer": ["JavaScript", "TypeScript", "React", "CSS", "Next.js"],
    "Fullstack Developer": ["JavaScript", "React", "Node.js", "PostgreSQL", "Docker", "TypeScript"],
    "DevOps Engineer": ["Docker", "Kubernetes", "AWS", "Terraform", "Linux", "CI/CD"],
    "QA Automation Engineer": ["Python", "Selenium", "Java", "API Testing", "CI/CD"],
    "Mobile Developer (Flutter)": ["Flutter", "Dart", "Firebase", "REST API"],
    "BI Developer": ["SQL", "Power BI", "SSIS", "Excel", "Data Warehouse"],
    "MLOps Engineer": ["Python", "Kubernetes", "MLflow", "Docker", "AWS", "Airflow"],
    "Golang Developer": ["Go", "PostgreSQL", "gRPC", "Docker", "Redis"],
}

LEVELS = ["Intern", "Fresher", "Junior", "Middle", "Senior"]
LEVEL_WEIGHTS = [18, 17, 25, 22, 18]
SALARY_RANGE = {  # triệu VND / tháng
    "Intern": (3, 8), "Fresher": (8, 14), "Junior": (12, 22), "Middle": (20, 40), "Senior": (35, 70),
}
YEARS = {"Intern": 0, "Fresher": 0, "Junior": 1, "Middle": 3, "Senior": 5}

CITIES = {  # tên chuẩn → các cách viết gặp trong dữ liệu thô
    "Hồ Chí Minh": ["Hồ Chí Minh", "TP.HCM", "TP HCM", "HCM", "hcm ", "Ho Chi Minh",
                    "Sài Gòn", "tp. hồ chí minh", "Thành phố Hồ Chí Minh"],
    "Hà Nội": ["Hà Nội", "HN", "Ha Noi", "hanoi", "TP. Hà Nội", " Hà Nội"],
    "Đà Nẵng": ["Đà Nẵng", "Da Nang", "đà nẵng"],
    "Cần Thơ": ["Cần Thơ", "Can Tho"],
    "Hải Phòng": ["Hải Phòng", "Hai Phong"],
}
CITY_WEIGHTS = [45, 35, 10, 5, 5]

SOURCES = ["topcv", "itviec", "vietnamworks", "linkedin"]
TEAMS = ["dữ liệu", "nền tảng", "thanh toán", "AI", "sản phẩm", "tăng trưởng", "hạ tầng"]
BENEFITS = ["lương tháng 13", "bảo hiểm sức khỏe cao cấp", "12 ngày phép/năm",
            "laptop riêng", "ngân sách học tập 10 triệu/năm", "thưởng theo dự án"]
WORK_MODES = ["remote", "hybrid", "onsite"]
START = date(2026, 4, 1)
DAYS = 183  # tới hết 30/09/2026


def pick_salary_text(rng, level):
    """Trả về (chuỗi lương thô, (min, max) thật tính bằng triệu) — max/min có thể None."""
    lo, hi = SALARY_RANGE[level]
    a = rng.randint(lo, hi - 2)
    b = rng.randint(a + 2, hi + 4)
    kind = rng.choices(
        ["range", "range_sp", "range_tr", "deal", "usd", "usd_word", "upto", "from", "single", "empty"],
        [22, 10, 10, 18, 8, 5, 7, 7, 5, 8])[0]
    if kind == "range":
        return f"{a}-{b} triệu", (a, b)
    if kind == "range_sp":
        return f"{a} - {b} triệu", (a, b)
    if kind == "range_tr":
        return f"{a}-{b}tr", (a, b)
    if kind == "deal":
        return rng.choice(["Thỏa thuận", "Thoả thuận", "Negotiable", "Cạnh tranh", "thỏa thuận"]), (None, None)
    if kind in ("usd", "usd_word"):
        ua, ub = round(a * 1e6 / USD_RATE / 50) * 50, round(b * 1e6 / USD_RATE / 50) * 50
        real = (ua * USD_RATE / 1e6, ub * USD_RATE / 1e6)
        if kind == "usd_word":
            return f"{ua}-{ub} USD", real
        if ua >= 1000 and rng.random() < 0.5:
            return f"${ua:,} - ${ub:,}", real
        return f"${ua}-{ub}", real
    if kind == "upto":
        return rng.choice([f"upto {b}tr", f"Up to {b} triệu", f"Tới {b} triệu"]), (None, b)
    if kind == "from":
        return rng.choice([f"Từ {a} triệu", f"Trên {a} triệu", f"{a}tr+"]), (a, None)
    if kind == "single":
        return f"{a} triệu", (a, a)
    return "", (None, None)


def fmt_date(rng, d):
    style = rng.choices(["iso", "dmy_slash", "dmy_dash", "ymd_slash"], [50, 30, 10, 10])[0]
    return {"iso": d.strftime("%Y-%m-%d"), "dmy_slash": d.strftime("%d/%m/%Y"),
            "dmy_dash": d.strftime("%d-%m-%Y"), "ymd_slash": d.strftime("%Y/%m/%d")}[style]


def messy_case(rng, s):
    r = rng.random()
    if r < 0.12:
        return s.lower()
    if r < 0.18:
        return s.upper()
    return s


def fmt_skills(rng, skills):
    sep = rng.choice([", ", ",", ";", " ; ", "; "])
    parts = [messy_case(rng, s) for s in skills]
    if rng.random() < 0.1:  # lặp kỹ năng với cách viết khác
        parts.append(parts[0].lower() if parts[0] != parts[0].lower() else parts[0].upper())
    text = sep.join(parts)
    if rng.random() < 0.1:
        text += sep.strip()  # dấu phân cách thừa ở cuối
    if rng.random() < 0.15:
        text = " " + text + "  "
    return text


def company_variant(rng, name):
    r = rng.random()
    if r < 0.06:
        return name.upper()
    if r < 0.10:
        return "Công ty TNHH " + name
    if r < 0.13:
        return "Cty " + name
    if r < 0.17:
        return name.replace(" ", "  ") + " "
    return name


def describe(rng, job, salary_real, extra_skill):
    level, skills = job["_level"], job["_skills"]
    title = job["_title"]
    sents = [rng.choice([
        f"{job['_company']} đang tìm {title} cho đội {rng.choice(TEAMS)}.",
        f"Chúng tôi cần tuyển {title} tại {job['_city']}.",
        f"{job['_company']} is hiring a {title} to join our {rng.choice(TEAMS)} team.",
    ])]
    must = skills[:2]
    nice = skills[2:4] + ([extra_skill] if extra_skill else [])
    s = f"Yêu cầu thành thạo {' và '.join(must)}"
    if nice:
        s += f", biết {', '.join(nice)} là lợi thế"
    sents.append(s + ".")
    if YEARS[level] == 0:
        sents.append(rng.choice(["Không yêu cầu kinh nghiệm, phù hợp sinh viên năm cuối.",
                                 "Chấp nhận ứng viên mới tốt nghiệp."]))
    else:
        sents.append(f"Ứng viên cần ít nhất {YEARS[level] + rng.randint(0, 1)} năm kinh nghiệm.")
    optional = []
    lo, hi = salary_real
    if lo is not None and hi is not None:
        optional.append(f"Mức lương {lo:g}-{hi:g} triệu/tháng tùy năng lực.")
    elif hi is not None:
        optional.append(f"Lương lên tới {hi:g} triệu.")
    elif job["_hidden_salary"] is not None:  # cột lương ghi "thỏa thuận" nhưng mô tả lộ con số
        a, b = job["_hidden_salary"]
        optional.append(f"Khoảng lương tham khảo {a}-{b} triệu (gross).")
    else:
        optional.append("Lương thỏa thuận theo năng lực.")
    mode = job["_mode"]
    optional.append({"remote": "Làm việc remote 100%, họp online hằng tuần.",
                     "hybrid": f"Làm hybrid: {rng.randint(2, 3)} ngày/tuần tại văn phòng {job['_city']}.",
                     "onsite": f"Làm việc toàn thời gian tại văn phòng {job['_city']}."}[mode])
    optional.append(f"Cấp bậc: {level}.")
    optional.append(f"Phúc lợi: {', '.join(rng.sample(BENEFITS, 2))}.")
    rng.shuffle(optional)
    sents += optional[:rng.randint(1, 3)]
    if job["_level_hidden"] and f"Cấp bậc: {level}." not in sents:
        sents.append(f"Cấp bậc: {level}.")  # cột level trống → mô tả vẫn có cấp bậc
    return " ".join(sents)


def make_original(rng, n_id, used):
    while True:
        role = rng.choice(list(ROLES))
        level = rng.choices(LEVELS, LEVEL_WEIGHTS)[0]
        company = rng.choice(COMPANIES)
        city = rng.choices(list(CITIES), CITY_WEIGHTS)[0]
        title = {"Intern": f"{role} Intern", "Fresher": f"Fresher {role}",
                 "Junior": f"Junior {role}", "Middle": role, "Senior": f"Senior {role}"}[level]
        if (title, company, city) not in used:
            used.append((title, company, city))
            break
    pool = ROLES[role]
    skills = rng.sample(pool, rng.randint(2, min(6, len(pool))))
    salary_text, salary_real = pick_salary_text(rng, level)
    hidden = None
    if salary_real == (None, None) and rng.random() < 0.4:
        lo, hi = SALARY_RANGE[level]
        a = rng.randint(lo, hi - 2)
        hidden = (a, a + rng.randint(2, 6))
    d = START + timedelta(days=rng.randrange(DAYS))
    level_raw = rng.choice({"Intern": ["Intern", "intern", "Thực tập sinh"], "Fresher": ["Fresher", "fresher", "Mới tốt nghiệp"],
                            "Junior": ["Junior", "JUNIOR", "junior"], "Middle": ["Middle", "Mid"],
                            "Senior": ["Senior", "senior"]}[level])
    level_hidden = rng.random() < 0.1
    city_raw = "" if rng.random() < 0.03 else rng.choice(CITIES[city])
    other = [s for sk in ROLES.values() for s in sk if s not in skills]
    extra = rng.choice(other) if rng.random() < 0.3 else None
    job = {
        "job_id": f"JR-{n_id:05d}",
        "title": title,
        "company": company_variant(rng, company),
        "city": city_raw,
        "salary": salary_text,
        "level": "" if level_hidden else level_raw,
        "skills": "" if rng.random() < 0.04 else fmt_skills(rng, skills),
        "posted_date": "" if rng.random() < 0.03 else fmt_date(rng, d),
        "source": rng.choice(SOURCES),
        "_title": title, "_company": company, "_city": city, "_level": level, "_skills": skills,
        "_mode": rng.choices(WORK_MODES, [20, 35, 45])[0], "_hidden_salary": hidden,
        "_level_hidden": level_hidden, "_date": d,
    }
    job["description"] = describe(rng, job, salary_real, extra)
    return job


def near_duplicate(rng, job, n_id):
    """Cùng một tin đăng lại ở nguồn khác: id mới, khác khoảng trắng/hoa thường."""
    dup = dict(job)
    dup["job_id"] = f"JR-{n_id:05d}"
    dup["source"] = rng.choice([s for s in SOURCES if s != job["source"]])
    t = job["_title"]
    dup["title"] = rng.choice([t.lower(), "  " + t, t.replace(" ", "  "), t.upper(), t + " "])
    dup["company"] = company_variant(rng, job["_company"]) if rng.random() < 0.5 else job["_company"].upper()
    if job["city"]:
        dup["city"] = rng.choice(CITIES[job["_city"]])
    if job["posted_date"]:
        dup["posted_date"] = fmt_date(rng, job["_date"])
    return dup


def invalid_rows(rng, n_id):
    base = dict(job_id="", title="Data Engineer", company="Lotus AI", city="HCM", salary="20-30 triệu",
                level="Middle", skills="Python, SQL", posted_date="2026-08-01", source="topcv",
                description="Tin lỗi do crawler: thiếu dữ liệu.")
    rows = [
        dict(base, job_id=f"JR-{n_id:05d}", title="", description="Tuyển gấp. Liên hệ HR."),
        dict(base, job_id=f"JR-{n_id + 1:05d}", title="Junior Data Analyst", salary="40-15 triệu",
             level="Junior", skills="SQL; Excel", description="Tuyển Junior Data Analyst, biết SQL và Excel."),
        dict(base, job_id=f"JR-{n_id + 2:05d}", title="Senior AI Engineer", salary="500-800 triệu",
             level="Senior", city="Hà Nội", skills="Python;LLM",
             description="Senior AI Engineer làm LLM. Lương cực cao, liên hệ ngay."),
        dict(base, job_id=f"JR-{n_id + 3:05d}", title="Fresher Data Engineer", posted_date="31/02/2026",
             level="Fresher", salary="10-14 triệu", city="Đà Nẵng",
             description="Fresher Data Engineer, biết Python và SQL."),
        dict(base, job_id=f"JR-{n_id + 4:05d}", title="Data Engineer Intern", posted_date="2027-03-01",
             level="Intern", salary="5-7 triệu", description="Tuyển thực tập sinh Data Engineer, làm onsite."),
        dict(base, job_id=f"JR-{n_id + 5:05d}", title="Backend Developer (Python)", company="",
             city="hcm ", description="Backend Python, FastAPI. Làm hybrid."),
        dict(base, job_id=f"JR-{n_id + 6:05d}", title="DevOps Engineer", city="N/A", company="Bamboo Cloud",
             skills="Docker,Kubernetes", description="DevOps Engineer, làm remote 100%."),
        dict(base, title="AI Engineer Intern", company="Kite Robotics", level="Intern", salary="",
             description="Không có mã tin."),
    ]
    return rows


def main():
    rng = random.Random(SEED)
    used = []
    originals = [make_original(rng, 10001 + i, used) for i in range(262)]
    rows = list(originals)
    next_id = 10001 + len(originals)
    # bản trùng gần đúng: chèn ngay sau bản gốc một khoảng ngẫu nhiên
    for job in rng.sample(originals, 18):
        dup = near_duplicate(rng, job, next_id)
        next_id += 1
        pos = rows.index(job) + rng.randint(1, 15)
        rows.insert(min(pos, len(rows)), dup)
    # bản trùng y hệt (crawler lấy 2 lần)
    for job in rng.sample(originals, 14):
        pos = rows.index(job) + rng.randint(1, 20)
        rows.insert(min(pos, len(rows)), dict(job))
    for bad in invalid_rows(rng, next_id):
        rows.insert(rng.randrange(20, len(rows)), bad)
    cols = ["job_id", "title", "company", "city", "salary", "level", "skills", "posted_date", "source", "description"]
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(cols)
        for r in rows:
            w.writerow([r[c] for c in cols])
    print(f"Đã ghi {len(rows)} dòng → {OUT}")


if __name__ == "__main__":
    main()
