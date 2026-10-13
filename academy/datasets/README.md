# JobRadar dataset

`jobs_raw.csv` — ~300 tin tuyển dụng IT tại Việt Nam, **giả lập** (tên công ty hư cấu), dùng cho P2 (pipeline dữ liệu), P3 (LLM trích xuất), P4 (RAG), P5 (text-to-SQL).

Sinh lại: `python make_jobs.py` (chỉ thư viện chuẩn, seed cố định → file giống hệt từng byte).

## Cột

| Cột | Ý nghĩa |
|---|---|
| `job_id` | mã tin (`JR-xxxxx`) |
| `title` | tên vị trí |
| `company` | tên công ty |
| `city` | thành phố |
| `salary` | lương dạng chữ, đơn vị triệu VND/tháng hoặc USD/tháng |
| `level` | cấp bậc |
| `skills` | danh sách kỹ năng trong một chuỗi |
| `posted_date` | ngày đăng |
| `source` | trang nguồn (`topcv`, `itviec`, `vietnamworks`, `linkedin`) |
| `description` | mô tả tự do 4–7 câu (Việt, đôi khi Anh) |

## Dữ liệu bẩn ở đâu

- **Trùng lặp:** có dòng trùng y hệt (crawl 2 lần) và tin đăng lại ở nguồn khác với `job_id` mới, khác khoảng trắng/hoa thường.
- **Thành phố:** nhiều cách viết cho cùng một nơi (viết tắt, không dấu, có tiền tố "TP.", thừa khoảng trắng), đôi khi trống hoặc vô nghĩa.
- **Công ty:** khác hoa thường, thừa khoảng trắng, có tiền tố kiểu "Công ty TNHH", "Cty".
- **Lương:** khoảng (`"15-25 triệu"`, `"12-18tr"`), USD (`"$1000-1500"`, `"$1,200 - $2,000"`, `"800-1000 USD"`), chỉ trần (`"upto 30tr"`, `"Up to …"`, `"Tới …"`), chỉ sàn (`"Từ …"`, `"Trên …"`, `"15tr+"`), một số, thỏa thuận (nhiều cách viết), hoặc trống. Quy ước tỷ giá trong bài tập: 1 USD = 25.000 VND.
- **Cấp bậc:** khác hoa thường, tiếng Việt/tiếng Anh, viết tắt; đôi khi trống.
- **Kỹ năng:** ngăn bởi `,` hoặc `;`, khoảng trắng và hoa thường lộn xộn, lặp, dấu phân cách thừa; đôi khi trống.
- **Ngày:** trộn nhiều định dạng (`YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`); đôi khi trống.
- **Bản ghi sai:** một số ít dòng thiếu trường bắt buộc hoặc có giá trị vô lý (lương, ngày).

## `description`

Viết tự do, nhắc kỹ năng, kinh nghiệm, lương, hình thức làm việc (remote/hybrid/onsite), cấp bậc, phúc lợi. Thông tin trong mô tả **không luôn khớp** cột có cấu trúc: có thể bổ sung (ví dụ: hình thức làm việc chỉ có trong mô tả; cột lương "thỏa thuận" nhưng mô tả có con số; cột cấp bậc trống nhưng mô tả có) hoặc nhắc thêm kỹ năng không có trong cột `skills`.
