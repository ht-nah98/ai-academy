# AI Academy — Thiết kế (trạng thái hiện tại)

Nguồn sự thật: code trong `academy/app/`, `academy/web/app.js`, `academy/curriculum/`.

## 1. Mục đích & người học
- 1 học viên, chuẩn bị phỏng vấn thực tập AI Engineer / Data Engineer, lộ trình 3–4 tuần.
- Học qua project: sản phẩm xuyên suốt **JobRadar** (làm sạch, lưu, phân tích, trích xuất bằng LLM, RAG, agent, triển khai).
- Mỗi bài: đọc bối cảnh, viết code theo starter, chấm bằng test cục bộ, tự kiểm tra, luyện phỏng vấn với người chấm AI.
- Chạy cục bộ; LLM dùng model miễn phí trên build.nvidia.com.

## 2. Kiến trúc
FastAPI (`academy/app/`) phục vụ `/api/*` và SPA JS thuần (`academy/web/`, không build step). Chạy bằng `academy/run.sh` (hoặc `start.sh`/`start.ps1` ở gốc repo).

| Thư mục (`academy/`) | Vai trò |
|---|---|
| `curriculum/` | Nội dung bài, chỉ đọc: `roadmap.json` + `L*/{meta.json, lesson.md, starter/, tests/}` |
| `workspace/<lesson_id>/` | Code của học viên, copy từ `starter/` khi bấm "Bắt đầu" (không ghi đè nếu đã có) |
| `data/progress.json` | Tiến độ (ghi nguyên tử qua file `.tmp`, có khóa luồng) |
| `cache/llm/` | Cache lời gọi LLM: `<sha256>.json` |
| `datasets/` | Dữ liệu tin tuyển dụng giả lập dùng trong bài |
| `web/` | `index.html`, `app.js`, `style.css` |

Đường dẫn đổi được bằng env: `ACADEMY_ROOT`, `ACADEMY_CURRICULUM`, `ACADEMY_WORKSPACE`, `ACADEMY_DATA`, `ACADEMY_CACHE` (`config.py`).

### Luồng request
1. Trình duyệt tải `/` → `render_index()` gắn `?v=<sha1[:10]>` nội dung file vào URL asset; mọi response mặc định `Cache-Control: no-cache`.
2. SPA gọi `GET /api/roadmap` (cây project/bài, trạng thái, khái niệm đã học) và `GET /api/lessons/{id}` khi mở bài.
3. "Bắt đầu" → copy starter; "Chạy test" → `runner` chạy pytest trong workspace, lưu kết quả vào `progress.json`.
4. Gia sư / chấm phỏng vấn → `llm.chat()` → cache đĩa → API NVIDIA.

### Route frontend (hash router, `app.js`)
| Route | Nội dung |
|---|---|
| `#/` | Trang chủ: tiến độ, bản đồ khái niệm, timeline project, nút "Học tiếp" |
| `#/project/<PID>` | Giới thiệu project: goal, deliverable, promise, can_do, showcase, cv_line, danh sách bài |
| `#/lesson/<id>` | 3 tab: **Bối cảnh** (nếu có `meta.brief`), **Bài học** (lesson.md + code + chạy test + gia sư), **Phỏng vấn thử** |

Lần đầu mở bài đầu tiên của một project chưa học (chưa có cờ `intro:<PID>` trong localStorage) → tự chuyển sang trang giới thiệu project. Bài `planned` không có link. Tab mặc định: Bối cảnh khi chưa bắt đầu, Bài học khi đã bắt đầu.

### API (`app/main.py`)
| Method | Path | Mục đích |
|---|---|---|
| GET | `/api/roadmap` | Roadmap + `status`, `product_nodes`, `duration_min` mỗi bài; `learned`/`lessons` mỗi concept; `summary`, `workspace_root`, `platform`, `has_key` |
| GET | `/api/lessons/{id}` | `meta`, `markdown`, `workspace_path`, `workspace_exists`, `status`, `progress` (checklist, last_test, passed). 404 nếu không có bài |
| POST | `/api/lessons/{id}/start` | Copy starter → workspace, đặt `started`. 403 nếu locked/planned |
| POST | `/api/lessons/{id}/test` | Chạy pytest; `passed=true` khi `ok`. 400 nếu chưa có workspace/test; 403 nếu locked |
| POST | `/api/lessons/{id}/checklist` | Body `{index, done}`; 400 nếu index ngoài phạm vi |
| POST | `/api/lessons/{id}/unlock` | Mở khóa thủ công, trả `{status}` |
| POST | `/api/tutor` | Body `{lesson_id, messages}` → gia sư Socratic |
| POST | `/api/interview/grade` | Body `{lesson_id, question, answer}` → `{score, strengths, gaps, better_answer}`; 400 nếu answer rỗng |
| GET | `/`, `/index.html` | Trang SPA; còn lại là `StaticFiles` của `web/` |

Lỗi LLM: thiếu key → 503 `{error, no_key: true}`; lỗi gọi model → 502.

## 3. Dữ liệu
### `curriculum/roadmap.json`
```
title
concept_groups: [{id, title}]                 # python, llm, data, rag, agent, ops
concepts:       [{id, title, group}]          # API thêm learned, lessons
concept_edges:  [[from_id, to_id], ...]
product_map:    {nodes: [{id, title}], edges: [[from, to], ...]}
projects: [{
  id, title, track,
  brief: {goal, deliverable, promise, can_do[],
          showcase: {caption, markdown}, cv_line?},
  lessons: [{id, title, goal, status: "ready"|"planned", concepts[]?}]
}]
```

- `concepts` ở lesson chỉ dùng cho bài `planned` (bài `ready` lấy từ `meta.json`).
- `status` trong file chỉ là `ready|planned`; API ghi đè bằng trạng thái tính toán (mục 4).
- 
### `L*/meta.json`
```
id, title, goal, duration_min, entry, concepts[]
checklist[]                  # tự kiểm tra, tick lưu theo index
interview_questions[]
tutor_notes                  # chỉ gửi cho gia sư, không hiển thị
tasks: [{fn, signature, summary, example, test_prefix}]
brief: {
  context, problem,
  requirements: [{task, purpose}],
  deliverable, constraints[], product_nodes[],   # node id trong product_map
  workflow: {flow: "chain"|"parallel",
             inputs:  [{label, detail}],
             steps:   [{task, label}],           # task = tasks[].fn
             outputs: [{label, detail}]}
}
```

`brief` là tùy chọn (thiếu thì không có tab Bối cảnh). Starter dùng tên trong `entry`.

### `lesson.md`
6 mục H2, theo thứ tự:

1. `🎯 Mục tiêu`
2. `📋 Đề bài`
3. `🤔 Tại sao? (kiến thức nền)`
4. `🛠️ Làm` — gồm `### Bước N — ...`
5. `✅ Tự kiểm tra`
6. `🎤 Câu hỏi phỏng vấn` — chỉ chứa callout `> 🎯 **Phỏng vấn hay hỏi:** ...`; `app.js` tách ra hiển thị ở tab Phỏng vấn thử, không hiện trong tab Bài học.

Thành phần: callout blockquote (`> 🧠 Ghi nhớ`, `> 💡 Mẹo`, `> ⚠️ Lỗi hay gặp`, `> 🎯 Phỏng vấn hay hỏi`), thẻ demo gồm khối ` ```python ` + ` ```output `, sơ đồ ` ```mermaid ` `flowchart TD`.

## 4. Trạng thái, chấm test, AI
### Trạng thái bài (`compute_status`, `all_statuses`)
Duyệt phẳng các bài theo thứ tự lộ trình:

| Trạng thái | Điều kiện (xét theo thứ tự) |
|---|---|
| `planned` | `status == "planned"` (bị bỏ qua khi xét "bài trước") |
| `passed` | `progress.passed` |
| `locked` | không phải bài đầu, bài trước chưa `passed`, chưa `unlocked` thủ công |
| `in_progress` | `started` hoặc thư mục workspace tồn tại |
| `not_started` | còn lại |

Qua bài = `ok` (returncode 0, không fail, ≥1 test pass). Khái niệm `learned` = hợp `meta.concepts` của các bài đã `passed`.

### Chấm test (`runner.py`)
- `python -m pytest curriculum/<id>/tests` với `cwd = workspace/<id>`, `PYTHONPATH` có workspace; timeout 60 giây (`timeout: true`).
- Trả `{passed, failed, total, ok, timeout, tests[{name, outcome, message}], output}`; `tests` đọc từ junitxml, bỏ test bị skip; `output` cắt tối đa 6000 ký tự, message tối đa 300.
- Test không được gọi mạng: dùng client giả, đồng hồ giả.

### Gia sư AI & chấm phỏng vấn (`llm.py`)
| Việc | Model | Ghi chú |
|---|---|---|
| Gia sư (`/api/tutor`) | `nvidia/nemotron-3-super-120b-a12b` | Socratic, ~120 chữ, không viết code hàm bài tập; ngữ cảnh = meta + lesson.md + file workspace (cắt 6000 ký tự), 20 tin nhắn cuối |
| Chấm phỏng vấn | `nvidia/nemotron-3-ultra-550b-a55b`, `temperature=0.2` | JSON `{score 0–10, strengths, gaps, better_answer}`, cache đĩa |
| Dự phòng | `z-ai/glm-5.3-flash` | Khi model chính lỗi sau 4 lần thử |

- Client OpenAI-compatible tới `https://integrate.api.nvidia.com/v1`, tắt thinking. Retry với backoff `2^n` giây cho 429, 5xx, lỗi mạng.
- Cache: khóa `sha256(model + messages + params)` trong `cache/llm/`; chỉ chấm điểm bật cache.
- **API key**: biến môi trường `NVIDIA_API_KEY` hoặc dòng `NVIDIA_API_KEY=nvapi-...` trong `.env` ở gốc repo (còn đọc `academy/.env` cho bản cũ). Giá trị mẫu chứa `...` bị coi là chưa có key.
- **Không có key**: app vẫn chạy; roadmap trả `has_key: false`; `/api/tutor` và `/api/interview/grade` trả 503 kèm hướng dẫn tiếng Việt.

## 5. Quy ước viết bài
**Giọng văn**
- Brief chuyên nghiệp kiểu quản lý giao việc: bối cảnh, vấn đề, yêu cầu, deliverable, ràng buộc.
- Không role-play/nhân vật, không so sánh với JavaScript.
**Demo và starter**
- Ví dụ demo dùng miền dữ liệu không liên quan (trái cây, điểm số...) và không bao giờ lộ đáp án phần TODO.
- Starter giữ nguyên signature + docstring, thân hàm `raise NotImplementedError`.
- Docstring nêu đủ mọi yêu cầu mà test kiểm tra (học viên không phải đoán).
- Lời giải tham chiếu để ngoài repo, không commit.
**Nhiều cách giải: vòng lặp cơ bản luôn đi trước**
- Học viên chưa quen cú pháp viết tắt của Python. Mọi demo có xử lý dữ liệu đều có **Cách 1** viết bằng `for` / `while` / `if-else` cơ bản: mỗi dòng một việc, biến trung gian có tên rõ, có comment ngắn khi cần.
- Cách viết gọn hoặc dùng thư viện (comprehension, `lambda`, `sorted(key=)`, `Counter`, `any/all`, `zip`, generator, pandas vectorized, numpy…) chỉ là **Cách 2, Cách 3…**, đặt ngay sau Cách 1, đầu ra giống hệt. Lần đầu một cú pháp viết tắt xuất hiện trong khóa, phải chỉ ra nó tương đương đoạn vòng lặp nào.
- Tiêu đề mỗi cách: `**Cách 1 — vòng lặp for**`, `**Cách 2 — list comprehension**`…
- Sau các cách là callout `> ⚖️ **So sánh:** …`. Nó nói cách sau tốt hơn ở đâu: độ phức tạp Big-O (vd. `list.count()` trong vòng lặp O(n²) → dict O(n); `x in list` O(n) → `x in set` O(1)), tốc độ thực (vòng lặp chạy trong C của numpy/pandas), bộ nhớ (generator), hay chỉ gọn hơn. Nếu cùng Big-O thì ghi rõ "cùng O(n), chỉ gọn hơn". Không phóng đại.
- Khi viết tắt khiến code khó đọc hơn, nói thẳng điều đó và khuyên dùng Cách 1.
- Docstring và gợi ý TODO trong starter không ép một cách viết cụ thể; test chỉ kiểm tra kết quả.
**Brief và workflow**
- `tasks[].fn` khớp từng `workflow.steps[].task`, mỗi fn đúng một lần.
- `workflow.inputs` và `outputs` không rỗng; `flow` là `chain` hoặc `parallel`.
- Mỗi `label` ≤ 6 từ, mỗi `detail` ≤ 8 từ (ép bởi `tests_app/test_api.py::test_real_curriculum_workflows_cover_tasks`).
- `brief.product_nodes` là id có trong `roadmap.product_map.nodes`.
**Khái niệm**
- Mọi id trong `meta.concepts` (và `concepts` của bài planned) phải có trong `roadmap.concepts`.

## 6. Kiểm thử
```bash
cd academy && python3 -m pytest tests_app -q
```

- `test_api.py`: API, trạng thái/mở khóa, thiếu key, brief/workflow (cả `meta.json` thật), asset hash.
- `test_llm.py`: retry, fallback, cache, parse JSON, key. `test_runner.py`: pass/fail, junit, roadmap concept.
- `conftest.py` dựng curriculum tạm trong `tmp_path` qua `ACADEMY_ROOT`; không gọi mạng.
- Test của từng bài (`curriculum/L*/tests/`) chạy qua nút "Chạy test" trong app, không thuộc lệnh trên.
