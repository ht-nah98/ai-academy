"""Test tự chấm cho bài L04. Dùng client GIẢ — không gọi mạng, không tốn token."""
from types import SimpleNamespace

import pytest

from prompting import (DEFAULT_MODEL, DEFAULT_SYSTEM, EXTRA_BODY, build_few_shot, build_system_prompt,
                       choose_temperature, diversity, sample_answers)


class FakeClient:
    """Trả lần lượt các câu trong `replies` (hết thì quay vòng) và ghi lại mọi lần gọi."""

    def __init__(self, replies=("ITJobFinder",)):
        self.calls = []
        self._replies = list(replies)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        content = self._replies[len(self.calls) % len(self._replies)]
        self.calls.append(kwargs)
        message = SimpleNamespace(role="assistant", content=content)
        return SimpleNamespace(choices=[SimpleNamespace(index=0, message=message, finish_reason="stop")],
                               usage=SimpleNamespace(prompt_tokens=30, completion_tokens=5))


# ---------- build_system_prompt ----------

def test_build_system_prompt_day_du():
    got = build_system_prompt("Bạn là JobRadar.", ["Trả lời tiếng Việt", "Tối đa 3 câu"], "gạch đầu dòng")
    assert got == "Bạn là JobRadar.\nLuật:\n- Trả lời tiếng Việt\n- Tối đa 3 câu\nĐịnh dạng: gạch đầu dòng", (
        "Mỗi phần một dòng, nối bằng '\\n'; mỗi luật bắt đầu bằng '- '"
    )


def test_build_system_prompt_bo_luat_rong_va_strip():
    got = build_system_prompt("  Bạn là JobRadar.  ", ["  Ngắn gọn  ", "", "   "])
    assert got == "Bạn là JobRadar.\nLuật:\n- Ngắn gọn", (
        "strip persona và từng luật; bỏ luật rỗng; output_format=None thì không có dòng 'Định dạng'"
    )


def test_build_system_prompt_khong_co_luat():
    assert build_system_prompt("Bạn là JobRadar.", [], "  ") == "Bạn là JobRadar.", (
        "Không còn luật nào → không có dòng 'Luật:'; output_format rỗng → bỏ qua"
    )


@pytest.mark.parametrize("persona", ["", "   ", None])
def test_build_system_prompt_persona_rong(persona):
    with pytest.raises(ValueError):
        build_system_prompt(persona, ["Ngắn gọn"])


# ---------- build_few_shot ----------

def test_few_shot_thu_tu_messages():
    examples = [("Tin: tuyển Java dev", "backend"), ("Tin: tuyển React dev", "frontend")]
    got = build_few_shot("Phân loại tin tuyển dụng.", examples, "Tin: tuyển Airflow engineer")
    assert got == [
        {"role": "system", "content": "Phân loại tin tuyển dụng."},
        {"role": "user", "content": "Tin: tuyển Java dev"},
        {"role": "assistant", "content": "backend"},
        {"role": "user", "content": "Tin: tuyển React dev"},
        {"role": "assistant", "content": "frontend"},
        {"role": "user", "content": "Tin: tuyển Airflow engineer"},
    ], "Thứ tự: system → (user, assistant) cho từng ví dụ → user câu hỏi thật"


def test_few_shot_khong_vi_du():
    got = build_few_shot("S", [], "Q")
    assert got == [{"role": "system", "content": "S"}, {"role": "user", "content": "Q"}]


def test_few_shot_cau_hoi_rong():
    with pytest.raises(ValueError):
        build_few_shot("S", [("a", "b")], "   ")


# ---------- sample_answers ----------

def test_sample_answers_goi_dung_n_lan():
    client = FakeClient(["  A  ", "B", None])
    got = sample_answers("Đặt tên app", client, n=4, temperature=1.2)
    assert got == ["A", "B", "", "A"], "Trả list n câu trả lời theo thứ tự; strip; content None → ''"
    assert len(client.calls) == 4, "Phải gọi API đúng n lần"


def test_sample_answers_tham_so_moi_lan_goi():
    client = FakeClient()
    sample_answers("Q", client, n=2, temperature=0.3, max_tokens=20)
    for kwargs in client.calls:
        assert kwargs.get("temperature") == 0.3, "Truyền temperature=temperature mỗi lần gọi"
        assert kwargs.get("model") == DEFAULT_MODEL
        assert kwargs.get("max_tokens") == 20
        assert kwargs.get("extra_body") == EXTRA_BODY, "Nhớ extra_body=EXTRA_BODY như L03"
        assert kwargs.get("messages") == [{"role": "system", "content": DEFAULT_SYSTEM},
                                          {"role": "user", "content": "Q"}]


def test_sample_answers_khong_system():
    client = FakeClient()
    sample_answers("Q", client, n=1, system=None)
    assert client.calls[0]["messages"] == [{"role": "user", "content": "Q"}], "system=None → chỉ message user"


def test_sample_answers_n_khong_hop_le():
    client = FakeClient()
    with pytest.raises(ValueError):
        sample_answers("Q", client, n=0)
    assert client.calls == [], "n < 1 phải raise TRƯỚC khi gọi API"


# ---------- diversity ----------

def test_diversity_vi_du_docstring():
    assert diversity(["A", "a", "B", "A"]) == {"unique": 2, "stability": 0.75}, (
        "Chuẩn hóa strip()+lower() trước khi so; stability = số lần của câu phổ biến nhất / tổng"
    )


def test_diversity_tat_ca_giong_nhau():
    assert diversity(["ITJobFinder"] * 5) == {"unique": 1, "stability": 1.0}


def test_diversity_tat_ca_khac_nhau_va_lam_tron():
    assert diversity(["x", "y", "z"]) == {"unique": 3, "stability": 0.33}, "Nhớ round(..., 2)"
    assert diversity([" Job ", "job", "JOB"])["unique"] == 1, "Nhớ strip() trước khi so sánh"


def test_diversity_rong():
    with pytest.raises(ValueError):
        diversity([])


# ---------- choose_temperature ----------

@pytest.mark.parametrize("task, expected", [
    ("extract", 0.0), ("classify", 0.0), ("sql", 0.0),
    ("chat", 0.5), ("qa", 0.5),
    ("brainstorm", 1.0), ("slogan", 1.0),
])
def test_choose_temperature(task, expected):
    assert choose_temperature(task) == expected


def test_choose_temperature_khong_phan_biet_hoa_thuong():
    assert choose_temperature("  SQL ") == 0.0, "Dùng .strip().lower() trước khi tra"


def test_choose_temperature_loai_la():
    with pytest.raises(ValueError):
        choose_temperature("poem")
