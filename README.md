# AI Academy — học AI & Data Engineering qua project JobRadar

Phần mềm học tập chạy **trên máy của bạn**, dành cho người đã biết web cơ bản nhưng chưa biết Python/AI, muốn chuẩn bị phỏng vấn **AI Engineer / Data Engineer Intern** trong 3–4 tuần.

- 17 bài học (P0–P4: Python, chatbot, data pipeline, LLM trích xuất có cấu trúc, tìm kiếm ngữ nghĩa & RAG) xuyên suốt một sản phẩm: **JobRadar — trợ lý thị trường việc làm IT**.
  JobRadar gom tin tuyển dụng từ nhiều trang (mỗi trang viết một kiểu, lương ghi "Thỏa thuận" hay "$1,950 - $2,900", kỹ năng nằm lẫn trong mô tả), làm sạch, dùng LLM đọc hiểu, rồi trả lời câu hỏi của người tìm việc bằng số liệu thật, kèm nguồn.
- Mỗi bài: đề bài, code khung (`# TODO`), **test tự chấm**, câu hỏi phỏng vấn.
- Web app local: lộ trình, đọc bài, bấm **Chạy test**, bản đồ kiến thức, gia sư AI.
- Không cần tài khoản, không cần database server. Tiến độ lưu ngay trên máy bạn.
- Là **nền tảng nhiều khóa học**: một lệnh `start`, một địa chỉ (http://127.0.0.1:8100), trang đầu là **Thư viện khóa học** liệt kê mọi khóa (hiện có **AI & Data** và **Node.js & WebSocket**), mỗi khóa có tiến độ riêng.

| Project | Làm xong bạn có |
|---|---|
| P0 · Khởi động Python | Code Python xử lý dữ liệu có test, gọi được API model AI của NVIDIA |
| P1 · Chatbot đầu tiên | Chatbot web nhớ ngữ cảnh, chữ hiện dần, tự thử lại khi bị rate limit |
| P2 · Data pipeline | Pipeline 302 tin thô → CSDL SQLite sạch, kèm báo cáo SQL về thị trường |
| P3 · LLM trích xuất | Bộ trích xuất JSON bằng LLM chạy cả bộ dữ liệu có cache, đo được precision/recall |
| P4 · Tìm kiếm ngữ nghĩa & RAG | Tìm tin theo nghĩa và hỏi đáp RAG trả lời kèm id tin nguồn, đo được recall@k, MRR |
| P5–P6 · Sắp có | Agent text-to-SQL, Docker + giám sát + phần trình bày project |

Trước mỗi project, app có một trang giới thiệu: thành phẩm thật bạn sẽ chạy được, kỹ năng có được và dòng ghi vào CV.

## 1. Chuẩn bị (làm một lần)

| Cần có | Ghi chú |
|---|---|
| **Python 3.12+** | Tối thiểu 3.10 |
| **Git** | Để `git clone` |
| **VS Code** + extension **Python** (Microsoft) | Để viết code bài tập |
| **NVIDIA API key** (miễn phí) | Cho gia sư AI và các bài gọi LLM |

**Lấy NVIDIA API key (miễn phí):**
1. Vào https://build.nvidia.com và đăng nhập (tạo tài khoản NVIDIA nếu chưa có).
2. Chọn một model bất kỳ → bấm **Get API Key** → copy chuỗi bắt đầu bằng `nvapi-`.
3. Giữ kín key. Không dán vào chat, ảnh chụp màn hình, hay commit lên GitHub.

Chưa có key vẫn học được các bài chạy test; bạn có thể thêm key sau.

## 2. Cài đặt và chạy

Chọn **một** trong hai cách. **Khuyến nghị WSL (Ubuntu)** vì dòng lệnh Linux giống môi trường đi làm thật và ít lỗi vặt hơn. Windows PowerShell vẫn được hỗ trợ đầy đủ.

### Cách A — WSL (Ubuntu), khuyến nghị

Chưa có WSL? Mở PowerShell (Administrator) chạy `wsl --install`, khởi động lại máy, rồi mở "Ubuntu" từ Start Menu.

```bash
# 1) Cài công cụ cần thiết (một lần)
sudo apt update && sudo apt install -y git python3 python3-venv python3-pip

# 2) Tải repo về thư mục trong WSL (đừng đặt trong /mnt/c: rất chậm)
cd ~
git clone https://github.com/ht-nah98/ai-academy.git ai-academy
cd ai-academy

# 3) Cài đặt (tạo .venv, cài thư viện, tạo file .env)
./setup.sh

# 4) Điền API key vào .env (mở bằng VS Code, xem mục dưới)
code .env

# 5) Chạy app
./start.sh
```

Mở trình duyệt Windows tại **http://127.0.0.1:8100**. Dừng app: `Ctrl+C`.

Mở VS Code đúng cách: trong terminal Ubuntu, chạy `code .` (lần đầu VS Code sẽ tự cài "VS Code Server"). Cài thêm extension **WSL** trong VS Code, và cài extension **Python** trong cửa sổ đang kết nối WSL (góc dưới trái ghi `WSL: Ubuntu`).

Nếu `./setup.sh` báo "Permission denied": `chmod +x setup.sh start.sh`.

### Cách B — Windows (PowerShell)

Cài Python 3.12+ từ https://www.python.org/downloads/ (**tick "Add python.exe to PATH"**) và Git từ https://git-scm.com/download/win. Mở **PowerShell** (không phải CMD):

```powershell
# 1) Cho phép chạy script (một lần)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# 2) Tải repo
cd ~
git clone https://github.com/ht-nah98/ai-academy.git ai-academy
cd ai-academy

# 3) Cài đặt (tạo .venv, cài thư viện, tạo file .env)
.\setup.ps1

# 4) Điền API key vào .env
code .env

# 5) Chạy app
.\start.ps1
```

Mở trình duyệt tại **http://127.0.0.1:8100**. Dừng app: `Ctrl+C`.

> Ghi chú: `setup` chạy lại nhiều lần vẫn an toàn (không ghi đè `.env`, không cài lại `.venv`).

### Khóa Node.js & WebSocket

Khóa **Node.js & WebSocket** nằm chung trong app (chọn ở trang Thư viện khóa học), chấm bài bằng `node --test`. Để học khóa này cần cài thêm **Node.js 22 trở lên** (https://nodejs.org; WSL: cài trong Ubuntu, vd. qua `nvm`) — kiểm tra bằng `node --version`. Lần đầu, `./start.sh` / `.\start.ps1` tự chạy `npm install` cho mọi khóa có `package.json` mà chưa có `node_modules/`. Project P2 (N05–N09) dùng thêm `socket.io`, `socket.io-client`, `redis`: nếu đã cài từ trước, chạy lại `npm install` trong `academy/courses/node-realtime/` một lần; Redis thật chỉ cần cho phần chạy thử của N08 (`docker run --rm -d -p 127.0.0.1:6379:6379 redis:7-alpine`), test không cần. Bài làm và tiến độ của khóa này nằm riêng trong `academy/courses/node-realtime/workspace/` và `data/`.

### Điền API key

File `.env` (ở thư mục gốc repo) có một dòng:

```
NVIDIA_API_KEY=nvapi-...
```

Thay `nvapi-...` bằng key của bạn rồi lưu file (app và code các bài đều tự đọc file này, không cần chép sang thư mục bài). File `.env` đã được Git bỏ qua nên sẽ không bị đẩy lên GitHub. Mẫu nằm ở `.env.example`.

## 3. Một bài học diễn ra thế nào

1. Mở app → chọn khóa ở **Thư viện khóa học** → chọn project trong **lộ trình** → đọc trang giới thiệu project.
2. Vào bài → tab **Bối cảnh**: bài toán, các hàm cần viết, đầu ra để nghiệm thu.
3. Bấm **Bắt đầu làm**: app tạo thư mục `academy/workspace/<mã-bài>/` chứa code khung.
4. Mở thư mục đó bằng **VS Code** (app hiển thị sẵn lệnh `code ...` để copy), viết code vào chỗ có `# TODO`. Tab **Bài học** có kiến thức và từng bước; bí thì hỏi gia sư AI.
5. Bấm **▶ Chạy test**. Đạt hết test là qua bài, bài tiếp theo được mở.
6. Tab **Phỏng vấn thử**: trả lời câu hỏi, gia sư AI chấm điểm và gợi ý câu trả lời tốt hơn.

## 4. Code và tiến độ của bạn nằm ở đâu

| Thư mục | Chứa gì |
|---|---|
| `academy/workspace/` | Code bài làm của bạn |
| `academy/data/` | Tiến độ (`progress.json`) |
| `academy/cache/` | Cache các lần gọi LLM |
| `academy/courses/<khóa>/workspace/`, `data/`, `cache/` | Như trên, cho từng khóa khác (vd. `node-realtime`) |

Các thư mục này **không** được đưa lên Git (đã nằm trong `.gitignore`). Hãy **sao lưu** `academy/workspace/`, `academy/data/` (và `workspace/`, `data/` của các khóa trong `academy/courses/`) (copy sang chỗ khác, hoặc tạo repo riêng cho code của bạn). Xóa chúng đồng nghĩa mất bài làm và tiến độ.

## 5. Cấu trúc repo

```
setup.sh / setup.ps1     cài đặt một lệnh
start.sh / start.ps1     chạy app một lệnh
.env.example             mẫu file chứa API key
academy/
  curriculum/            giáo trình khóa AI & Data: roadmap.json + mỗi bài một thư mục (lesson.md, meta.json, starter/, tests/)
  courses/<khóa>/        mỗi khóa khác một thư mục, vd. node-realtime/: curriculum/, package.json (+ node_modules, workspace, data)
  datasets/              bộ dữ liệu tin tuyển dụng giả lập dùng trong các bài
  app/, web/             ứng dụng (FastAPI + JavaScript thuần)
docs/design.md           thiết kế hệ thống và quy ước viết bài, dành cho giáo viên/người phát triển
CLAUDE.md, scripts/      công cụ nội bộ của người soạn giáo trình
```

Học sinh chỉ cần quan tâm `academy/` và hai file `setup`/`start`. Thư mục `docs/` dành cho giáo viên.

## 6. Gặp lỗi?

| Triệu chứng | Cách xử lý |
|---|---|
| Cổng 8100 đang bị dùng (`address already in use`) | WSL: `PORT=8300 ./start.sh` · Windows: `.\start.ps1 -Port 8300`; rồi mở `http://127.0.0.1:8300` |
| Khóa Node báo "Không tìm thấy lệnh `node`" | Cài Node.js 22+, mở lại terminal, kiểm tra `node --version` rồi chạy lại `start` |
| Khóa Node báo "chưa cài thư viện Node" | Chạy lại `start` (tự `npm install`), hoặc `npm install` trong `academy/courses/<khóa>/` |
| `python: command not found` / `python is not recognized` | Linux/WSL dùng `python3`; Windows thử `py -3` hoặc `python`. Trong `.venv` đã kích hoạt thì `python` luôn dùng được |
| PowerShell: "running scripts is disabled" | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, đóng và mở lại PowerShell |
| WSL: `ensurepip is not available` / lỗi tạo venv | `sudo apt install python3 python3-venv python3-pip` rồi `./setup.sh` |
| WSL: nút/lệnh `code` không mở được VS Code | Cài VS Code trên Windows + extension **WSL**; chạy `code .` từ terminal Ubuntu |
| Chữ tiếng Việt bị lỗi font trong terminal | Dùng Windows Terminal; PowerShell: `chcp 65001`. Test của app đã tự ép UTF-8 |
| Thiếu API key / lỗi 401 | Kiểm tra `.env` ở thư mục gốc repo, đúng dòng `NVIDIA_API_KEY=nvapi-...` |
| `ModuleNotFoundError` khi chạy file bài trong terminal | Chưa kích hoạt venv: WSL `source .venv/bin/activate` · Windows `.venv\Scripts\Activate.ps1` |
| Muốn cài lại từ đầu | Xóa thư mục `.venv`, chạy lại `setup` |

## Chạy bộ test của app (cho người phát triển)

```bash
cd academy && ../.venv/bin/python -m pytest tests_app -q     # Windows: ..\.venv\Scripts\python -m pytest tests_app -q
./run.sh                                                    # chạy app chế độ dev (tự reload khi sửa code), mọi khóa, cổng 8100
```

**Thêm một khóa học:** tạo `academy/courses/<id>/curriculum/roadmap.json` (id: chữ thường, số, `-`) và các thư mục bài `curriculum/<mã-bài>/` (lesson.md, meta.json, starter/, tests/); khóa Node thêm `package.json` ở `academy/courses/<id>/`. Không cần khởi động lại server — khóa mới hiện ngay ở Thư viện khóa học. Chi tiết: `docs/design.md`.
