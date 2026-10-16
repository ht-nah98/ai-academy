"""JobRadar — Bài L05: Hội thoại nhiều lượt & context window.

LLM KHÔNG nhớ gì giữa các lần gọi. Muốn JobRadar "nhớ" bạn vừa hỏi gì, ta phải
gửi lại cả lịch sử mỗi lượt. Lịch sử dài dần -> tốn token hơn và có lúc vượt
context window. Bài này: giữ lịch sử + tự cắt bớt khi vượt ngân sách token.

Chạy thật:  python conversation.py      (chat nhiều lượt trong terminal, gõ "thoát" để dừng)
            (cần venv đã cài openai + file .env có NVIDIA_API_KEY — như L03)
Chạy test:  bấm "Chạy test" (client GIẢ, không gọi mạng, không tốn token).
"""
import math
import os
from pathlib import Path

BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"
DEFAULT_SYSTEM = (
    "Bạn là JobRadar, trợ lý về thị trường việc làm IT tại Việt Nam. "
    "Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt."
)
EXTRA_BODY = {"chat_template_kwargs": {"enable_thinking": False}}
MESSAGE_OVERHEAD = 4  # mỗi message tốn thêm vài token "khung" (role, dấu phân cách)


class Conversation:
    """Lưu lịch sử một cuộc hội thoại.

    - Conversation(system=None): system khác rỗng (sau strip) -> lịch sử bắt đầu bằng
      {"role": "system", "content": system}; None/rỗng -> lịch sử rỗng.
    - add_user(text) / add_assistant(text): thêm {"role": "user"/"assistant", "content": text}
      vào CUỐI lịch sử. add_user với text rỗng/chỉ khoảng trắng -> raise ValueError.
      (add_assistant chấp nhận chuỗi rỗng — model đôi khi trả về rỗng.)
    - messages(): trả về list messages theo thứ tự. Trả một BẢN SAO (list mới),
      để người gọi sửa list đó không làm hỏng lịch sử bên trong.
    """

    def __init__(self, system=None):
        # TODO
        raise NotImplementedError("TODO: viết Conversation.__init__")

    def add_user(self, text):
        # TODO
        raise NotImplementedError("TODO: viết Conversation.add_user")

    def add_assistant(self, text):
        # TODO
        raise NotImplementedError("TODO: viết Conversation.add_assistant")

    def messages(self):
        # TODO
        raise NotImplementedError("TODO: viết Conversation.messages")


def estimate_tokens(text):
    """Ước lượng nhanh số token của một chuỗi, KHÔNG cần gọi API.

    Quy ước: cứ 3 ký tự ~ 1 token (tiếng Việt), làm tròn LÊN: math.ceil(len(text) / 3).
    Chuỗi rỗng -> 0.  Ví dụ: "abcd" -> 2.
    """
    # TODO
    raise NotImplementedError("TODO: viết estimate_tokens")


def count_message_tokens(messages):
    """Tổng token ước lượng của một list messages:
    mỗi message = MESSAGE_OVERHEAD + estimate_tokens(content).   [] -> 0.
    """
    # TODO
    raise NotImplementedError("TODO: viết count_message_tokens")


def trim_history(messages, max_tokens):
    """Cắt bớt lịch sử cho vừa ngân sách max_tokens (đếm bằng count_message_tokens).

    Luật:
    1. Message system (nếu messages[0] có role "system") LUÔN được giữ.
    2. Message cuối cùng (câu mới nhất) LUÔN được giữ, kể cả khi vượt ngân sách.
    3. Các message còn lại: đi từ MỚI về CŨ, thêm vào chừng nào tổng vẫn <= max_tokens;
       gặp message đầu tiên không vừa thì DỪNG (không nhảy cóc qua nó).
    4. Kết quả giữ nguyên thứ tự gốc (system đầu tiên). Không sửa list đầu vào.
    messages rỗng -> [].
    """
    # TODO
    raise NotImplementedError("TODO: viết trim_history")


def chat_turn(conv, text, client, max_context_tokens=3000, model=DEFAULT_MODEL, max_tokens=512):
    """Một lượt hội thoại:

    1. conv.add_user(text)
    2. messages = trim_history(conv.messages(), max_context_tokens)
    3. Gọi ĐÚNG MỘT lần client.chat.completions.create(model=model, messages=messages,
       max_tokens=max_tokens, extra_body=EXTRA_BODY)
    4. answer = content (strip; None -> ""), rồi conv.add_assistant(answer)
    5. return answer
    """
    # TODO
    raise NotImplementedError("TODO: viết chat_turn")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN: client thật + vòng chat trong terminal.
# ----------------------------------------------------------------------------

def load_api_key():
    """NVIDIA_API_KEY: biến môi trường trước, rồi .env cạnh file này, rồi .env ở gốc repo (như L02)."""
    key = os.environ.get("NVIDIA_API_KEY")
    here = Path(__file__).resolve().parent
    for env_path in (here / ".env", here.parents[2] / ".env"):  # workspace/<bài>/ → gốc repo
        if key:
            break
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                name, _, value = line.strip().partition("=")
                if name.strip() == "NVIDIA_API_KEY":
                    key = value.strip().strip('"').strip("'")
    if not key or "..." in key:
        raise RuntimeError("Thiếu NVIDIA_API_KEY — điền key vào file .env ở gốc repo (xem README)")
    return key


def make_client():
    from openai import OpenAI
    return OpenAI(base_url=BASE_URL, api_key=load_api_key())


if __name__ == "__main__":
    client = make_client()
    conv = Conversation(DEFAULT_SYSTEM)
    budget = 300  # cố ý đặt NHỎ để thấy việc cắt lịch sử
    while True:
        text = input("\nBạn: ").strip()
        if text.lower() in ("thoát", "thoat", "exit", "quit"):
            break
        if not text:
            continue
        print("JobRadar:", chat_turn(conv, text, client, max_context_tokens=budget))
        full = conv.messages()
        sent = trim_history(full, budget)
        print(f"[lịch sử {len(full)} message ~{count_message_tokens(full)} token | "
              f"gửi đi {len(sent)} message ~{count_message_tokens(sent)} token]")
