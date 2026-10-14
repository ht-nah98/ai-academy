# AI Academy — Brief bài toán (thay cho "story layer" có nhân vật)

Phản hồi giáo viên (2026-10-14, lần 2): bỏ toàn bộ nhân vật, hội thoại, đóng vai — đọc như kịch bản trẻ con, người đi làm thấy khó chịu. Viết như **một engineering manager giao việc**: bối cảnh, bài toán, mỗi hàm cần để làm gì, mục tiêu cuối. Ngắn, chính xác, tôn trọng người đọc. Đưa đề bài; cách giải là việc của người làm.

## Giọng văn
- Không nhân vật, không "chị/em", không cảm thán, không emoji trong nội dung brief.
- Câu khẳng định, ngắn. Thuật ngữ chuẩn ngành (giữ tiếng Anh khi đó là cách người đi làm nói).
- Mỗi trường có giới hạn độ dài bên dưới; vượt là sai.

## Dữ liệu

### `roadmap.json`
- Giữ `product_map` (nodes, edges).
- `projects[].story` → đổi tên thành `projects[].brief`:
```json
{"goal": "1 câu: project này giải quyết vấn đề gì của sản phẩm",
 "deliverable": "1 câu: đầu ra cụ thể khi xong project"}
```

### `meta.json` (mỗi bài) — `story` → `brief`
```json
"brief": {
  "context": "≤ 2 câu: hiện trạng sản phẩm/dữ liệu trước bài này",
  "problem": "≤ 2 câu: bài toán cần giải, có số liệu cụ thể nếu có",
  "requirements": [
    {"task": "filter_by_skill", "purpose": "≤ 1 câu: hàm này phục vụ việc gì trong sản phẩm"}
  ],
  "deliverable": "≤ 2 câu: đầu ra cuối cùng và tiêu chí nghiệm thu (vd. qua 15 test, chạy được trên dữ liệu thật)",
  "constraints": ["≤ 4 gạch đầu dòng: ràng buộc kỹ thuật thật (không sửa input, xử lý None, offline test, rate limit...)"],
  "product_nodes": ["analytics"],
  "workflow": {
    "flow": "chain | parallel",
    "inputs":  [{"label": "JOBS", "detail": "8 tin, list[dict]"}],
    "steps":   [{"task": "filter_by_skill", "label": "Lọc tin theo kỹ năng"}],
    "outputs": [{"label": "5/8 tin ở HCM", "detail": "count_by_city"}]
  }
}
```
- `workflow` (thêm 2026-10-14, lần 3): sơ đồ "Luồng xử lý". `steps` đúng 1:1 với `meta.tasks[].fn`, xếp theo luồng dữ liệu (vd. L07 parse_* → clean_jobs; L10 quality_checks → split_rejects → upsert_jobs → run_pipeline). `flow: "parallel"` khi các hàm độc lập trên cùng đầu vào (L01, L09), mặc định `chain`. `label` ≤ 6 từ, `detail` ≤ 8 từ; số liệu ở `outputs` phải là kết quả thật của bài. Test `tests_app/test_api.py::test_real_curriculum_workflows_cover_tasks` kiểm tra cả 10 bài.
- `requirements`: đúng 1 mục cho mỗi `meta.tasks[].fn`.
- Xóa hẳn trường `story` cũ.

### `lesson.md`
Không nhắc tới nhân vật (Minh, Lan, Tuấn) hay "thực tập sinh". Intro trước H2 đầu: tối đa 1 câu hoặc bỏ.

## UI — tab "Bối cảnh" (giữ tên tab) — bản 3 (2026-10-14)
Phản hồi giáo viên lần 3: tab hiện như chữ thô (do trình duyệt giữ `style.css` cũ) và cần đầu mục + workflow rõ ràng. Trình bày như một trang đặc tả kỹ thuật, cột tối đa 1040px:
1. **Header**: nhãn `P0 · Khởi động Python` + `meta.goal` một dòng đậm; nút nhỏ "Bắt đầu làm →"/"Tiếp tục →" bên phải (ẩn < 760px). Bài đầu project: khối 2 cột "Mục tiêu project" / "Đầu ra project".
2. Các mục đánh số `01…06`, mỗi mục có icon SVG nét mảnh (không emoji):
   - **01 Bối cảnh** + **02 Bài toán**: hai thẻ cạnh nhau khi rộng ≥ 760px (container query), xếp chồng khi hẹp; Bài toán nhấn mạnh (viền amber trên, nền amber nhạt, chữ đậm).
   - **03 Luồng xử lý**: `Đầu vào → Xử lý → Đầu ra` bằng HTML/CSS grid + mũi tên CSS; < 820px xếp dọc, mũi tên chỉ xuống. Mỗi hàm 1 ô: số thứ tự, `fn()`, `label`, `purpose` (từ `requirements`), badge test (`x/y test` hoặc "chưa chạy"). `chain` có đường nối giữa các bước; `parallel` không nối, 2 cột khi đủ rộng. Bảng "Cần xây" cũ bị bỏ (đã gộp vào ô hàm). Không có `workflow` → chỉ hiện cột Xử lý theo thứ tự `requirements`.
   - **04 Đầu ra & nghiệm thu**: `deliverable` tách theo câu thành checklist (icon check; tô xanh khi bài đã qua). **05 Ràng buộc**: danh sách dạng cảnh báo (viền amber). Hai thẻ cạnh nhau khi rộng.
   - **06 Vị trí trong hệ thống**: sơ đồ sản phẩm; cột hẹp (ô < 130px) tăng chiều cao ô, nhãn tới 4 dòng, không chồng/cắt chữ ở 1440/1100/390.
3. Nút chính "Bắt đầu làm →"/"Tiếp tục →" cuối trang.
Sáng/tối đủ; không cuộn ngang ở 390px.

## Chống CSS/JS cũ trong cache
`GET /` và `/index.html` do `app/main.py::render_index` phục vụ: mọi `href/src` nội bộ `.css/.js` được gắn `?v=<sha1(nội dung)[:10]>`, băm lại khi mtime/size đổi; header `Cache-Control: no-cache`. Sửa `style.css` → URL đổi → trình duyệt buộc tải bản mới dù đang giữ bản cũ. Test: `test_index_versions_assets_by_content_hash`.

Thẻ nhiệm vụ ở tab Bài học: dòng "Mục đích: <purpose>" (thay "Trả lời: ...").
Trang chủ timeline: hiện `brief.goal`.
Không có `brief` → ẩn tab.
