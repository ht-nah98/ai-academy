# L03 — Gọi LLM đầu tiên

> Viết hàm `ask()` gửi câu hỏi tới LLM trên build.nvidia.com và nhận câu trả lời **kèm số token đã dùng** — viên gạch nền của chatbot.

## 🎯 Mục tiêu

Sau buổi này (khoảng 3 giờ) bạn sẽ:

- Giải thích được **LLM** (Large Language Model) ở mức trực giác: **dự đoán token tiếp theo**.
- Hiểu **token**, vì sao giá và giới hạn tính theo token, và tự đo: **tiếng Việt tốn token hơn tiếng Anh**.
- Dùng **messages** với các **role** `system` / `user` / `assistant`.
- Gọi model qua **API tương thích OpenAI** và đọc trường **`usage`**.
- **Kết quả đo được:** `chat.py` qua hết **12 test** (client giả, không tốn token) và chạy thật trả lời được câu hỏi.

## 📋 Đề bài

**Mở file:** `academy/workspace/L03-goi-llm-dau-tien/chat.py`.

Bạn viết 3 hàm (thay chỗ `raise NotImplementedError`); docstring ghi rõ yêu cầu. Phần tạo client thật (`make_client`) đã viết sẵn. Model mặc định: `nvidia/nemotron-3-super-120b-a12b`.

| Hàm | Trả về |
|---|---|
| `build_messages(system, question)` | list messages: `system` (nếu có nội dung) rồi `user` |
| `ask(question, client, ...)` | dict `answer`, `prompt_tokens`, `completion_tokens` |
| `estimate_cost_usd(p, c, giá_vào, giá_ra)` | chi phí USD, giá tính theo 1 triệu token |

**Xong khi:** bấm **Chạy test** thấy `12 passed` (không cần mạng hay key), rồi `python chat.py "câu hỏi"` chạy thật được.

## 🤔 Tại sao? (kiến thức nền)

### LLM = dự đoán token tiếp theo

LLM giống **gợi ý bàn phím điện thoại** phiên bản khổng lồ: nhìn toàn bộ đoạn văn phía trước rồi đoán **token tiếp theo**, lặp lại cho tới khi đoán ra token "kết thúc".

```mermaid
flowchart LR
    A["Đoạn văn hiện tại"] --> B["LLM đoán token tiếp theo"]
    B --> C["Nối token vào cuối đoạn văn"]
    C --> D{"Token = kết thúc hoặc đủ max_tokens?"}
    D -- "Chưa" --> A
    D -- "Rồi" --> E["Trả câu trả lời"]
```

Ba hệ quả bạn sẽ gặp suốt khóa học:

- LLM không "tra cứu" sự thật; nó sinh văn bản **nghe hợp lý** nên có thể bịa (**hallucination**). Bài RAG sẽ xử lý.
- Kiến thức dừng ở thời điểm huấn luyện (training cutoff).
- Model **không nhớ** gì giữa các lần gọi; muốn nó nhớ phải gửi lại lịch sử (bài L05).

> 🎯 **Phỏng vấn hay hỏi:** "LLM có hiểu không?" — trả lời an toàn: nó là mô hình xác suất dự đoán token tiếp theo, học từ rất nhiều văn bản.

### Token

**Token** là mẩu chữ mà model đọc và viết: từ phổ biến là 1 token, từ hiếm bị cắt thành nhiều mẩu. Giá và giới hạn đều tính theo token.

- Tiếng Anh trung bình 1 token ≈ 4 ký tự ≈ ¾ từ.
- Mỗi token đầu ra là một lần chạy toàn bộ model → token ra đắt hơn token vào.
- `max_tokens` chặn độ dài câu trả lời; **context window** (bài L05) chặn tổng số token đọc một lúc.
- `prompt_tokens` luôn lớn hơn câu hỏi một chút: model bọc messages trong "khuôn" (chat template) ~16 token. Vì vậy "hi" (1 token) báo `prompt_tokens=17`.

**Tiếng Việt tốn token hơn**, vì từ điển token xây chủ yếu từ tiếng Anh. Số đo thật cùng một tin tuyển dụng (`nemotron-3-super`, đã trừ khuôn):

| Bản | Ký tự | Token |
|---|---|---|
| Tiếng Anh | 128 | ≈ 28 |
| Tiếng Việt có dấu | 153 | ≈ 46 |
| Tiếng Việt bỏ dấu | 153 | ≈ 49 |

> 🧠 **Ghi nhớ:** tiếng Việt tốn **~1,6 lần** token → sản phẩm cho người Việt đắt hơn và nhét được ít nội dung vào context hơn. Bỏ dấu không rẻ hơn mà còn mất nghĩa.

### Messages và roles

API chat không nhận một chuỗi mà nhận **danh sách messages**, mỗi cái có `role` cho biết ai nói.

| Role | Ai nói | Dùng để |
|---|---|---|
| `system` | Lập trình viên | Đặt luật chơi: vai trò, giọng văn, ngôn ngữ |
| `user` | Người dùng | Câu hỏi, yêu cầu |
| `assistant` | Model | Câu trả lời trước (khi gửi lại lịch sử) |

Tách vai trò giúp model phân biệt chỉ dẫn của nhà phát triển với nội dung người dùng gõ vào.

### API tương thích OpenAI

Gần như cả ngành (NVIDIA, Groq, vLLM, Ollama…) theo định dạng `POST /v1/chat/completions` của OpenAI, nên một thư viện `openai` gọi được tất cả — chỉ đổi `base_url`, `api_key`, `model`.

```mermaid
flowchart LR
    M["messages (system + user)"] --> T["Tách thành token"]
    T --> L["LLM trên GPU NVIDIA"]
    L --> R["response"]
    R --> C["choices[0].message.content"]
    R --> U["usage: prompt_tokens, completion_tokens"]
    R --> F["finish_reason: stop / length"]
```

- `finish_reason = "stop"`: model tự kết thúc; `"length"`: bị cắt vì chạm `max_tokens`.
- `extra_body` gửi thêm trường mà thư viện không có tham số riêng. Ta dùng nó để tắt chế độ "suy nghĩ" (thinking) cho nhanh và rẻ.
- Xem danh sách model thì miễn phí, nhưng **chạy** model tốn GPU nên cần key — thiếu key nhận HTTP 401.

### Client giả (dependency injection)

`ask()` nhận `client` làm tham số: chạy thật truyền client OpenAI, test truyền **fake client** có cùng "hình dạng" `client.chat.completions.create(...)`.

Test vì thế chạy trong vài mili-giây, không cần mạng, không tốn token và **luôn ra cùng kết quả** — điều không thể có với LLM thật, vốn trả lời khác nhau mỗi lần. Đây đúng là mẹo ở L02.

## 🛠️ Làm

### Bước 1 — Chuẩn bị

Kích hoạt venv gốc của repo (như L02): `source .venv/bin/activate` (Windows: `.venv\Scripts\Activate.ps1`). Kiểm tra `python -c "import openai; print(openai.__version__)"`. Chép file `.env` từ bài L02 sang `workspace/L03-goi-llm-dau-tien/.env` (Windows: `Copy-Item`).

> ⚠️ **Lỗi hay gặp:** `ModuleNotFoundError: openai` → chưa kích hoạt venv.

### Bước 2 — Mô phỏng "đoán từ tiếp theo"

Một "LLM đồ chơi": bảng tra từ nào hay đi sau từ nào, rồi lặp đoán:

```python
next_word = {"Data": "Engineer", "Engineer": "xây", "xây": "dựng", "dựng": "pipeline", "pipeline": "<hết>"}
text = ["Data"]
while True:
    w = next_word[text[-1]]
    if w == "<hết>":
        break
    text.append(w)
    print(" ".join(text))
```
```output
Data Engineer
Data Engineer xây
Data Engineer xây dựng
Data Engineer xây dựng pipeline
```

LLM thật làm y hệt, chỉ là "bảng tra" là một mạng nơ-ron khổng lồ nhìn **cả đoạn văn**, không chỉ từ cuối.

### Bước 3 — Messages là list các dict → `build_messages`

Ví dụ messages cho một bot dịch thuật:

```python
messages = [
    {"role": "system", "content": "Dịch sang tiếng Anh."},
    {"role": "user", "content": "Xin chào"},
]
print(len(messages), messages[-1]["role"])
print(bool("   "), bool("   ".strip()))
```
```output
2 user
True False
```

> ⚠️ **Lỗi hay gặp:** `"   "` (toàn khoảng trắng) vẫn là `True`. Phải `.strip()` rồi mới kiểm tra có nội dung hay không.

### Bước 4 — Gọi bằng keyword và đọc response → `ask`

Fake client trong test chỉ nhận **keyword arguments** (`model=..., messages=...`). Hàm `**kwargs` gom chúng thành dict:

```python
def create(**kwargs):
    print(sorted(kwargs))

create(model="m", messages=[], max_tokens=5)
```
```output
['max_tokens', 'messages', 'model']
```

Response là **đối tượng**, đọc bằng dấu chấm, không phải `["..."]`:

```python
from types import SimpleNamespace as NS
response = NS(choices=[NS(message=NS(content="  Chào bạn!  "), finish_reason="stop")],
              usage=NS(prompt_tokens=20, completion_tokens=4))
print(repr(response.choices[0].message.content.strip()))
print(response.usage.prompt_tokens, response.choices[0].finish_reason)
```
```output
'Chào bạn!'
20 stop
```

Thứ tự trong `ask`: kiểm tra câu hỏi rỗng → gọi API **đúng 1 lần** (nhớ `extra_body=EXTRA_BODY`) → lấy content → đọc usage.

> ⚠️ **Lỗi hay gặp:** `content` có thể là `None` → `None.strip()` lỗi. Coi `None` là `""`.

### Bước 5 — Tính tiền theo triệu token → `estimate_cost_usd`

Giá LLM ghi theo **1 triệu token**. Ví dụ 2.000 token với giá $3/1M:

```python
tokens, price_per_m = 2_000, 3.0
print(tokens / 1_000_000 * price_per_m)
print(round(0.1234567, 6))
```
```output
0.006
0.123457
```

Hàm của bạn cộng hai phần: token vào × giá vào + token ra × giá ra, rồi `round(..., 6)`.

### Bước 6 — Chạy thật

```bash
cd academy/workspace/L03-goi-llm-dau-tien
python chat.py "Data Engineer intern cần biết những kỹ năng gì?"
```

Bạn thấy câu trả lời và dòng `[token] prompt=... completion=...`.

| Lỗi | Nghĩa |
|---|---|
| `RuntimeError: Thiếu NVIDIA_API_KEY` / 401 | Kiểm tra file `.env` |
| HTTP 404 | Sai tên model |
| HTTP 429 | Gọi quá nhanh, đợi một phút |

### Bước 7 — Thí nghiệm token

Đo cùng một tin tuyển dụng bằng hai ngôn ngữ. `base` là số token của "khuôn":

```python
from chat import ask, make_client
client = make_client()
base = ask("hi", client, system=None, max_tokens=1)["prompt_tokens"] - 1
for q in ["We are hiring a Data Engineer intern in Ho Chi Minh City. Requirements: Python, SQL, basic knowledge of ETL pipelines and cloud.",
          "Chúng tôi đang tuyển thực tập sinh Kỹ sư dữ liệu tại Thành phố Hồ Chí Minh. Yêu cầu: Python, SQL, hiểu biết cơ bản về quy trình ETL và điện toán đám mây."]:
    r = ask(q, client, system=None, max_tokens=1)
    print(len(q), "ký tự →", r["prompt_tokens"] - base, "token")
```
```output
128 ký tự → 28 token
153 ký tự → 46 token
```

Thử thêm: số điện thoại, một đoạn code, câu có emoji. Cái nào "đắt" nhất? Rồi so `completion_tokens` khi `system=None` và khi `system="Trả lời trong đúng 1 câu."`.

> 💡 **Mẹo:** system prompt yêu cầu trả lời ngắn cũng là cách tiết kiệm chi phí.

### Bước 8 — Ước tính chi phí sản phẩm

Giá giả định $0,10/1M token vào, $0,40/1M token ra. JobRadar có 1.000 người dùng × 20 câu/ngày × 30 ngày; mỗi câu 300 token vào, 200 token ra. Một tháng tốn bao nhiêu? Dùng `estimate_cost_usd` để tính. Nếu toàn tiếng Việt (×1,6 token) thì sao?

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc từ thư mục `academy/`:

```bash
PYTHONPATH=workspace/L03-goi-llm-dau-tien python3 -m pytest curriculum/L03-goi-llm-dau-tien/tests -q
```

> 💡 **Mẹo:** Windows PowerShell: `$env:PYTHONPATH="workspace\L03-goi-llm-dau-tien"; python -m pytest curriculum\L03-goi-llm-dau-tien\tests -q`

Mục tiêu: `12 passed` — **không cần mạng, không cần key**. Sau đó chạy thật một lần (Bước 6).

- [ ] Tôi giải thích được vì sao "hi" có `prompt_tokens=17`.
- [ ] Tôi biết `finish_reason="length"` nghĩa là gì và sửa thế nào.
- [ ] Tôi có bảng số đo token tiếng Việt vs tiếng Anh của riêng mình.

## 🎤 Câu hỏi phỏng vấn

1. LLM là gì? Giải thích cơ chế "dự đoán token tiếp theo" một cách đơn giản.
2. Token là gì? Vì sao chi phí và giới hạn của LLM tính theo token chứ không theo ký tự hay từ?
3. Vì sao cùng một nội dung, tiếng Việt thường tốn nhiều token hơn tiếng Anh? Điều đó ảnh hưởng gì khi làm sản phẩm cho người Việt?
4. Các role `system`, `user`, `assistant` trong messages khác nhau thế nào?
5. "OpenAI-compatible API" nghĩa là gì? Lợi ích khi đổi nhà cung cấp model?
6. `max_tokens` dùng để làm gì? `finish_reason = "length"` nghĩa là gì?
7. Làm sao để viết unit test cho code gọi LLM mà không tốn tiền và kết quả ổn định?

> 🎯 **Phỏng vấn hay hỏi:** câu 3 là điểm cộng lớn ở Việt Nam. Trả lời bằng **số đo của chính bạn** từ Bước 7 ("em đo thử thì bản tiếng Việt tốn khoảng 1,6 lần token…"). Người phỏng vấn đánh giá cao ứng viên tự đo thay vì nhắc lý thuyết.
