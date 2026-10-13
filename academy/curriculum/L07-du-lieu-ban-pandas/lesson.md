# L07 — Dữ liệu bẩn & pandas

> Từ bài này JobRadar dùng **dữ liệu thật cỡ vừa**: ~300 tin tuyển dụng crawl từ nhiều trang. Dữ liệu crawl luôn bẩn. Việc đầu tiên của Data Engineer: **làm sạch trước khi tin con số.**

## 🎯 Mục tiêu

Sau buổi này (khoảng 3,5 giờ) bạn sẽ:

- Đọc CSV vào **DataFrame** và khám phá nhanh: `shape`, `dtypes`, `isna()`, `value_counts()`.
- Chuẩn hóa chuỗi bẩn: thành phố, công ty, kỹ năng.
- Đọc lương dạng chữ (`"15-25 triệu"`, `"$1000-1500"`) bằng **regex**.
- Đọc ngày nhiều định dạng, khử bản trùng.
- **Kết quả đo được:** 5 hàm trong `cleaning.py` qua hết **18 test**; 302 dòng thô → 268 tin sạch.

> 🧠 **Ghi nhớ:** "Garbage in, garbage out" — phân tích, dashboard hay model AI đều sai nếu dữ liệu đầu vào bẩn. Data Engineer dành phần lớn thời gian cho khâu này.

## 📋 Đề bài

**Mở file:** `academy/workspace/L07-du-lieu-ban-pandas/cleaning.py`.

Dữ liệu: `academy/datasets/jobs_raw.csv`. Biến `DATA_PATH` trong file đã trỏ sẵn tới đó.

| Hàm | Ví dụ |
|---|---|
| `normalize_city(raw)` | `" TP.HCM "` → `"Hồ Chí Minh"` |
| `parse_salary(raw, usd_rate)` | `"$1000-1500"` → `(25.0, 37.5)` |
| `parse_date(raw)` | `"15/09/2026"` → `"2026-09-15"` |
| `split_skills(raw)` | `" Python, SQL;python"` → `["python", "sql"]` |
| `clean_jobs(df)` | 302 dòng thô → 268 dòng sạch |

Docstring dưới mỗi `def` ghi đủ quy tắc. Bảng `CITY_ALIASES`, `DATE_FORMATS`… đã có sẵn.

**Xong khi:** bấm **Chạy test** thấy `18 passed`.

## 🤔 Tại sao? (kiến thức nền)

### Dữ liệu bẩn đến từ đâu

Dữ liệu bẩn sinh ra khi **nhiều người, nhiều nguồn** cùng ghi một thứ mà không có quy ước chung.

Mỗi nhà tuyển dụng gõ tay: người viết `HCM`, người viết `Sài Gòn`. Crawler lấy một tin 2 lần. Trang A ghi ngày `15/09/2026`, trang B ghi `2026-09-15`. Nếu đếm thẳng, `HCM` và `TP.HCM` thành 2 thành phố khác nhau.

| Loại bẩn | Ví dụ trong JobRadar |
|---|---|
| Nhiều cách viết | `HCM`, `hcm `, `TP.HCM`, `Sài Gòn` |
| Dạng chữ thay vì số | `"15-25 triệu"`, `"Thỏa thuận"` |
| Định dạng lẫn lộn | `15/09/2026`, `2026-09-15` |
| Trùng lặp | cùng tin, khác khoảng trắng/hoa thường |
| Thiếu / sai | ô trống, ngày `31/02/2026` |

### DataFrame và Series

**DataFrame** là bảng (hàng × cột) trong bộ nhớ; mỗi cột là một **Series** — một dãy giá trị cùng kiểu, có nhãn (index).

Nghĩ DataFrame như một sheet Excel mà bạn điều khiển bằng code. `df["city"]` lấy một cột (Series), `df[df["price"] > 10]` lọc hàng bằng **mask** (Series True/False).

```mermaid
flowchart LR
    CSV["jobs_raw.csv"] -->|"pd.read_csv"| DF["DataFrame 302 × 10"]
    DF -->|"df['city']"| S["Series: 1 cột"]
    DF -->|"df[mask]"| F["DataFrame: các hàng thỏa điều kiện"]
    S -->|".apply(hàm)"| S2["Series mới"]
```

### NaN, None và ô trống

pandas đánh dấu ô thiếu là **NaN** ("Not a Number"); ô rỗng trong CSV được đọc thành NaN.

`NaN == NaN` là `False`, nên không so bằng `==` được — dùng `pd.isna(x)` hoặc `df["col"].isna()`. Hàm `is_blank` có sẵn gộp cả 3 trường hợp: `None`, NaN, chuỗi toàn khoảng trắng.

> ⚠️ **Lỗi hay gặp:** gọi `raw.lower()` khi `raw` là NaN → `AttributeError: 'float' object has no attribute 'lower'`. Luôn kiểm tra trống trước.

### Regex: tìm mẫu trong chuỗi

**Regex** (biểu thức chính quy) là ngôn ngữ mô tả mẫu chữ; `re.findall(mẫu, chuỗi)` trả về mọi đoạn khớp.

| Mẫu | Nghĩa |
|---|---|
| `\d+` | một hay nhiều chữ số |
| `(?:\.\d+)?` | phần thập phân, có hoặc không |
| `[,;]` | dấu phẩy **hoặc** chấm phẩy |

Viết mẫu trong chuỗi `r"..."` (raw string) để Python không hiểu `\d` thành ký tự đặc biệt.

### Chuẩn hóa rồi mới khử trùng

Hai dòng chỉ được coi là trùng khi so trên **giá trị đã chuẩn hóa**; so trên dữ liệu thô thì bỏ sót.

`"Data Engineer"` và `"  data  engineer "` khác nhau từng ký tự nhưng là một tin. Thứ tự đúng: chuẩn hóa → tạo khóa so sánh → `drop_duplicates`.

```mermaid
flowchart TD
    A["302 dòng thô"] --> B["Bỏ dòng thiếu job_id / title"]
    B --> C["Chuẩn hóa: city, company, level, salary, date, skills"]
    C --> D["Bỏ trùng theo job_id (crawl 2 lần)"]
    D --> E["Bỏ trùng theo (title, company, city) đã chuẩn hóa"]
    E --> F["268 tin sạch"]
```

### Giữ nguyên dữ liệu gốc

Không bao giờ sửa file thô; luôn sinh ra **bản sạch mới** từ bản thô.

Nếu quy tắc làm sạch sai, bạn sửa code rồi chạy lại từ bản thô. Sửa thẳng vào bản thô thì mất dấu vết vĩnh viễn. Vì vậy `clean_jobs` bắt đầu bằng `df.copy()`.

> 🎯 **Phỏng vấn hay hỏi:** "Bạn xử lý giá trị thiếu thế nào?" — trả lời theo 3 lựa chọn: bỏ dòng, điền giá trị mặc định, hoặc giữ trống và đánh dấu; chọn theo việc cột đó dùng để làm gì.

## 🛠️ Làm

Toàn cảnh: 4 hàm nhỏ xử lý **từng ô**, `clean_jobs` áp chúng lên **cả bảng**.

```mermaid
flowchart LR
    R["DataFrame thô"] --> CJ["clean_jobs"]
    NC["normalize_city"] --> CJ
    PS["parse_salary"] --> CJ
    PD["parse_date"] --> CJ
    SS["split_skills"] --> CJ
    CJ --> O["DataFrame sạch: 11 cột"]
```

### Bước 1 — Chuẩn bị

`pandas` đã được cài sẵn bởi bước setup (nếu thiếu: `pip install pandas`). Mở `academy/workspace/L07-du-lieu-ban-pandas/`, chạy `python cleaning.py` (Linux/WSL: `python3` nếu chưa kích hoạt venv).

> ⚠️ **Lỗi hay gặp:** thấy `NotImplementedError` — bình thường, hàm chưa viết. Thấy `ModuleNotFoundError: No module named 'pandas'` → chưa kích hoạt venv hoặc chưa cài.

### Bước 2 — Khám phá một DataFrame

Thử trên bảng bán hàng nhỏ (không phải dữ liệu bài):

```python
import pandas as pd

sales = pd.DataFrame({
    "product": ["Táo", "táo ", "Cam", "Xoài", None],
    "price": [10, 10, 15, None, 8],
})
print(sales.shape)
print(sales.dtypes)
print(sales.isna().sum())
print(sales["product"].value_counts(dropna=False))
```
```output
(5, 2)
product        str
price      float64
dtype: object
product    1
price      1
dtype: int64
product
Táo     1
táo     1
Cam     1
Xoài    1
NaN     1
Name: count, dtype: int64
```

`value_counts` lộ ngay vấn đề: `Táo` và `táo ` bị đếm riêng. Giờ thử `pd.read_csv(DATA_PATH)` và gọi các lệnh trên với cột `city`, `salary`.

### Bước 3 — Chuẩn hóa chuỗi → `normalize_city`

Mẫu "dọn chuỗi rồi tra bảng", trên tên sản phẩm:

```python
ALIASES = {"táo": "Táo", "apple": "Táo", "cam": "Cam"}

def clean_product(raw):
    text = " ".join(str(raw).split()).lower()
    text = text.removeprefix("quả ")
    return ALIASES.get(text)

for raw in ["  TÁO ", "Quả   cam", "apple", "Mít"]:
    print(repr(raw), "→", clean_product(raw))
```
```output
'  TÁO ' → Táo
'Quả   cam' → Cam
'apple' → Táo
'Mít' → None
```

`" ".join(s.split())` gom mọi khoảng trắng thừa. Với thành phố: nhớ `is_blank` trước, và thử **từng** tiền tố trong `CITY_PREFIXES`.

### Bước 4 — Regex lấy số → `parse_salary`

Đọc điểm thi ghi bằng chữ:

```python
import re

for text in ["8.5/10", "từ 7 điểm", "Điểm: 1,000 (thang 1000)", "vắng"]:
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", text.replace(",", ""))]
    print(repr(text), "→", nums, "| có 'từ':", "từ" in text.lower())
```
```output
'8.5/10' → [8.5, 10.0] | có 'từ': False
'từ 7 điểm' → [7.0] | có 'từ': True
'Điểm: 1,000 (thang 1000)' → [1000.0, 1000.0] | có 'từ': False
'vắng' → [] | có 'từ': False
```

Với lương, xét theo **đúng thứ tự** trong docstring: trống/thỏa thuận → USD → "up to" → "từ"/"+" → số lượng số.

```mermaid
flowchart TD
    A["raw"] --> B{"Trống hoặc 'thỏa thuận'?"}
    B -- "Có" --> N["(None, None)"]
    B -- "Không" --> C["Lấy số bằng regex; có '$'/'usd' thì đổi tỷ giá"]
    C --> D{"'up to' / 'tới'?"}
    D -- "Có" --> U["(None, số đầu)"]
    D -- "Không" --> E{"'từ' / 'trên' / kết thúc '+'?"}
    E -- "Có" --> T["(số đầu, None)"]
    E -- "Không" --> F["2 số → (a, b) · 1 số → (a, a)"]
```

> 💡 **Mẹo:** `$1000` với tỷ giá 25.000 → `1000 * 25000 / 1_000_000 = 25.0` triệu.

### Bước 5 — Thử lần lượt định dạng → `parse_date`

Đọc giờ ghi nhiều kiểu:

```python
from datetime import datetime

FORMATS = ["%H:%M", "%Hh%M", "%I:%M %p"]

def parse_time(text):
    for fmt in FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%H:%M")
        except ValueError:
            continue
    return None

for t in ["14:05", "9h30", "2:05 PM", "25:00"]:
    print(t, "→", parse_time(t))
```
```output
14:05 → 14:05
9h30 → 09:30
2:05 PM → 14:05
25:00 → None
```

`strptime` báo `ValueError` khi sai định dạng **hoặc** giá trị không tồn tại (25 giờ, ngày 31/02) — tận dụng điều đó.

### Bước 6 — Tách chuỗi → `split_skills`

Sở thích ghi lộn xộn:

```python
import re

raw = "Đọc sách; bơi ,  BƠI,,"
parts = [p.strip().lower() for p in re.split(r"[,;]", raw)]
print(parts)
print([p for p in parts if p])
print(list(dict.fromkeys(p for p in parts if p)))
```
```output
['đọc sách', 'bơi', 'bơi', '', '']
['đọc sách', 'bơi', 'bơi']
['đọc sách', 'bơi']
```

`dict.fromkeys` bỏ trùng mà **giữ thứ tự** (set thì không giữ).

### Bước 7 — Áp lên cả bảng → `clean_jobs`

Các thao tác bảng cần dùng, trên bảng học sinh:

```python
import pandas as pd

df = pd.DataFrame({
    "name": ["An", " an", "Bình", "BÌNH", "Chi"],
    "class": ["10A", "10A", "10B", "10B", "10A"],
    "score": ["8-9", "8-9", "7", "7", ""],
})
out = df.copy()
out["name"] = out["name"].apply(lambda s: s.strip())
key = out["name"].str.lower()
print(out.groupby(key)["name"].agg(lambda s: s.mode()[0]).to_dict())

pairs = out["score"].apply(lambda s: tuple(s.split("-")) if s else (None, None))
out["lo"] = pairs.apply(lambda t: t[0])
out["hi"] = pairs.apply(lambda t: t[-1])
out["_k"] = key
out = out.drop_duplicates(subset=["_k", "class"], keep="first")
print(out[["name", "class", "lo", "hi"]].reset_index(drop=True))
```
```output
{'an': 'An', 'bình': 'BÌNH', 'chi': 'Chi'}
   name class   lo   hi
0    An   10A    8    9
1  Bình   10B    7    7
2   Chi   10A  NaN  NaN
```

- `.apply(hàm)`: chạy hàm trên từng ô của cột.
- `groupby(key).agg(...)`: gom nhóm theo khóa rồi tính 1 giá trị mỗi nhóm; `.map` để gán lại.
- `drop_duplicates(subset=..., keep="first")`: bỏ trùng theo vài cột.

> ⚠️ **Lỗi hay gặp:** `df[df["title"] != ""]` không bỏ được NaN. Dùng mask `~df["title"].apply(is_blank)`.

### Bước 8 — Chạy trên dữ liệu thật

Chạy `python cleaning.py`: thấy `Thô: (302, 10)` và `Sạch: (268, 11)`, `value_counts` của `city` chỉ còn 5 tên chuẩn. Rồi bấm **Chạy test**.

> 💡 **Mẹo:** còn thời gian? Đọc vài ô `description` — nhiều tin ghi lương "thỏa thuận" ở cột `salary` nhưng lộ con số trong mô tả. Ở P3 bạn sẽ dùng LLM để trích những thông tin đó.

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc từ thư mục `academy/`:

```bash
PYTHONPATH=workspace/L07-du-lieu-ban-pandas python3 -m pytest curriculum/L07-du-lieu-ban-pandas/tests -q
```

> 💡 **Mẹo:** Windows PowerShell: `$env:PYTHONPATH="workspace\L07-du-lieu-ban-pandas"; python -m pytest curriculum\L07-du-lieu-ban-pandas\tests -q`

Mục tiêu: `18 passed`. Test `..._du_lieu_that` chạy trên CSV thật — nếu chỉ test đó fail, so `value_counts()` từng cột để tìm biến thể bạn bỏ sót.

- [ ] Tôi giải thích được vì sao `NaN == NaN` là `False` và dùng `isna()` thay thế.
- [ ] Tôi đọc được mẫu regex `\d+(?:\.\d+)?`.
- [ ] Tôi giải thích được vì sao phải chuẩn hóa **trước** khi khử trùng.
- [ ] Tôi biết vì sao không sửa file dữ liệu thô.

## 🎤 Câu hỏi phỏng vấn

Tập trả lời thành tiếng, mỗi câu 30–60 giây, rồi luyện ở tab **Phỏng vấn thử**.

1. Dữ liệu bẩn thường gặp những dạng nào? Kể ví dụ từ project của bạn.
2. Bạn xử lý giá trị thiếu thế nào? Khi nào bỏ dòng, khi nào điền giá trị, khi nào giữ trống?
3. `None` và `NaN` khác nhau thế nào trong pandas? Vì sao không dùng `==` để kiểm tra NaN?
4. Làm sao phát hiện và loại bản ghi trùng gần đúng (khác khoảng trắng, hoa thường)?
5. `.apply()` khác thao tác vector hóa (vd. `df["a"] * 2`, `.str.lower()`) thế nào? Cái nào nhanh hơn, vì sao?
6. Vì sao nên giữ nguyên dữ liệu thô và tạo bản sạch riêng?
7. Bạn quy đổi lương USD sang VND thế nào? Dùng tỷ giá cố định có vấn đề gì?

> 🎯 **Phỏng vấn hay hỏi:** câu 5 — `.apply` gọi hàm Python từng ô (chậm với triệu dòng); `.str.lower()` hay phép toán cột chạy bằng code C bên trong pandas/numpy.
