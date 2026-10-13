# AI Academy — thiết kế v1

## Mục tiêu
Phần mềm học tập giúp 1 học sinh (đã biết web cơ bản, chưa biết AI, chưa biết Python) chuẩn bị phỏng vấn **AI Engineer / Data Engineer Intern** trong **3–4 tuần × 3–4 giờ/ngày** (~70–100 giờ).

Nguyên tắc sư phạm: học qua project. Mỗi bài học = 1 khâu của project, gắn với **1 mục tiêu đo được**, theo vòng:
`Mục tiêu → Đề bài → Tại sao (kiến thức nền) → Làm → Tự kiểm tra (test) → Câu hỏi phỏng vấn`. Dạy thẳng Python, không so sánh với JavaScript.

Mạch truyện xuyên suốt: xây **JobRadar — trợ lý thị trường việc làm IT** (một sản phẩm, một bộ dữ liệu, dùng được để kể khi phỏng vấn).

## Hình thức (v1)
- **Repo bài tập**: mỗi bài có đề (`lesson.md`), code khung (`starter/`), test tự chấm (`tests/`). Học sinh code trong VS Code ở `academy/workspace/<lesson-id>/`.
- **Web app local nhẹ** (FastAPI + HTML/CSS/JS thuần): lộ trình, bài học, chạy test, bản đồ kiến thức, gia sư AI, phỏng vấn thử. Model NVIDIA build.nvidia.com làm gia sư/người chấm.
- Không tài khoản, không DB server. Tiến độ lưu `academy/data/progress.json`.

## Cấu trúc thư mục
```
academy/
  run.sh                     # khởi động: uvicorn app.main:app --port 8100
  requirements.txt
  app/
    main.py                  # FastAPI, serve web/ và /api/*
    curriculum.py            # đọc roadmap.json + meta.json + lesson.md
    progress.py              # đọc/ghi data/progress.json
    runner.py                # chạy pytest cho 1 bài
    llm.py                   # client NVIDIA: cache đĩa, retry 429, đọc key từ .env
  web/  index.html  app.js  style.css
  curriculum/
    roadmap.json
    <lesson-id>/             # vd. L01-python-co-ban
      meta.json
      lesson.md
      starter/<files>
      tests/test_*.py
  workspace/                 # code của học sinh (tạo khi bấm "Bắt đầu")
  data/progress.json
  cache/llm/                 # cache gọi NVIDIA
```

## Hợp đồng dữ liệu

### `curriculum/roadmap.json`
```json
{
  "title": "JobRadar — học AI & Data qua thực chiến",
  "concept_groups": [
    {"id": "python", "title": "Nền tảng Python"},
    {"id": "llm", "title": "LLM"},
    {"id": "data", "title": "Data Engineering"},
    {"id": "rag", "title": "Tìm kiếm & RAG"},
    {"id": "agent", "title": "Agent"},
    {"id": "ops", "title": "Triển khai & nâng cao"}
  ],
  "concepts": [{"id": "token", "title": "Token", "group": "llm"}],
  "projects": [
    {"id": "P1", "title": "...", "goal": "...", "track": "AI|Data|AI×Data|Nâng cao",
     "lessons": [{"id": "L03-goi-llm-dau-tien", "title": "...", "goal": "...", "status": "ready|planned"}]}
  ]
}
```
`status: planned` = bài chưa có nội dung (hiển thị khóa "Sắp có").

### `curriculum/<lesson-id>/meta.json`
```json
{
  "id": "L03-goi-llm-dau-tien",
  "title": "Gọi LLM đầu tiên",
  "goal": "Viết hàm ask() gửi câu hỏi tới LLM và trả về câu trả lời + số token đã dùng",
  "duration_min": 180,
  "concepts": ["llm-api", "token", "messages-roles"],
  "entry": "chat.py",
  "checklist": ["Giải thích được token là gì", "..."],
  "interview_questions": ["Token là gì? Vì sao chi phí LLM tính theo token?", "..."],
  "tutor_notes": "Ghi chú cho gia sư AI: lỗi hay gặp, gợi ý không lộ đáp án"
}
```

### `lesson.md` — các mục bắt buộc, đúng thứ tự
`## 🎯 Mục tiêu`, `## 📋 Đề bài`, `## 🤔 Tại sao? (kiến thức nền)`, `## 🛠️ Làm`, `## ✅ Tự kiểm tra`, `## 🎤 Câu hỏi phỏng vấn`.
Viết tiếng Việt, giọng gần gũi; dạy thẳng Python; mục "Tại sao" giải thích gốc gác vấn đề (vì sao khâu này tồn tại), có ví dụ cụ thể.

### Test
- Runner chạy `python -m pytest curriculum/<id>/tests -q` với `PYTHONPATH=workspace/<id>` → test `import` trực tiếp file của học sinh (vd. `from chat import ask`).
- Test **không gọi mạng**: hàm cần LLM nhận tham số `client` (OpenAI-compatible) để test truyền fake client. Bài nào cần chạy thật thì có hướng dẫn chạy tay trong `lesson.md`.
- Thông báo lỗi assert bằng tiếng Việt, gợi ý hướng sửa.

## API
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/roadmap` | roadmap + trạng thái từng bài (`locked/planned/not_started/in_progress/passed`) + concept nào đã học |
| GET | `/api/lessons/{id}` | meta + markdown + đường dẫn workspace + tiến độ bài |
| POST | `/api/lessons/{id}/start` | copy `starter/` → `workspace/<id>/` (không ghi đè nếu đã có) |
| POST | `/api/lessons/{id}/test` | chạy pytest (timeout 60s) → `{passed, failed, total, output}`; pass hết → đánh dấu `passed` |
| POST | `/api/lessons/{id}/checklist` | `{index, done}` |
| POST | `/api/tutor` | `{lesson_id, messages}` → trả lời gia sư (Socratic: gợi ý, không đưa lời giải trọn vẹn); ngữ cảnh = meta + lesson.md + code hiện tại của học sinh |
| POST | `/api/interview/grade` | `{lesson_id, question, answer}` → `{score 0-10, strengths, gaps, better_answer}` (JSON) |

Model: gia sư `nvidia/nemotron-3-super-120b-a12b` (nhanh), chấm phỏng vấn `nvidia/nemotron-3-ultra-550b-a55b`, dự phòng `z-ai/glm-5.3-flash`. Tắt thinking cho gia sư (`chat_template_kwargs.enable_thinking=false`).

## Giao diện
- Sidebar trái: project → bài, icon trạng thái, thanh tiến độ tổng.
- Khu chính, tab: **Bài học** chia 2 màn song song — trái **Đề bài** (Cách làm bài 4 bước, nút Bắt đầu / Chạy test, Mục tiêu, Đề bài, Tự kiểm tra, checklist), phải **Hướng dẫn code** (Tại sao, Làm); màn hẹp gộp thành 1 màn có nút chuyển | **Phỏng vấn thử** (từng câu → nhập trả lời → chấm).
- Trang **Bản đồ kiến thức**: khái niệm nhóm theo concept_groups, sáng lên khi bài chứa nó đã `passed`.
- **Gia sư AI**: nút nổi góc phải dưới, mở drawer chat.
- Mở khóa tuần tự: bài N mở khi bài N-1 `passed` (có nút "Mở khóa thủ công" cho giáo viên).

## Lộ trình (23 bài)
| Project | Bài |
|---|---|
| P0 Khởi động Python (dev web → Python) | L01 Python cơ bản qua dữ liệu tuyển dụng · L02 HTTP, JSON, venv, .env — gọi API NVIDIA |
| P1 Chatbot đầu tiên (AI) | L03 Gọi LLM đầu tiên · L04 Temperature & system prompt · L05 Hội thoại nhiều lượt & context window · L06 Web chat, streaming, lỗi & rate limit |
| P2 Data pipeline tin tuyển dụng (Data) | L07 Dữ liệu bẩn & pandas · L08 Mô hình hóa & nạp SQLite · L09 SQL phân tích · L10 ETL lặp lại được & chất lượng dữ liệu |
| P3 LLM trích xuất có cấu trúc (AI×Data) | L11 Structured output & validate · L12 Batch: rate limit, cache, retry, chi phí · L13 Đánh giá: tập nhãn, precision/recall |
| P4 Tìm kiếm ngữ nghĩa & RAG (AI) | L14 Embedding & cosine · L15 Chunking & vector index · L16 RAG có trích nguồn · L17 Đánh giá RAG |
| P5 Agent dùng công cụ (AI) | L18 Function calling · L19 Agent text-to-SQL an toàn |
| P6 Nâng cao cạnh tranh | L20 FastAPI + Docker · L21 Điều phối pipeline (DAG, Airflow) & giám sát · L22 ML cổ điển: dự đoán lương · L23 Capstone & kể chuyện project |

**v1 có nội dung đầy đủ: L01–L03.** Các bài còn lại `planned`, viết dần.

## Ngoài phạm vi v1
Đăng nhập, nhiều học sinh, editor trong trình duyệt, deploy lên server.
