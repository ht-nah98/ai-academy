# AI Academy — Thiết kế (trạng thái hiện tại)

Nguồn sự thật: code trong `academy/app/`, `academy/web/app.js`, `academy/curriculum/`, `academy/courses/`.

## 1. Mục đích & người học
- AI Academy là **nền tảng nhiều khóa học**: một server (cổng 8100) phục vụ mọi khóa; trang đầu là Thư viện khóa học, mỗi khóa có lộ trình, bài làm và tiến độ riêng. Mục dưới mô tả khóa đầu tiên (AI & Data); khóa Node.js & WebSocket cùng khuôn, xây sản phẩm TeamPulse.
- 1 học viên, chuẩn bị phỏng vấn thực tập AI Engineer / Data Engineer, lộ trình 3–4 tuần.
- Học qua project: sản phẩm xuyên suốt **JobRadar** (làm sạch, lưu, phân tích, trích xuất bằng LLM, RAG, agent, triển khai).
- Mỗi bài: đọc bối cảnh, viết code theo starter, chấm bằng test cục bộ, tự kiểm tra, luyện phỏng vấn với người chấm AI.
- Chạy cục bộ; LLM dùng model miễn phí trên build.nvidia.com.

## 2. Kiến trúc
FastAPI (`academy/app/`) phục vụ `/api/*` và SPA JS thuần (`academy/web/`, không build step). Chạy bằng `academy/run.sh` (hoặc `start.sh`/`start.ps1` ở gốc repo): một lệnh, không tham số khóa, cổng 8100 (tham số cũ như `node` được bỏ qua kèm thông báo). Các script này `npm install` cho mọi `academy/courses/<id>/` có `package.json` mà chưa có `node_modules/`.

| Thư mục (`academy/`) | Vai trò |
|---|---|
| `curriculum/` | Nội dung bài khóa `ai`, chỉ đọc: `roadmap.json` + `L*/{meta.json, lesson.md, starter/, tests/}` |
| `workspace/<lesson_id>/` | Code của học viên, copy từ `starter/` khi bấm "Bắt đầu" (không ghi đè nếu đã có) |
| `data/progress.json` | Tiến độ (ghi nguyên tử qua file `.tmp`, có khóa luồng) |
| `cache/llm/` | Cache lời gọi LLM: `<sha256>.json` |
| `courses/<id>/` | Mỗi khóa khác: `curriculum/`, `workspace/`, `data/`, `cache/` cùng vai trò như trên (+ `package.json`, `node_modules/` nếu là khóa Node) |
| `datasets/` | Dữ liệu tin tuyển dụng giả lập dùng trong bài |
| `web/` | `index.html`, `app.js`, `style.css` |

### Nhiều khóa học (`config.py`)
Khóa được dò lại ở mỗi request (vài lệnh `stat`, không cần khởi động lại khi thêm khóa) và truyền tường minh vào `curriculum`, `progress`, `runner`, `llm` dưới dạng `Course(id, root, curriculum, workspace, data, cache)`.

| id | Thư mục | Ghi chú |
|---|---|---|
| `ai` | `academy/{curriculum,workspace,data,cache}` (vị trí cũ, giữ nguyên để không mất bài làm/tiến độ) | `ACADEMY_CURRICULUM`, `ACADEMY_WORKSPACE`, `ACADEMY_DATA`, `ACADEMY_CACHE` ghi đè riêng cho khóa này |
| `<tên thư mục>` | `academy/courses/<id>/{curriculum,workspace,data,cache}` | là khóa khi có `curriculum/roadmap.json` |

- id hợp lệ: `^[a-z0-9][a-z0-9-]{0,63}$`; id sai định dạng hoặc không có `roadmap.json` → 404 `Không tìm thấy khóa học.` Thứ tự: `ai` trước, rồi theo tên thư mục. `ACADEMY_ROOT` đổi gốc (test dùng `tmp_path`), khóa được dò tương đối với gốc đó.
- `courses/node-realtime/` có `package.json` (`"type": "module"`) và `node_modules/` (vd. `ws`) ở gốc khóa, nên cả `curriculum/<id>/tests/` lẫn `workspace/<id>/` đều là ESM và resolve được thư viện. Khóa Node có `dependencies` mà thiếu `node_modules/` → "Chạy test" trả 400 hướng dẫn `npm install`. `workspace/`, `data/`, `cache/`, `node_modules/` của mọi khóa bị `.gitignore`.
- `language` (`curriculum.language(course)`) quyết định runner, prompt gia sư/chấm phỏng vấn, và chữ trên UI (lệnh chạy thử `node <entry>`, `// TODO`, nhãn "node --test"). `short_title` / `logo_mark` của roadmap đặt tên khóa ở logo, thẻ thư viện và `document.title` (`<short_title> · AI Academy`).
- localStorage của các khóa chung một origin nên key theo khóa có tiền tố `c:<khóa>:` (`intro:<PID>`, `guide:<id>`, `steps:<id>`); khóa `ai` vẫn đọc key cũ không tiền tố để học viên không bị chuyển lại trang giới thiệu. `theme`, `sideHidden` dùng chung.

**Thêm một khóa:** tạo `academy/courses/<id>/curriculum/roadmap.json` (dạng ở mục 3) và các thư mục bài; khóa Node đặt `"language": "node"` và thêm `package.json` ở `academy/courses/<id>/`. Khóa hiện ngay ở `GET /api/courses` và trang `#/`.

### Luồng request
1. Trình duyệt tải `/` → `render_index()` gắn `?v=<sha1[:10]>` nội dung file vào URL asset; mọi response mặc định `Cache-Control: no-cache`.
2. Trang `#/` gọi `GET /api/courses`; vào khóa thì SPA gọi `GET /api/c/{course}/roadmap` (cây project/bài, trạng thái, khái niệm đã học) và `GET /api/c/{course}/lessons/{id}` khi mở bài.
3. "Bắt đầu" → copy starter; "Chạy test" → `runner` chạy pytest trong workspace, lưu kết quả vào `progress.json`.
4. Gia sư / chấm phỏng vấn → `llm.chat()` → cache đĩa → API NVIDIA.

### Route frontend (hash router, `app.js`)
| Route | Nội dung |
|---|---|
| `#/` | Thư viện khóa học: mỗi khóa một thẻ (logo, tên, sản phẩm + tagline, số project/bài, thanh tiến độ, nút "Tiếp tục"/"Bắt đầu") |
| `#/c/<khóa>/` | Trang chủ khóa: tiến độ, bản đồ khái niệm, timeline project, nút "Học tiếp" |
| `#/c/<khóa>/project/<PID>` | Giới thiệu project: goal, deliverable, promise, can_do, showcase, cv_line, danh sách bài |
| `#/c/<khóa>/lesson/<id>` | 3 tab: **Bối cảnh** (nếu có `meta.brief`), **Bài học** (lesson.md + code + chạy test + gia sư), **Phỏng vấn thử** |

Hash cũ `#/lesson/<id>`, `#/project/<PID>` chuyển sang `#/c/ai/...`. Trong khóa, sidebar có link "← Tất cả khóa học" và tên khóa. Lần đầu mở bài đầu tiên của một project chưa học (chưa có cờ `intro:<PID>` của khóa trong localStorage) → tự chuyển sang trang giới thiệu project. Bài `planned` không có link. Tab mặc định: Bối cảnh khi chưa bắt đầu, Bài học khi đã bắt đầu.

### API (`app/main.py`)
| Method | Path | Mục đích |
|---|---|---|
| GET | `/api/courses` | `[{id, title, short_title, logo_mark, language, product_name, tagline, projects, lessons, passed, in_progress, planned}]` — `lessons` = số bài không `planned` |
| GET | `/api/c/{course}/roadmap` | Roadmap + `status`, `product_nodes`, `duration_min` mỗi bài; `learned`/`lessons` mỗi concept; `course`, `title`, `short_title`, `logo_mark`, `language`, `summary`, `workspace_root`, `platform`, `has_key`. Thiếu `concepts`/`concept_groups`/`concept_edges`/`projects` → `[]` |
| GET | `/api/c/{course}/lessons/{id}` | `meta`, `markdown`, `workspace_path`, `workspace_exists`, `status`, `progress` (checklist, last_test, passed). 404 nếu không có bài |
| POST | `/api/c/{course}/lessons/{id}/start` | Copy starter → workspace của khóa, đặt `started`. 403 nếu locked/planned |
| POST | `/api/c/{course}/lessons/{id}/test` | Chạy pytest hoặc `node --test` (theo `language`); `passed=true` khi `ok`. 400 nếu chưa có workspace/test, thiếu `node` hoặc thiếu `node_modules`; 403 nếu locked |
| POST | `/api/c/{course}/lessons/{id}/checklist` | Body `{index, done}`; 400 nếu index ngoài phạm vi |
| POST | `/api/c/{course}/lessons/{id}/unlock` | Mở khóa thủ công, trả `{status}` |
| POST | `/api/c/{course}/tutor` | Body `{lesson_id, messages}` → gia sư Socratic |
| POST | `/api/c/{course}/interview/grade` | Body `{lesson_id, question, answer}` → `{score, strengths, gaps, better_answer}`; 400 nếu answer rỗng |
| GET | `/`, `/index.html` | Trang SPA; còn lại là `StaticFiles` của `web/` |

Khóa không tồn tại → 404. Route cũ không có khóa (`/api/roadmap`, `/api/lessons/…`, `/api/tutor`, `/api/interview/grade`) là alias của khóa `ai` (middleware viết lại path).

Lỗi LLM: thiếu key → 503 `{error, no_key: true}`; lỗi gọi model → 502.

## 3. Dữ liệu
### `curriculum/roadmap.json`
```
title
language?: "python" | "node"                 # mặc định python
short_title?, logo_mark?                      # tên ngắn ở logo/thẻ thư viện/tiêu đề tab (mặc định title), chữ logo (mặc định "AI" / "JS" theo language)
product?: {name, tagline, problem, pains[], questions[], promise}   # khối giới thiệu sản phẩm ở trang chủ
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
**Python** (mặc định)
- `python -m pytest curriculum/<id>/tests` với `cwd = workspace/<id>`, `PYTHONPATH` có workspace; timeout 60 giây (`timeout: true`).
- Trả `{passed, failed, total, ok, timeout, tests[{name, outcome, message}], output}`; `tests` đọc từ junitxml, bỏ test bị skip; `output` cắt tối đa 6000 ký tự, message tối đa 300.
- Test không được gọi mạng: dùng client giả, đồng hồ giả.

**Node** (`language: "node"`)
- `node --test --test-force-exit --test-reporter=junit --test-reporter-destination=<tmp>/report.xml --test-reporter=spec --test-reporter-destination=stdout curriculum/<id>/tests/*.test.js`, `cwd = workspace/<id>`, env `NODE_ENV=test`, `FORCE_COLOR=0`, `NO_COLOR=1`; timeout 60 giây, chạy trong process group riêng và giết cả cây khi quá giờ. Không có `node` → 400 với hướng dẫn cài Node.js ≥ 22.
- Cùng dạng kết quả như Python. `passed/failed` đếm từ junit (không đọc text); `output` là bản spec.
- Ánh xạ junit của Node 22: `name` = tên `test()`; test trong `describe('X')` thành `X › tên test` (nên `tasks[].test_prefix` khớp được theo tên describe); test `skip`/`todo` bị bỏ. `message` = dòng đầu của thông báo assert (vd. `assert.equal(a, b, 'add(1, 2) phải trả 3')` → `add(1, 2) phải trả 3`); thông báo tự sinh kết thúc bằng `:` được nối dòng sau (`Expected values to be strictly equal: 0 !== 3`).
- File test không nạp được (lỗi cú pháp, thiếu export trong code học viên): node báo 1 testcase mang tên đường dẫn file → `{name: "<file>.test.js", outcome: "error", message: "SyntaxError: ..."}` (dòng lỗi đầu tiên trong output).

**Quy ước test khóa Node**
- File `curriculum/<id>/tests/*.test.js`, ESM (`import`), chỉ dùng `node:test` + `node:assert/strict` (+ thư viện trong `node_modules` của khóa, vd. `ws`).
- Nạp code học viên theo `process.cwd()`: `const mod = await import(pathToFileURL(join(process.cwd(), '<entry>')).href);` (`pathToFileURL` từ `node:url`, `join` từ `node:path`).
- Mỗi assert có thông báo tiếng Việt ngắn ở tham số cuối; tên test bắt đầu bằng `tasks[].test_prefix` (hoặc nằm trong `describe('<test_prefix>')`).
- Server HTTP/WebSocket trong test: `listen(0, '127.0.0.1')` (cổng ngẫu nhiên, chỉ loopback), đọc cổng từ `server.address().port`, đóng mọi socket/server trong `after()`/`t.after()`. Không gọi mạng ngoài.
- Starter: giữ `export function ...` + JSDoc nêu đủ yêu cầu test kiểm tra, thân `throw new Error('TODO')` hoặc giá trị rỗng có `// TODO`.

### Gia sư AI & chấm phỏng vấn (`llm.py`)
| Việc | Model | Ghi chú |
|---|---|---|
| Gia sư (`/api/tutor`) | `nvidia/nemotron-3-super-120b-a12b` | Socratic, ~120 chữ, không viết code hàm bài tập; ngữ cảnh = meta + lesson.md + file workspace (`.py .js .mjs .cjs .html .css .json .md .txt .sql .yaml`, bỏ `node_modules/`, `package-lock.json`; cắt 6000 ký tự), 20 tin nhắn cuối. Prompt hệ thống theo `language` (`TUTOR_SYSTEM` / `TUTOR_SYSTEM_NODE`) |
| Chấm phỏng vấn | `nvidia/nemotron-3-ultra-550b-a55b`, `temperature=0.2` | JSON `{score 0–10, strengths, gaps, better_answer}`, cache đĩa; vai người phỏng vấn theo `language` (`GRADER_SYSTEM` / `GRADER_SYSTEM_NODE`) |
| Dự phòng | `z-ai/glm-5.3-flash` | Khi model chính lỗi sau 4 lần thử |

- Client OpenAI-compatible tới `https://integrate.api.nvidia.com/v1`, tắt thinking. Retry với backoff `2^n` giây cho 429, 5xx, lỗi mạng.
- Cache: khóa `sha256(model + messages + params)` trong `cache/llm/` của khóa học (`chat(cache_dir=...)`); chỉ chấm điểm bật cache.
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

- `test_courses.py`: `/api/courses` liệt kê khóa Python + khóa Node, tiến độ/workspace/cache tách theo khóa (cùng id bài ở hai khóa), id khóa sai/lạ/traversal → 404, alias route cũ, thiếu `node_modules`, ghi đè thư mục khóa `ai` bằng env.
- `test_api.py`: API (route `/api/c/ai/...`), trạng thái/mở khóa, thiếu key, brief/workflow (cả `meta.json` thật), asset hash.
- `test_llm.py`: retry, fallback, cache, parse JSON, key. `test_runner.py`: pass/fail, junit, roadmap concept.
- `test_node.py`: khóa Node tí hon trong `tmp_path/courses/node-x/` (package.json `"type": "module"`, 1 bài, starter sai → đúng), chạy `node --test` thật qua API: tên/thông báo junit, `describe` lồng, lỗi cú pháp, timeout, thiếu `node`, file gửi gia sư, `language` mặc định `python`. Bỏ qua nếu máy không có `node`.
- `conftest.py` dựng khóa `ai` tạm trong `tmp_path` qua `ACADEMY_ROOT`; không gọi mạng.
- Test của từng bài (`curriculum/L*/tests/`) chạy qua nút "Chạy test" trong app, không thuộc lệnh trên.
