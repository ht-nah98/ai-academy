# L05 — Hội thoại nhiều lượt & context window

> LLM không có trí nhớ: hôm nay bạn tự xây lịch sử hội thoại cho chatbot và **tự cắt bớt** khi vượt ngân sách token.

## 🎯 Mục tiêu

Sau buổi này (khoảng 3 giờ) bạn sẽ:

- Giải thích được vì sao LLM là **stateless** (không trạng thái) và chatbot "nhớ" bằng cách nào.
- Hiểu **context window** và vì sao chi phí hội thoại **tăng nhanh** theo số lượt.
- Viết **class** (khuôn gom dữ liệu và hàm) đầu tiên: `Conversation` giữ lịch sử.
- Cắt lịch sử theo **ngân sách token** (số token tối đa tự cho phép gửi): giữ system + các lượt mới nhất.
- **Kết quả đo được:** `conversation.py` qua hết **25 test**, và chat nhiều lượt thật trong terminal.

## 📋 Đề bài

**Mở file:** `academy/workspace/L05-hoi-thoai-context-window/conversation.py`.

| Viết | Làm gì |
|---|---|
| `class Conversation` | `add_user`, `add_assistant`, `messages()` |
| `estimate_tokens(text)` | Ước lượng token: 3 ký tự ≈ 1 token |
| `count_message_tokens(messages)` | Tổng token của cả list messages |
| `trim_history(messages, max_tokens)` | Cắt lịch sử cho vừa ngân sách |
| `chat_turn(conv, text, client)` | Một lượt: lưu, cắt, gọi API, lưu trả lời |

**Xong khi:** `25 passed`, rồi `python conversation.py` chat được nhiều lượt và thấy dòng `[lịch sử ... | gửi đi ...]` cắt bớt khi dài.

## 🤔 Tại sao? (kiến thức nền)

### Hiểu trước khi làm

**Bối cảnh.** Người dùng gõ "Mình tên An", lượt sau hỏi "Mình tên gì?" — chatbot phải trả lời được. Nhưng model quên sạch sau mỗi lần gọi API. Vì vậy chính **ứng dụng** phải giữ sổ ghi lại hội thoại và gửi lại mỗi lượt. Sổ càng dày thì càng tốn token, mà model chỉ đọc được một lượng có hạn (**context window**), nên ứng dụng phải biết cắt bớt phần cũ.

**Ví dụ đời thường.**
- **Model** giống tổng đài viên: mỗi lần bạn gọi lại là một người khác nghe máy, không biết bạn đã nói gì.
- **Lịch sử hội thoại** giống biên bản cuộc gọi: ứng dụng đọc lại biên bản cho tổng đài viên mới trước khi bạn hỏi tiếp.
- **Context window** giống mặt bàn làm việc: chỉ trải được ngần ấy trang giấy; quá chỗ thì phải cất bớt trang cũ.
- **Class** giống mẫu sổ in sẵn: `Conversation` là mẫu, mỗi cuộc chat là một cuốn sổ riêng làm từ mẫu đó.

**Bạn đã gặp nó ở đâu.**
- ChatGPT, Gemini lưu từng cuộc trò chuyện ở thanh bên; mở cuộc mới thì nó không biết chuyện cũ.
- Chat quá dài, ChatGPT hoặc Claude báo nên bắt đầu cuộc trò chuyện mới — đã chạm giới hạn context.
- Chatbot hỗ trợ của Shopee, Lazada hỏi lại mã đơn khi bạn quay lại hôm sau.
- Zalo, Messenger lưu lịch sử tin nhắn trên máy chủ: ứng dụng nhớ, không phải người nhận nhớ.

| | Trí nhớ hội thoại | Context window |
|---|---|---|
| **What** — là gì? | List messages ứng dụng lưu lại và gửi kèm mỗi lượt. | Số token tối đa model đọc trong một lần gọi. |
| **Why** — vì sao cần? | Model là **stateless**: mỗi lần gọi là mới hoàn toàn. | Vượt giới hạn thì API lỗi; nhiều token còn chậm, đắt và dễ làm model lạc ý. |
| **When** — khi nào dùng? | Mọi chatbot nhiều lượt. | Khi lịch sử dài: đặt ngân sách token và cắt. |
| **When not** — khi nào không? | Việc một lượt (dịch một câu, phân loại một tin) không cần lịch sử. | Không nhét đầy context chỉ vì model cho phép. |
| **Where** — ở đâu? | `class Conversation` trong `conversation.py`. | Hàm `trim_history`, trước mỗi lần gọi API. |
| **How** — chạy thế nào? | Thêm câu user → gửi cả list → thêm câu trả lời assistant vào list. | Giữ system và câu mới nhất, thêm dần lượt cũ hơn cho tới khi hết ngân sách. |

**Từ mới trong bài**

| Thuật ngữ | Nghĩa đời thường |
|---|---|
| stateless (không trạng thái) | Không giữ gì giữa các lần gọi |
| lượt (turn) | Một cặp người dùng hỏi – model đáp |
| lịch sử (history) | Mọi message đã có trong cuộc chat |
| context window | Giới hạn token model đọc một lần |
| ngân sách token (budget) | Số token tối đa ta tự cho phép gửi, nhỏ hơn giới hạn thật |
| cắt lịch sử (trim) | Bỏ bớt message cũ cho vừa ngân sách |
| tóm tắt hội thoại | Nhờ LLM rút các lượt cũ thành một đoạn ngắn |
| RAG (truy xuất) | Chỉ lấy đoạn tài liệu liên quan để gửi model (học ở P4) |
| class | Khuôn mẫu gom dữ liệu và các hàm thao tác trên dữ liệu đó |
| đối tượng (object) | Một "bản" cụ thể làm từ class, vd. `conv = Conversation(...)` |
| `__init__`, `self` | Hàm chạy khi tạo đối tượng / chính đối tượng đó |
| thuộc tính, phương thức | Dữ liệu `self.x` / hàm gắn với đối tượng, gọi `conv.add_user(...)` |
| `_ten` | Tên bắt đầu bằng `_` = "dùng nội bộ", bên ngoài không nên đụng |
| sao chép (copy) | Tạo list mới độc lập; `b = a` chỉ là thêm tên, không sao chép |
| `math.ceil` | Làm tròn lên |
| overhead | Phần token "khung" tốn thêm cho mỗi message |
| `reversed`, `insert(0, x)` | Duyệt từ cuối lên / chèn vào đầu list |

```mermaid
flowchart TD
    U["Người dùng gõ câu mới"] --> A["Conversation: thêm vào lịch sử"]
    A --> T["trim_history: cắt cho vừa ngân sách"]
    T --> L["Gửi bản đã cắt tới LLM"]
    L --> R["Câu trả lời"]
    R --> B["Conversation: lưu câu trả lời"]
    B --> U
```

### LLM không có trí nhớ

Model chỉ thấy đúng những messages bạn gửi lần đó; "trí nhớ" là ứng dụng gửi lại toàn bộ lịch sử mỗi lượt.

Mô phỏng bằng một "LLM đồ chơi" chỉ biết đọc messages được gửi:

```python
def toy_llm(messages):
    for m in messages:
        if "tên là" in m["content"]:
            return "Bạn tên " + m["content"].split()[-1] + "."
    return "Mình không biết bạn tên gì."

print(toy_llm([{"role": "user", "content": "Mình tên gì?"}]))
history = [{"role": "user", "content": "Mình tên là An"},
           {"role": "assistant", "content": "Chào An!"},
           {"role": "user", "content": "Mình tên gì?"}]
print(toy_llm(history))
```
```output
Mình không biết bạn tên gì.
Bạn tên An.
```

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant A as App JobRadar
    participant L as LLM
    U->>A: "Mình tên An"
    A->>L: [system, user1]
    L-->>A: "Chào An!"
    U->>A: "Mình nên học gì?"
    A->>L: [system, user1, assistant1, user2]
    Note over A,L: Gửi lại TOÀN BỘ lịch sử mỗi lượt
    L-->>A: "An nên học SQL trước..."
```

> 🎯 **Phỏng vấn hay hỏi:** "ChatGPT nhớ cuộc trò chuyện bằng cách nào?" — model không nhớ; ứng dụng lưu lịch sử và gửi lại trong mỗi request (có thể cắt hoặc tóm tắt bớt).

### Chi phí tăng theo số lượt

Vì lượt thứ N gửi lại cả N−1 lượt trước, số token **mỗi lượt** tăng dần và **tổng** token tăng gần như bình phương số lượt.

```python
per_turn = 150  # token mỗi lượt (hỏi + đáp)
total = 0
for turn in range(1, 11):
    sent = per_turn * turn  # gửi lại toàn bộ lịch sử
    total += sent
    if turn in (1, 5, 10):
        print(f"lượt {turn}: gửi {sent} token, cộng dồn {total}")
```
```output
lượt 1: gửi 150 token, cộng dồn 150
lượt 5: gửi 750 token, cộng dồn 2250
lượt 10: gửi 1500 token, cộng dồn 8250
```

10 lượt nhưng trả tiền cho 8.250 token, không phải 1.500. Hội thoại càng dài càng đắt.

### Context window

Context window tính **tổng** mọi thứ trong một lần gọi: system, lịch sử, câu hỏi và chỗ cho câu trả lời. Vượt quá thì API báo lỗi hoặc phần đầu bị bỏ.

| Thứ chiếm context | Ví dụ JobRadar |
|---|---|
| System prompt | Vai trò, luật (L04) |
| Lịch sử hội thoại | Các lượt hỏi–đáp trước |
| Tài liệu đính kèm | Tin tuyển dụng (bài RAG sau này) |
| Câu trả lời | Tối đa `max_tokens` |

> 🧠 **Ghi nhớ:** context window lớn **không** có nghĩa nên nhét đầy: càng nhiều token càng chậm, càng đắt, và model dễ "lạc" giữa đống chữ. Đặt **ngân sách** nhỏ hơn giới hạn thật.

> ⚠️ **Lỗi hay gặp:** quên rằng tiếng Việt tốn token hơn (L03: ~1,6 lần). Ước lượng 3 ký tự ≈ 1 token là con số an toàn cho tiếng Việt.

### Cắt lịch sử theo ngân sách

Cách đơn giản và phổ biến nhất: **luôn giữ system**, **luôn giữ câu mới nhất**, rồi đi ngược từ mới về cũ, thêm lượt cũ hơn chừng nào còn vừa ngân sách.

```mermaid
flowchart TD
    S["Giữ system + câu cuối"] --> N{"Còn message cũ?"}
    N -- "Không" --> E["Trả, giữ thứ tự"]
    N -- "Có" --> F{"Vẫn ≤ ngân sách?"}
    F -- "Có" --> K["Giữ, lùi tiếp"] --> N
    F -- "Không" --> E
```

Gặp message không vừa thì **dừng hẳn**, không nhảy cóc lấy message cũ hơn — nếu không hội thoại bị thủng một đoạn giữa, model hiểu sai mạch.

### Tóm tắt hội thoại

Cắt thì **mất** thông tin cũ (vd. tên người dùng nói từ lượt 1). Cách nâng cao: khi lịch sử dài, nhờ LLM **tóm tắt** các lượt cũ thành 1 message ngắn, thay cho chúng.

```mermaid
flowchart TD
    H["20 lượt ~4.000 token"] --> T["LLM tóm tắt"]
    T --> S["Tóm tắt ~150 token"]
    S --> M["system + tóm tắt + 4 lượt"]
```

| Cách | Ưu | Nhược |
|---|---|---|
| Cắt lượt cũ | Đơn giản, không tốn thêm lời gọi | Quên chuyện cũ |
| Tóm tắt | Nhớ ý chính lâu dài | Tốn thêm lời gọi, có thể tóm sai |
| Truy xuất (RAG, P4) | Chỉ lấy đoạn liên quan | Phức tạp hơn |

Bài này làm cách **cắt**; tóm tắt là bài tập mở rộng.

## 🛠️ Làm

### Bước 1 — Chuẩn bị

Kích hoạt venv gốc của repo (`source .venv/bin/activate`; Windows: `.venv\Scripts\Activate.ps1`), mở `conversation.py`. Code tự đọc key từ `.env` ở gốc repo — không cần chép. Đọc docstring của `class Conversation` trước.

### Bước 2 — Class đầu tiên → `Conversation`

**Class** gom dữ liệu (thuộc tính `self.…`) và hàm thao tác trên nó (phương thức). Ví dụ một playlist:

```python
class Playlist:
    def __init__(self, name):
        self.name = name
        self._songs = []

    def add(self, song):
        self._songs.append(song)

    def songs(self):
        return list(self._songs)

p = Playlist("Code")
p.add("Lofi 1")
s = p.songs()
s.append("Chen ngang")
print(p.name, p.songs())
```
```output
Code ['Lofi 1']
```

`__init__` chạy khi tạo đối tượng; `self` là chính đối tượng đó. Dấu `_` đầu tên nghĩa là "dùng nội bộ".

> ⚠️ **Lỗi hay gặp:** trả về chính list bên trong. Gán `b = a` **không** sao chép:

```python
a = [1, 2]
b = a
c = list(a)
a.append(3)
print(b, c)
```
```output
[1, 2, 3] [1, 2]
```

### Bước 3 — Đếm token nhanh → `estimate_tokens`, `count_message_tokens`

Gọi API chỉ để đếm token thì chậm và tốn tiền; ta ước lượng bằng độ dài chuỗi, làm tròn **lên** cho an toàn:

```python
import math
print(7 / 3, math.ceil(7 / 3), math.ceil(0 / 3))
```
```output
2.3333333333333335 3 0
```

Cộng độ dài nhiều chuỗi:

**Cách 1 — vòng lặp for, cộng dồn**

```python
words = ["cafe", "bánh mì", "trà"]
total = 0
for w in words:
    total = total + len(w)
print(total)
```
```output
14
```

**Cách 2 — `sum()` + generator expression**

```python
words = ["cafe", "bánh mì", "trà"]
print(sum(len(w) for w in words))
```
```output
14
```

> ⚖️ **So sánh:** cùng O(n), chỉ gọn hơn. Generator đưa từng số cho `sum` mà không dựng list trung gian, nên tiết kiệm bộ nhớ khi có hàng triệu phần tử.

Mỗi message cộng thêm `MESSAGE_OVERHEAD = 4` token "khung" (role, dấu phân cách) — con số ước lượng/message. Khác với khuôn ~16 token/lần gọi ở L03 ("hi" → `prompt_tokens=17`).

### Bước 4 — Đi ngược danh sách → `trim_history`

Hai công cụ: duyệt từ cuối lên, và `insert(0, x)` chèn vào đầu để giữ thứ tự gốc.

**Cách 1 — vòng while với chỉ số giảm dần**

```python
nums = [10, 20, 30, 40]
backward = []
i = len(nums) - 1          # chỉ số phần tử cuối
while i >= 0:
    backward.append(nums[i])
    i = i - 1
print(backward)
```
```output
[40, 30, 20, 10]
```

**Cách 2 — `reversed()`**

```python
nums = [10, 20, 30, 40]
print(list(reversed(nums)))
```
```output
[40, 30, 20, 10]
```

> ⚖️ **So sánh:** cùng O(n), chỉ gọn hơn và không phải tự quản lý chỉ số `i`. `reversed()` không sao chép list.

Kết hợp với `break` và `insert(0, x)`:

```python
nums = [10, 20, 30, 40]
kept = []
for x in reversed(nums):
    if x < 25:
        break
    kept.insert(0, x)
print(kept)
```
```output
[30, 40]
```

Thứ tự trong hàm của bạn: tách system (nếu có) → giữ message cuối → đi ngược phần còn lại, cộng dồn token, vượt ngân sách thì `break`.

> ⚠️ **Lỗi hay gặp:** dùng `messages.pop()` hoặc `del` → sửa luôn list của người gọi. Chỉ đọc đầu vào, tạo list mới cho kết quả.

### Bước 5 — Ghép lại → `chat_turn`

```mermaid
flowchart TD
    T["text"] --> A["conv.add_user"]
    A --> C["trim_history"]
    C --> L["create (1 lần)"]
    L --> S["conv.add_assistant"]
    S --> R["return answer"]
```

Lưu ý: `conv` giữ **đủ** lịch sử; chỉ bản **gửi đi** bị cắt. Nhờ vậy sau này đổi ngân sách hay chuyển sang tóm tắt vẫn còn dữ liệu gốc.

### Bước 6 — Chat thật trong terminal

```bash
cd academy/workspace/L05-hoi-thoai-context-window
python conversation.py
```

Thử: "Mình tên An, đang học Data Engineer" → "Mình nên học gì trước?" → "Nhắc lại tên mình?". Quan sát dòng `[lịch sử N message ~X token | gửi đi M message ~Y token]` sau mỗi lượt.

### Bước 7 — Thí nghiệm: ngân sách quá nhỏ

Ngân sách trong `__main__` là `budget = 300`. Chat 5–6 lượt dài, rồi hỏi "Mình tên gì?". Khi lượt đầu bị cắt khỏi bản gửi đi, JobRadar **quên** tên bạn. Đổi `budget = 3000` và thử lại.

> 💡 **Mẹo:** ghi lại lượt thứ mấy thì bắt đầu quên — đó là câu chuyện cụ thể để kể khi phỏng vấn.

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc từ thư mục `academy/`:

```bash
PYTHONPATH=workspace/L05-hoi-thoai-context-window python3 -m pytest curriculum/L05-hoi-thoai-context-window/tests -q
```

> 💡 **Mẹo:** Windows PowerShell: `$env:PYTHONPATH="workspace\L05-hoi-thoai-context-window"; python -m pytest curriculum\L05-hoi-thoai-context-window\tests -q`

Mục tiêu: `25 passed` — không cần mạng, không cần key. Sau đó chat thật (Bước 6–7).

## 🎤 Câu hỏi phỏng vấn

> 🎯 **Phỏng vấn hay hỏi:** câu 3 — trả lời bằng phép tính: "lượt N gửi lại N lượt, nên tổng là 1+2+…+N ≈ N²/2 lần số token mỗi lượt; 10 lượt × 150 token tốn 8.250 token chứ không phải 1.500".
