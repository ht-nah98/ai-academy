"""JobRadar — Bài L06: Web chat, streaming, lỗi & rate limit.

JobRadar lên web: một API FastAPI nhận tin nhắn, gọi LLM, trả lời (thường hoặc
stream từng mẩu chữ). API thật thì hay lỗi: 429 (gọi quá nhanh), 5xx, timeout...
Ta tự retry có exponential backoff + jitter, và CHỈ retry lỗi đáng retry.

Chạy thật:  pip install fastapi uvicorn   (trong venv, một lần)
            python webchat.py              rồi mở http://127.0.0.1:8001
Chạy test:  bấm "Chạy test" (client GIẢ, không gọi mạng, không tốn token).
"""
import os
import random
import time
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"
DEFAULT_SYSTEM = (
    "Bạn là JobRadar, trợ lý về thị trường việc làm IT tại Việt Nam. "
    "Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt."
)
EXTRA_BODY = {"chat_template_kwargs": {"enable_thinking": False}}
BUSY_MESSAGE = "Model đang bận, bạn thử lại sau ít phút."
STATIC_DIR = Path(__file__).with_name("static")


def backoff_delays(n, base=1.0, cap=30.0):
    """Thời gian chờ (giây) trước mỗi lần thử lại, tăng gấp đôi và không vượt cap:

        lần i (i = 0, 1, ..., n-1)  ->  min(cap, base * 2**i)

    Ví dụ: backoff_delays(5) -> [1.0, 2.0, 4.0, 8.0, 16.0];  n = 0 -> [].
    """
    # TODO
    raise NotImplementedError("TODO: viết backoff_delays")


def is_retryable(error):
    """Lỗi này có đáng thử lại không?

    - Lỗi có thuộc tính status_code (lỗi HTTP): True nếu 429 hoặc >= 500; còn lại False
      (400, 401, 404... thử lại vẫn hỏng y nguyên).
    - Không có status_code: True nếu là TimeoutError / ConnectionError, hoặc tên lớp lỗi
      (type(error).__name__) là "APITimeoutError" / "APIConnectionError" (lỗi mạng của openai).
    - Mọi lỗi khác (ValueError, KeyError...) -> False.
    Gợi ý: getattr(error, "status_code", None).
    """
    # TODO
    raise NotImplementedError("TODO: viết is_retryable")


def with_retry(fn, max_tries=4, base=1.0, cap=30.0, sleep=time.sleep, rand=random.random):
    """Gọi fn() (không tham số); lỗi đáng retry thì chờ rồi gọi lại, tối đa max_tries lần.

    - Thành công -> trả ngay kết quả của fn().
    - Lỗi KHÔNG đáng retry (is_retryable False) -> raise lại ngay lỗi đó.
    - Lỗi đáng retry ở lần thử thứ i (i = 0, 1, ...) và còn lượt -> gọi
          sleep(backoff_delays(...)[i] * rand())       # "full jitter"
      rồi thử lại. Hết lượt -> raise lại lỗi cuối cùng.
    - sleep và rand được truyền vào để test không phải chờ thật.
    - max_tries < 1 -> raise ValueError.
    """
    # TODO
    raise NotImplementedError("TODO: viết with_retry")


def stream_text(chunks):
    """GENERATOR: với mỗi chunk của stream, yield chunk.choices[0].delta.content.

    Bỏ qua chunk có choices rỗng (chunk cuối chỉ chứa usage) và chunk có content
    None hoặc "". Phải dùng `yield` để trình duyệt nhận chữ NGAY khi model sinh ra.
    """
    # TODO
    raise NotImplementedError("TODO: viết stream_text")


def collect_stream(chunks):
    """Ghép toàn bộ stream thành một chuỗi (dùng stream_text). Stream rỗng -> ""."""
    # TODO
    raise NotImplementedError("TODO: viết collect_stream")


class Message(BaseModel):
    role: Literal["user", "assistant"]  # trình duyệt KHÔNG được gửi role "system"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[Message] = Field(default_factory=list)


def create_app(client, model=DEFAULT_MODEL, system=DEFAULT_SYSTEM, sleep=time.sleep, rand=random.random):
    """Tạo ứng dụng FastAPI dùng `client` (thật hoặc giả)."""
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import FileResponse, StreamingResponse

    app = FastAPI(title="JobRadar chat")

    def build_messages(req):
        """ĐÃ VIẾT SẴN: system + lịch sử trình duyệt gửi lên + tin nhắn mới. Tin rỗng -> 400."""
        text = req.message.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Tin nhắn rỗng")
        return ([{"role": "system", "content": system}]
                + [m.model_dump() for m in req.history]
                + [{"role": "user", "content": text}])

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.post("/chat")
    def chat(req: ChatRequest):
        """Trả {"answer": "<câu trả lời đã strip; None -> ''>"}.

        1. messages = build_messages(req)      (tin rỗng -> 400, KHÔNG gọi API)
        2. Gọi client.chat.completions.create(model=model, messages=messages,
           max_tokens=512, extra_body=EXTRA_BODY) BÊN TRONG with_retry(..., sleep=sleep, rand=rand)
           (gợi ý: with_retry(lambda: client.chat.completions.create(...), ...)).
        3. Nếu with_retry vẫn raise một lỗi đáng retry (hết lượt) ->
           raise HTTPException(status_code=503, detail=BUSY_MESSAGE).
           Lỗi khác thì cứ để nó raise.
        """
        # TODO
        raise NotImplementedError("TODO: viết handler POST /chat")

    @app.post("/chat/stream")
    def chat_stream(req: ChatRequest):
        """ĐÃ VIẾT SẴN: như /chat nhưng stream=True, trả từng mẩu chữ (text/plain)."""
        messages = build_messages(req)
        try:
            stream = with_retry(lambda: client.chat.completions.create(
                model=model, messages=messages, max_tokens=512, stream=True, extra_body=EXTRA_BODY),
                sleep=sleep, rand=rand)
        except Exception as error:
            if is_retryable(error):
                raise HTTPException(status_code=503, detail=BUSY_MESSAGE)
            raise
        return StreamingResponse(stream_text(stream), media_type="text/plain; charset=utf-8")

    return app


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN: client thật và chạy server.
# ----------------------------------------------------------------------------

def load_api_key(env_path=".env"):
    key = os.environ.get("NVIDIA_API_KEY")
    if not key and os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                name, _, value = line.strip().partition("=")
                if name.strip() == "NVIDIA_API_KEY":
                    key = value.strip().strip('"').strip("'")
    if not key:
        raise RuntimeError("Thiếu NVIDIA_API_KEY — tạo file .env cạnh webchat.py (xem lesson.md)")
    return key


def make_client():
    """timeout=30: không chờ mãi. max_retries=0: tắt retry sẵn có của openai để with_retry của ta điều khiển."""
    from openai import OpenAI
    return OpenAI(base_url=BASE_URL, api_key=load_api_key(), timeout=30, max_retries=0)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(make_client()), host="127.0.0.1", port=8001)
