# RESEARCH — Nguyên tắc làm việc với agent

Mục tiêu: hoàn thành việc chính xác với ít token Claude nhất. Claude là bộ não điều phối; việc khối lượng lớn đẩy xuống subagent rẻ hơn hoặc model NVIDIA miễn phí.

## 1. Phân tầng thực thi

| Tầng | Ai làm | Dùng khi |
|---|---|---|
| 0 | Claude (main loop) làm trực tiếp | Việc nhỏ, 1 lệnh, 1 file đã biết vị trí, quyết định cần ngữ cảnh hội thoại |
| 1 | Subagent `haiku` | Tra cứu nhanh, tìm file, đọc lướt nhiều file và trả về kết luận |
| 2 | Subagent `sonnet` (executor) | Viết/sửa code nhiều file, nghiên cứu web có nguồn |
| 3 | Subagent `opus` (architect/critic/verifier) | Thiết kế kiến trúc, review, kiểm chứng trước khi báo xong |
| N | Model NVIDIA qua API (miễn phí, ~40 RPM/model) | Việc văn bản cơ học khối lượng lớn: tóm tắt, dịch, trích xuất, phân loại, sinh nháp, embedding — xem `docs/nvidia-build-research.md` |

Quy tắc chọn: chọn tầng **thấp nhất** đủ chất lượng. Nâng tầng khi kết quả sai, không nâng "cho chắc".

## 2. Nguyên tắc tiết kiệm token

1. **Subagent trả kết luận, không trả dữ liệu thô.** Prompt luôn ghi rõ định dạng trả về và giới hạn độ dài (vd. "≤15 dòng, kèm đường dẫn file:dòng").
2. **Giao tiếp qua file.** Kết quả trung gian lớn ghi vào `work/<task>/`; giữa các agent chỉ truyền đường dẫn.
3. **Không đọc lại** những gì đã có trong hội thoại hoặc đã ghi vào file kết quả.
4. **Song song** các việc độc lập trong cùng một lượt gọi tool.
5. **Cache mọi lời gọi NVIDIA** ra đĩa (key = hash của model + prompt); không gọi lại cùng input.
6. **Prompt cho model NVIDIA phải tự đủ** — chúng không thấy hội thoại. Ghi rõ đầu vào, nhiệm vụ, định dạng đầu ra (ưu tiên JSON).

## 3. Chọn model NVIDIA

| Việc | Model mặc định | Dự phòng |
|---|---|---|
| Phân loại / trích xuất / tóm tắt ngắn | `nvidia/nemotron-3.5-lightning-30b-a3b` (tắt thinking) | `z-ai/glm-5.3-flash` |
| Viết nháp, tóm tắt dài, xử lý tài liệu lớn | `nvidia/nemotron-3-super-120b-a12b` | `z-ai/glm-5.3-flash` |
| Suy luận khó, code, tool calling | `nvidia/nemotron-3-ultra-550b-a55b` | `deepseek-ai/deepseek-v4.1-flash`, `z-ai/glm-5.3` (chậm) |
| Ảnh | `moonshotai/kimi-k3` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` |
| PDF → cấu trúc | `nvidia/nemotron-parse-2.0` | — |
| Embedding | `nvidia/nemotron-3-embed-1b` | `nvidia/nv-embedqa-mistral-7b-v2` |

Probe 2026-10-13 (1 mẫu, câu tiếng Việt ngắn — tất cả đúng): nhanh = Super 1.3s, GLM-5.3-flash 1.4s, Ultra 3.8s, Lightning 6.2s, Laguna 7.6s; chậm = Gemma-4 24s, DeepSeek-V4.1-flash 48s, GLM-5.3 52s, gpt-oss-20b 55s, Kimi-K3 128s (chỉ dùng khi cần ảnh). Cần đo lại trên bài toán thật.

Giới hạn ~40 RPM là **theo từng model**: khi chạy batch lớn, chia tải sang 2–3 model cùng tầng; luôn retry với backoff khi gặp `429`.

## 4. Kiểm soát chất lượng

- Output của model NVIDIA là **bản nháp chưa tin cậy**. Claude kiểm tra mẫu (hoặc toàn bộ nếu là kết quả quan trọng) trước khi dùng.
- Không ai tự duyệt việc của chính mình: viết và review là hai lượt riêng.
- Trước khi báo hoàn thành: chạy kiểm tra thật, có bằng chứng.

## 5. Bảo mật

- API key chỉ nằm trong `.env` (`NVIDIA_API_KEY=nvapi-...`) hoặc biến môi trường. Không ghi key vào code, log, hay tài liệu.
- Dữ liệu gửi lên build.nvidia.com là gửi ra bên ngoài — không gửi dữ liệu nhạy cảm khi chưa được đồng ý.
