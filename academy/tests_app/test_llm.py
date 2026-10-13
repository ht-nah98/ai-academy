import pytest

from app import llm


class FakeErr(Exception):
    def __init__(self, status):
        super().__init__(f"err {status}")
        self.status_code = status


class FakeClient:
    def __init__(self, script):
        self.script, self.calls = list(script), []
        self.chat = self
        self.completions = self

    def create(self, model, messages, **kw):
        self.calls.append((model, kw))
        x = self.script.pop(0)
        if isinstance(x, Exception):
            raise x
        m = type("M", (), {"content": x})
        return type("R", (), {"choices": [type("C", (), {"message": m})]})


def test_parse_json_variants():
    assert llm.parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert llm.parse_json('Đây: {"a": {"b": "}"}} hết {"c":2}') == {"a": {"b": "}"}}
    with pytest.raises(ValueError):
        llm.parse_json("không có")


def test_retry_then_success_and_params():
    c = FakeClient([FakeErr(429), FakeErr(503), "ok"])
    sleeps = []
    assert llm.chat([{"role": "user", "content": "x"}], llm.TUTOR_MODEL, client=c, sleep=sleeps.append) == "ok"
    assert sleeps == [1, 2] and len(c.calls) == 3
    model, kw = c.calls[0]
    assert kw["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}} and kw["temperature"] == 0.6


def test_fallback_model_after_failures():
    c = FakeClient([FakeErr(500)] * 4 + ["fb"])
    assert llm.chat([{"role": "user", "content": "x"}], llm.GRADER_MODEL, client=c, sleep=lambda s: None) == "fb"
    assert c.calls[-1][0] == llm.FALLBACK_MODEL and len(c.calls) == 5


def test_non_retryable_goes_straight_to_fallback():
    c = FakeClient([FakeErr(400), "fb"])
    llm.chat([{"role": "user", "content": "x"}], llm.GRADER_MODEL, client=c, sleep=lambda s: pytest.fail("slept"))
    assert len(c.calls) == 2


def test_cache_used_for_grading(env):
    c = FakeClient(['{"score": 15, "strengths": "ok", "gaps": [], "better_answer": "z"}'])
    g1 = llm.grade("q", "a", client=c)
    g2 = llm.grade("q", "a", client=FakeClient([]))  # nếu gọi mạng sẽ lỗi pop rỗng
    assert g1 == g2 and g1["score"] == 10 and g1["strengths"] == ["ok"]
    assert list((env / "cache" / "llm").glob("*.json"))


def test_key_from_env_file(env, monkeypatch):
    assert llm.get_api_key() is None
    (env / ".env").write_text("NVIDIA_API_KEY='nvapi-abc'\n")
    monkeypatch.setattr(llm, "_env_candidates", lambda: [env / ".env"])
    assert llm.get_api_key() == "nvapi-abc"


def test_no_key_raises(env):
    with pytest.raises(llm.NoKeyError):
        llm.chat([], llm.TUTOR_MODEL)


def test_placeholder_key_is_ignored(tmp_path, monkeypatch):
    from app import llm
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    env = tmp_path / ".env"
    env.write_text("NVIDIA_API_KEY=nvapi-...\n", encoding="utf-8")
    monkeypatch.setattr(llm, "_env_candidates", lambda: [env])
    assert llm.get_api_key() is None
    env.write_text("NVIDIA_API_KEY=nvapi-realKey123\n", encoding="utf-8")
    assert llm.get_api_key() == "nvapi-realKey123"
