"""Test tự chấm cho bài L03. Dùng client GIẢ bắt chước openai.OpenAI — không gọi mạng."""
from types import SimpleNamespace

import pytest

from chat import DEFAULT_MODEL, DEFAULT_SYSTEM, ask, build_messages, estimate_cost_usd


class FakeClient:
    """Bắt chước client.chat.completions.create(...) và ghi lại các lần gọi."""

    def __init__(self, content="  Xin chào, mình là JobRadar!  ", prompt_tokens=42, completion_tokens=7):
        self.calls = []
        self._content = content
        self._usage = SimpleNamespace(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                                      total_tokens=prompt_tokens + completion_tokens)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(role="assistant", content=self._content)
        return SimpleNamespace(choices=[SimpleNamespace(index=0, message=message, finish_reason="stop")],
                               usage=self._usage)


# ---------- build_messages ----------

def test_build_messages_co_system():
    assert build_messages("Bạn là trợ lý.", "Python là gì?") == [
        {"role": "system", "content": "Bạn là trợ lý."},
        {"role": "user", "content": "Python là gì?"},
    ], "Cần 2 message theo thứ tự system rồi user, mỗi message là dict có 'role' và 'content'"


@pytest.mark.parametrize("system", [None, "", "   "])
def test_build_messages_khong_system(system):
    assert build_messages(system, "Hi") == [{"role": "user", "content": "Hi"}], (
        "system là None/rỗng thì chỉ gửi message 'user' (kiểm tra: if system and system.strip())"
    )


# ---------- ask ----------

def test_ask_tra_ve_dict_dung_dang():
    result = ask("Xin chào", FakeClient())
    assert isinstance(result, dict), "ask phải trả về dict"
    assert set(result) == {"answer", "prompt_tokens", "completion_tokens"}, (
        "dict phải có đúng 3 key: answer, prompt_tokens, completion_tokens"
    )
    assert result["answer"] == "Xin chào, mình là JobRadar!", (
        "Lấy response.choices[0].message.content và .strip() khoảng trắng hai đầu"
    )
    assert result["prompt_tokens"] == 42 and result["completion_tokens"] == 7, (
        "Số token lấy từ response.usage.prompt_tokens / response.usage.completion_tokens"
    )


def test_ask_goi_api_dung_mot_lan_voi_tham_so_dung():
    client = FakeClient()
    ask("Data Engineer là gì?", client)
    assert len(client.calls) == 1, "Phải gọi client.chat.completions.create đúng 1 lần"
    kwargs = client.calls[0]
    assert kwargs.get("model") == DEFAULT_MODEL == "nvidia/nemotron-3-super-120b-a12b", (
        "Mặc định dùng model DEFAULT_MODEL; nhớ truyền model=model"
    )
    assert kwargs.get("messages") == build_messages(DEFAULT_SYSTEM, "Data Engineer là gì?"), (
        "messages phải là build_messages(system, question)"
    )
    assert kwargs.get("max_tokens") == 512, "Truyền max_tokens=max_tokens để giới hạn độ dài (và chi phí)"


def test_ask_tat_thinking():
    client = FakeClient()
    ask("Hi", client)
    assert client.calls[0].get("extra_body") == {"chat_template_kwargs": {"enable_thinking": False}}, (
        "Truyền extra_body=EXTRA_BODY để tắt chế độ thinking"
    )


def test_ask_truyen_model_va_system_tuy_chinh():
    client = FakeClient()
    ask("Hi", client, model="z-ai/glm-5.3-flash", system=None, max_tokens=50)
    kwargs = client.calls[0]
    assert kwargs["model"] == "z-ai/glm-5.3-flash", "Tham số model phải được dùng thay cho mặc định"
    assert kwargs["messages"] == [{"role": "user", "content": "Hi"}], "system=None → chỉ có message user"
    assert kwargs["max_tokens"] == 50


def test_ask_content_none():
    result = ask("Hi", FakeClient(content=None))
    assert result["answer"] == "", "content có thể là None — khi đó answer là chuỗi rỗng ''"


@pytest.mark.parametrize("question", ["", "   "])
def test_ask_cau_hoi_rong(question):
    client = FakeClient()
    with pytest.raises(ValueError):
        ask(question, client)
    assert client.calls == [], "Câu hỏi rỗng phải raise ValueError TRƯỚC khi gọi API"


# ---------- estimate_cost_usd ----------

def test_estimate_cost():
    assert estimate_cost_usd(1_000_000, 500_000, 0.5, 1.5) == 1.25, (
        "Chi phí = prompt/1e6 * giá_vào + completion/1e6 * giá_ra"
    )
    assert estimate_cost_usd(1200, 300, 0.1, 0.4) == 0.00024, "Nhớ round(..., 6)"
    assert estimate_cost_usd(0, 0, 0.5, 1.5) == 0
