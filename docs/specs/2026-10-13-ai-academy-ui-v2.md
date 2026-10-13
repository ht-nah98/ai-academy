# AI Academy — UI/UX v2

Phản hồi của giáo viên: (1) thu gọn sidebar làm vỡ layout; (2) 2 màn cùng tông màu, chữ dày đặc → "sợ chữ, sợ đọc"; (3) muốn hướng dẫn code thân thiện, kết hợp chữ + hình + demo, màu khác biệt để luôn rõ mục đích 2 bên; (4) thêm trang chủ có knowledge graph.

Nguyên tắc: **ít chữ trên màn hình cùng lúc, nhiều cấu trúc**. Mỗi khối trả lời một câu hỏi; chi tiết ẩn sau click (progressive disclosure).

## 1. Hai màn có bản sắc riêng
| | Trái — **Nhiệm vụ** ("Đề bài") | Phải — **Hướng dẫn** |
|---|---|---|
| Câu hỏi nó trả lời | "Tôi phải làm gì, đã xong chưa?" | "Làm thế nào, vì sao?" |
| Tông | nền sáng trung tính, accent **cam/amber** | nền tint **xanh lam/teal** nhạt, code block **nền tối** |
| Nội dung | thanh trạng thái test; thẻ nhiệm vụ (mỗi hàm 1 thẻ, có trạng thái đạt/chưa theo test); mục tiêu rút gọn; checklist tự kiểm tra | Tab con: **Các bước** (stepper) · **Kiến thức nền** (thẻ khái niệm) |

Dark mode: giữ sự phân biệt bằng tint khác nhau (amber vs teal) trên nền tối.

## 2. Quy ước markdown mới (nội dung ↔ UI)
Giữ 6 H2 cũ. Bên trong:
- **`## 🛠️ Làm`**: mỗi bước là `### Bước N — <tiêu đề ngắn>`. UI render thành stepper: 1 bước mở tại 1 thời điểm, nút "Bước tiếp →", tick đánh dấu xong (lưu localStorage). Mỗi bước ≤ ~80 chữ văn xuôi + code.
- **`## 🤔 Tại sao? (kiến thức nền)`**: mỗi khái niệm là `### <tên>`; **đoạn đầu tiên** sau heading là tóm tắt 1–2 câu (luôn hiện), phần còn lại ẩn sau "Xem thêm". UI render thành thẻ khái niệm.
- **Callout**: blockquote mở đầu bằng 1 trong các nhãn → hộp màu:
  `> 💡 **Mẹo:**` · `> ⚠️ **Lỗi hay gặp:**` · `> 🧠 **Ghi nhớ:**` · `> 🎯 **Phỏng vấn hay hỏi:**`
- **Sơ đồ**: khối ```` ```mermaid ```` → render bằng mermaid (flowchart/sequence). Mỗi bài ≥ 2 sơ đồ ở chỗ hình giúp hiểu nhanh hơn chữ.
- **Demo code + kết quả**: khối ```` ```python ```` ngay sau đó là khối ```` ```output ```` → UI ghép thành 1 thẻ "Code ▸ Kết quả" (code nền tối có highlight + nút copy; output nền terminal).
- Bảng: tối đa 3 cột, ≤ 8 dòng; dài hơn thì chia nhỏ hoặc chuyển thành thẻ.

## 3. `meta.json` thêm
```json
"tasks": [
  {"fn": "filter_by_skill", "signature": "filter_by_skill(jobs, skill)",
   "summary": "Lọc các tin cần kỹ năng skill (không phân biệt hoa thường)",
   "example": "filter_by_skill(JOBS, \"sql\") → 3 tin",
   "test_prefix": "test_filter"}
]
```
`test_prefix`: mọi test có tên bắt đầu bằng chuỗi này thuộc nhiệm vụ đó → thẻ nhiệm vụ hiện "3/5 test đạt".

## 4. Runner
`POST /api/lessons/{id}/test` trả thêm `"tests": [{"name": "test_filter_x", "outcome": "passed|failed|error", "message": "<assert msg ngắn>"}]` (lấy qua `--junitxml` vào file tạm). Giữ các trường cũ.

## 5. Trang chủ `#/` (mặc định)
- Hero: lời chào, tiến độ tổng (vòng tròn %), thẻ **"Tiếp tục học"** → bài đang dở/kế tiếp.
- **Lộ trình**: timeline ngang/dọc 7 project, màu theo track (AI / Data / AI×Data / Nâng cao), số bài xong/tổng.
- **Knowledge graph**: node = khái niệm (màu theo concept_group, sáng/đậm khi đã học, mờ khi chưa); cạnh = quan hệ tiên quyết từ `roadmap.json` → `concept_edges: [["token","context-window"], ...]` (from → to). Force layout (d3 v7 từ cdnjs, version cố định). Hover: tên + bài dạy nó; click: đi tới bài đầu tiên dạy khái niệm. Có chú thích màu.
- Trang `#/map` cũ: thay bằng graph này (redirect về `#/`).

## 6. Sửa lỗi
- Thu gọn sidebar: grid phải đổi template cột (vd. `grid-template-columns: 0 1fr` hoặc ẩn hẳn + main chiếm toàn bộ), không bóp main. Kiểm tra ở 1440, 1100, 900, 390px, mở & thu gọn.

## Thư viện (cdnjs, pin version)
marked 12.0.2 (đang dùng), highlight.js 11.9.0 (python, bash, json), mermaid 10.9.1, d3 7.9.0.
