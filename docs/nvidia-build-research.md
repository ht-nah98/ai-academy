# Nghiên cứu nền tảng NVIDIA build.nvidia.com

Cập nhật: 2026-10-13. Danh sách model lấy trực tiếp từ `GET https://integrate.api.nvidia.com/v1/models` (80 model).
Thông số đánh dấu ⚠ là từ nguồn bên thứ ba, chưa kiểm chứng bằng API key.

## 1. Cách gọi API

| Mục | Giá trị |
|---|---|
| Base URL (LLM, embedding) | `https://integrate.api.nvidia.com/v1` — tương thích OpenAI SDK |
| Chat | `POST /v1/chat/completions` (hỗ trợ `stream`, `tools`, `tool_choice`) |
| Embedding | `POST /v1/embeddings` (cần thêm `input_type`: `query` / `passage`) |
| Rerank | `POST https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking` (host khác) |
| Auth | `Authorization: Bearer nvapi-...` |
| Liệt kê model | `GET /v1/models` (không cần key) |

```python
from openai import OpenAI
client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=os.environ["NVIDIA_API_KEY"])
r = client.chat.completions.create(
    model="nvidia/nemotron-3-super-120b-a12b",
    messages=[{"role": "user", "content": "..."}],
    temperature=1.0, top_p=0.95, max_tokens=4096,
    extra_body={"chat_template_kwargs": {"enable_thinking": False}},  # tắt reasoning (Nemotron 3)
)
```

### Bật/tắt reasoning (khác nhau theo model)
- **Nemotron 3 (Super/Ultra/Nano)**: `extra_body.chat_template_kwargs.enable_thinking` = true/false; Ultra có thêm `medium_effort: true` để rút ngắn suy luận, và `force_nonempty_content: true` khuyến nghị cho coding agent.
- **Kimi K3**: luôn suy nghĩ, không tắt được; chỉnh mức effort low/high/max. Khi gọi tool nhiều lượt **phải gửi lại nguyên assistant message gồm `reasoning_content` và `tool_calls`**.
- **Model khác (GLM, DeepSeek, gpt-oss)**: cần thử bằng `scripts/nv_probe.py`, mỗi hãng một kiểu.

## 2. Giới hạn sử dụng (free tier)

- ⚠ **~40 request/phút cho mỗi model**, tính theo tài khoản; vượt thì trả `429` kèm `Retry-After`. Moderator NVIDIA nói không có cách chính thức để tăng ở tier miễn phí.
- ⚠ Credit: các nguồn mâu thuẫn nhau (1.000 credit ban đầu / đã bỏ hệ credit). → **Kiểm tra trong trang tài khoản của bạn.**
- Hệ quả thiết kế: giới hạn là **theo model**, nên chia việc song song ra nhiều model khác nhau thì tổng throughput tăng. Luôn có retry + backoff, và cache kết quả ra đĩa.
- Free tier dành cho prototype/thử nghiệm, không phải production.

## 3. Phân loại model theo vai trò

### Tier A — Suy luận nặng, agent, context ~1M
| Model ID | Ghi chú |
|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b` | MoE 550B/55B active, 1M ctx, tool calling, bật/tắt reasoning. Mạnh nhất họ NVIDIA, dùng làm "planner/orchestrator". |
| `moonshotai/kimi-k3` | 1M ctx, **nhận ảnh**, luôn thinking. ⚠ Artificial Analysis 44 điểm (cao nhất nhóm). Chậm, tốn token suy nghĩ. |
| `z-ai/glm-5.3` | ⚠ Mạnh về agentic/coding (Terminal-Bench 3.0 ~28). |
| `deepseek-ai/deepseek-v4.1-flash` | ⚠ 1M ctx, **~200 tok/s**, tool use tốt (Terminal-Bench 3.0 ~30). Lựa chọn tốt nhất về tốc độ/chất lượng. |
| `moonshotai/kimi-k2.6` | Thế hệ trước của K3, dự phòng. |

### Tier B — Workhorse nhanh, cho việc khối lượng lớn
| Model ID | Ghi chú |
|---|---|
| `nvidia/nemotron-3-super-120b-a12b` | 120B/12B active, hybrid Mamba-MoE, 256k–1M ctx, tool calling. Cân bằng tốt. |
| `z-ai/glm-5.3-flash` | ⚠ AA 42 điểm nhưng chậm (~61 tok/s). |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | Nhỏ, rất nhanh — phân loại, trích xuất, tóm tắt. |
| `nvidia/nemotron-nano-3-30b-a3b` | Tương tự, bản trước. |
| `openai/gpt-oss-20b` | Nhỏ, có reasoning effort. |
| `google/gemma-4-31b-it` | Dense 31B, đa ngôn ngữ tốt (tiếng Việt cần thử). |

### Chuyên dụng
| Nhu cầu | Model ID |
|---|---|
| Code | `deepseek-ai/deepseek-v4.1-flash`, `z-ai/glm-5.3`, `poolside/laguna-xs-2.1` (⚠ chưa rõ thông số) |
| Ảnh / đa phương thức | `moonshotai/kimi-k3`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `meta/llama-3.2-90b-vision-instruct` |
| Video / suy luận vật lý | `nvidia/cosmos-reason2-8b` |
| Đọc PDF/tài liệu → cấu trúc | `nvidia/nemotron-parse-2.0` |
| Embedding (RAG) | `nvidia/nemotron-3-embed-1b`, `nvidia/llama-nemotron-embed-vl-1b-v2` (cả ảnh), `nvidia/nv-embedqa-mistral-7b-v2` |
| Rerank | qua endpoint reranking (model không nằm trong `/v1/models`, cần kiểm tra) |
| Dịch | `nvidia/riva-translate-4b-instruct-v2` |
| An toàn nội dung | `nvidia/nemotron-3.5-content-safety`, `meta/llama-guard-4-12b` |
| Reward / chấm điểm | `nvidia/nemotron-4-340b-reward` |

### Không nên dùng (cũ)
`meta/llama2-70b`, `meta/codellama-70b`, `google/gemma-2b`, `mistralai/mistral-7b-instruct-v0.3`, `databricks/dbrx-instruct`, `01-ai/yi-large`, `adept/fuyu-8b`… — có model tốt hơn ở mọi vai trò.

## 4. Lưu ý

- `/v1/models` trả 80 model nhưng trang web có thêm (rerank, gliner-pii, jailbreak-detect…) với endpoint riêng — xem trang reference của từng model trên `docs.api.nvidia.com`.
- Tham số khuyến nghị cho Nemotron 3: `temperature=1.0`, `top_p=0.95`.
- Điểm benchmark từ các nguồn khác nhau đo bằng harness/effort khác nhau — không so sánh trực tiếp được. Cần tự đánh giá trên bài toán thật.

## 5. Việc còn lại

- [ ] Chạy `scripts/nv_probe.py` với API key để xác nhận model nào gọi được, độ trễ, và rate limit thực tế.
- [ ] Đánh giá chất lượng tiếng Việt của các model Tier B trên bài toán thật.

## Nguồn
- https://integrate.api.nvidia.com/v1/models
- https://docs.api.nvidia.com/nim/reference/llm-apis
- https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b
- https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3
- https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b/modelcard
- https://forums.developer.nvidia.com/t/request-for-nvidia-build-api-rate-limit-increase-40-rpm-200-rpm/377433
- https://decodethefuture.org/en/nvidia-nim-api-pricing-limits-guide/
- https://artificialanalysis.ai/models/comparisons/deepseek-v4-1-flash-vs-glm-5-3-flash
- https://openrouter.ai/compare/deepseek/deepseek-v4.1-flash/moonshotai/kimi-k3
