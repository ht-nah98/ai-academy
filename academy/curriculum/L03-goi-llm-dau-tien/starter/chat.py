"""JobRadar — Bài L03: Gọi LLM đầu tiên.

Ta gọi model trên build.nvidia.com qua API "tương thích OpenAI": cùng một kiểu
request/response mà gần như mọi nhà cung cấp LLM đều hỗ trợ. Thư viện `openai`
dùng được cho tất cả, chỉ cần đổi base_url.

Chạy thật:  python chat.py "Data Engineer intern cần học những gì?"
            (cần venv đã cài openai + file .env có NVIDIA_API_KEY — xem lesson.md)
Chạy test:  bấm "Chạy test" (test dùng client GIẢ, không gọi mạng, không tốn token).
"""
import os
import sys

BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"
DEFAULT_SYSTEM = (
    "Bạn là JobRadar, trợ lý về thị trường việc làm IT tại Việt Nam. "
    "Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt."
)
# Model này có chế độ "suy nghĩ" (thinking) — tắt đi cho nhanh và tiết kiệm token.
# extra_body = các trường thêm vào JSON gửi đi mà thư viện openai không có tham số riêng.
EXTRA_BODY = {"chat_template_kwargs": {"enable_thinking": False}}


def build_messages(system, question):
    """Tạo list messages gửi cho LLM.

    - Có system (chuỗi khác rỗng sau khi strip) ->
        [{"role": "system", "content": system}, {"role": "user", "content": question}]
    - system là None hoặc chuỗi rỗng/chỉ có khoảng trắng -> chỉ có message "user".
    """
    # TODO
    raise NotImplementedError("TODO: viết build_messages")


def ask(question, client, model=DEFAULT_MODEL, system=DEFAULT_SYSTEM, max_tokens=512):
    """Gửi một câu hỏi tới LLM, trả về dict:

        {"answer": str, "prompt_tokens": int, "completion_tokens": int}

    - `client` là đối tượng kiểu openai.OpenAI (test sẽ truyền client giả).
      Gọi ĐÚNG MỘT lần:
          client.chat.completions.create(
              model=model,
              messages=build_messages(system, question),
              max_tokens=max_tokens,
              extra_body=EXTRA_BODY,
          )
    - Câu trả lời nằm ở response.choices[0].message.content — bỏ khoảng trắng
      thừa hai đầu; nếu content là None thì coi là chuỗi rỗng "".
    - Số token nằm ở response.usage.prompt_tokens và response.usage.completion_tokens.
    - question rỗng (hoặc chỉ khoảng trắng) -> raise ValueError, KHÔNG gọi API
      (gọi API với câu hỏi rỗng là tốn tiền vô ích).
    """
    # TODO
    raise NotImplementedError("TODO: viết ask")


def estimate_cost_usd(prompt_tokens, completion_tokens, input_price_per_m, output_price_per_m):
    """Ước tính chi phí (USD) của một lần gọi.

    Giá LLM tính theo 1 TRIỆU token, và token đầu vào (prompt) thường rẻ hơn
    token đầu ra (completion). Làm tròn 6 chữ số thập phân.

    Ví dụ: estimate_cost_usd(1_000_000, 500_000, 0.5, 1.5) -> 1.25
    """
    # TODO
    raise NotImplementedError("TODO: viết estimate_cost_usd")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN: tạo client thật và chạy từ dòng lệnh.
# ----------------------------------------------------------------------------

def load_api_key(env_path=".env"):
    """Lấy NVIDIA_API_KEY từ biến môi trường hoặc file .env (như bài L02)."""
    key = os.environ.get("NVIDIA_API_KEY")
    if not key and os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                name, _, value = line.strip().partition("=")
                if name.strip() == "NVIDIA_API_KEY":
                    key = value.strip().strip('"').strip("'")
    if not key:
        raise RuntimeError("Thiếu NVIDIA_API_KEY — tạo file .env cạnh chat.py (xem lesson.md)")
    return key


def make_client():
    """Tạo client OpenAI trỏ tới NVIDIA. Import openai ở đây để test không cần cài nó."""
    from openai import OpenAI
    return OpenAI(base_url=BASE_URL, api_key=load_api_key())


if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or "Data Engineer intern cần biết những kỹ năng gì?"
    result = ask(question, make_client())
    print(result["answer"])
    print(f"\n[token] prompt={result['prompt_tokens']} completion={result['completion_tokens']}")
