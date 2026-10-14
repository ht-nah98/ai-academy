"""Test tự chấm cho bài L06. Dùng client GIẢ và TestClient của FastAPI — không gọi mạng."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from webchat import (BUSY_MESSAGE, DEFAULT_MODEL, DEFAULT_SYSTEM, EXTRA_BODY, backoff_delays, collect_stream,
                     create_app, is_retryable, stream_text, with_retry)


class FakeHTTPError(Exception):
    """Bắt chước lỗi HTTP của openai (có thuộc tính status_code)."""

    def __init__(self, status_code):
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


class APITimeoutError(Exception):
    """Cùng TÊN với lỗi timeout của openai, nhưng không có status_code."""


def chunk(content):
    return SimpleNamespace(choices=[SimpleNamespace(index=0, delta=SimpleNamespace(content=content))])


USAGE_CHUNK = SimpleNamespace(choices=[], usage=SimpleNamespace(prompt_tokens=10, completion_tokens=3))


class FakeClient:
    """Lỗi `fail_with` trong `failures` lần gọi đầu, sau đó trả lời bình thường (hoặc stream)."""

    def __init__(self, content="  Chào bạn!  ", failures=0, fail_with=429, pieces=("Xin", " chào", None, "!")):
        self.calls = []
        self.failures = failures
        self.fail_with = fail_with
        self.content = content
        self.pieces = pieces
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) <= self.failures:
            raise FakeHTTPError(self.fail_with)
        if kwargs.get("stream"):
            return iter([chunk(p) for p in self.pieces] + [USAGE_CHUNK])
        message = SimpleNamespace(role="assistant", content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(index=0, message=message, finish_reason="stop")],
                               usage=SimpleNamespace(prompt_tokens=20, completion_tokens=4))


class Recorder:
    """Thay cho time.sleep: ghi lại thời gian chờ thay vì chờ thật."""

    def __init__(self):
        self.waits = []

    def __call__(self, seconds):
        self.waits.append(seconds)


# ---------- backoff_delays ----------

def test_backoff_delays_gap_doi():
    assert backoff_delays(5) == [1.0, 2.0, 4.0, 8.0, 16.0], "Lần i chờ base * 2**i"


def test_backoff_delays_cap_va_base():
    assert backoff_delays(6, base=1, cap=10) == [1, 2, 4, 8, 10, 10], "Không vượt quá cap: min(cap, ...)"
    assert backoff_delays(3, base=0.5) == [0.5, 1.0, 2.0]


def test_backoff_delays_rong():
    assert backoff_delays(0) == []


# ---------- is_retryable ----------

@pytest.mark.parametrize("code, expected", [(429, True), (500, True), (503, True),
                                            (400, False), (401, False), (404, False), (422, False)])
def test_is_retryable_theo_status(code, expected):
    assert is_retryable(FakeHTTPError(code)) is expected, "Chỉ 429 và 5xx đáng thử lại"


@pytest.mark.parametrize("error", [TimeoutError("chậm"), ConnectionError("mất mạng"), APITimeoutError("hết giờ")])
def test_is_retryable_loi_mang(error):
    assert is_retryable(error) is True, "Timeout / mất kết nối là lỗi tạm thời → đáng thử lại"


@pytest.mark.parametrize("error", [ValueError("sai"), KeyError("x")])
def test_is_retryable_loi_code(error):
    assert is_retryable(error) is False, "Lỗi do code sai thì thử lại vô ích"


# ---------- with_retry ----------

def test_with_retry_thanh_cong_ngay():
    sleep = Recorder()
    assert with_retry(lambda: "OK", sleep=sleep) == "OK"
    assert sleep.waits == [], "Thành công ngay thì không chờ"


def test_with_retry_thu_lai_roi_thanh_cong():
    client, sleep = FakeClient(failures=2), Recorder()
    r = with_retry(lambda: client.chat.completions.create(model="m"), sleep=sleep, rand=lambda: 0.5)
    assert r.choices[0].message.content.strip() == "Chào bạn!"
    assert len(client.calls) == 3, "Lỗi 429 hai lần → lần thứ 3 thành công"
    assert sleep.waits == [0.5, 1.0], "Chờ backoff_delays[i] * rand(): 1*0.5 rồi 2*0.5"


def test_with_retry_khong_thu_lai_loi_401():
    client, sleep = FakeClient(failures=5, fail_with=401), Recorder()
    with pytest.raises(FakeHTTPError):
        with_retry(lambda: client.chat.completions.create(model="m"), sleep=sleep)
    assert len(client.calls) == 1 and sleep.waits == [], "Lỗi không đáng retry → raise ngay, không chờ"


def test_with_retry_het_luot():
    client, sleep = FakeClient(failures=99), Recorder()
    with pytest.raises(FakeHTTPError):
        with_retry(lambda: client.chat.completions.create(model="m"), max_tries=3, sleep=sleep, rand=lambda: 1.0)
    assert len(client.calls) == 3, "Gọi đúng max_tries lần"
    assert sleep.waits == [1.0, 2.0], "Chỉ chờ GIỮA các lần thử (max_tries - 1 lần), không chờ sau lần cuối"


def test_with_retry_ton_trong_cap():
    client, sleep = FakeClient(failures=99), Recorder()
    with pytest.raises(FakeHTTPError):
        with_retry(lambda: client.chat.completions.create(), max_tries=5, base=2, cap=5, sleep=sleep,
                   rand=lambda: 1.0)
    assert sleep.waits == [2, 4, 5, 5], "Dùng backoff_delays(..., base, cap) cho thời gian chờ"


def test_with_retry_max_tries_khong_hop_le():
    with pytest.raises(ValueError):
        with_retry(lambda: "OK", max_tries=0)


# ---------- stream_text ----------

def test_stream_text_bo_qua_rong():
    chunks = [chunk("Data"), chunk(None), chunk(""), chunk(" Engineer"), USAGE_CHUNK]
    assert list(stream_text(chunks)) == ["Data", " Engineer"], (
        "yield delta.content; bỏ qua content None/'' và chunk có choices rỗng"
    )


def test_stream_text_la_generator():
    def source():
        yield chunk("mẩu đầu")
        raise RuntimeError("chưa tới đây được")

    gen = stream_text(source())
    assert next(gen) == "mẩu đầu", (
        "Phải dùng yield: trả mẩu đầu ngay, không đợi đọc hết stream (đừng gom vào list rồi return)"
    )


# ---------- collect_stream ----------

def test_collect_stream_ghep():
    assert collect_stream([chunk("Xin"), chunk(" chào"), chunk(None), USAGE_CHUNK]) == "Xin chào"


def test_collect_stream_rong():
    assert collect_stream([]) == ""
    assert collect_stream(iter([USAGE_CHUNK])) == ""


# ---------- API /chat ----------

def make_api(client):
    return TestClient(create_app(client, sleep=Recorder(), rand=lambda: 0.0))


def test_api_chat_tra_loi():
    client = FakeClient()
    res = make_api(client).post("/chat", json={"message": "Data Engineer là gì?"})
    assert res.status_code == 200
    assert res.json() == {"answer": "Chào bạn!"}, "Trả {'answer': content đã strip}"
    kwargs = client.calls[0]
    assert kwargs.get("model") == DEFAULT_MODEL and kwargs.get("max_tokens") == 512
    assert kwargs.get("extra_body") == EXTRA_BODY
    assert kwargs.get("messages") == [{"role": "system", "content": DEFAULT_SYSTEM},
                                      {"role": "user", "content": "Data Engineer là gì?"}], (
        "Dùng messages = build_messages(req)"
    )


def test_api_chat_gui_kem_lich_su():
    client = FakeClient()
    history = [{"role": "user", "content": "Mình tên An"}, {"role": "assistant", "content": "Chào An!"}]
    make_api(client).post("/chat", json={"message": "Mình tên gì?", "history": history})
    assert client.calls[0]["messages"][1:] == history + [{"role": "user", "content": "Mình tên gì?"}], (
        "Server không nhớ gì: lịch sử do trình duyệt gửi lên trong mỗi request"
    )


def test_api_chat_tin_rong():
    client = FakeClient()
    res = make_api(client).post("/chat", json={"message": "   "})
    assert res.status_code == 400, "Tin nhắn rỗng → 400 (build_messages đã xử lý)"
    assert client.calls == [], "Không gọi API khi tin nhắn rỗng"


def test_api_chat_content_none():
    res = make_api(FakeClient(content=None)).post("/chat", json={"message": "Hi"})
    assert res.json() == {"answer": ""}, "content None → answer ''"


def test_api_chat_retry_429():
    client = FakeClient(failures=2)
    res = make_api(client).post("/chat", json={"message": "Hi"})
    assert res.status_code == 200, "Gặp 429 phải tự thử lại bằng with_retry"
    assert len(client.calls) == 3


def test_api_chat_het_luot_tra_503():
    client = FakeClient(failures=99)
    res = make_api(client).post("/chat", json={"message": "Hi"})
    assert res.status_code == 503, "Thử lại hết lượt vẫn 429 → HTTPException(503, BUSY_MESSAGE)"
    assert res.json()["detail"] == BUSY_MESSAGE
    assert len(client.calls) == 4, "with_retry mặc định thử 4 lần"


def test_api_stream():
    client = FakeClient(failures=1)
    res = make_api(client).post("/chat/stream", json={"message": "Hi"})
    assert res.status_code == 200
    assert res.text == "Xin chào!", "Endpoint stream (viết sẵn) dùng with_retry + stream_text của bạn"
    assert client.calls[-1].get("stream") is True
