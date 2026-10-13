"""Test tự chấm cho bài L05. Dùng client GIẢ — không gọi mạng, không tốn token."""
import copy
from types import SimpleNamespace

import pytest

from conversation import (DEFAULT_MODEL, EXTRA_BODY, Conversation, chat_turn, count_message_tokens,
                          estimate_tokens, trim_history)


class FakeClient:
    """Trả lần lượt các câu trong `replies` và ghi lại BẢN SAO messages của mỗi lần gọi."""

    def __init__(self, replies=("Chào bạn!",)):
        self.calls = []
        self._replies = list(replies)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        content = self._replies[len(self.calls) % len(self._replies)]
        self.calls.append(copy.deepcopy(kwargs))
        message = SimpleNamespace(role="assistant", content=content)
        return SimpleNamespace(choices=[SimpleNamespace(index=0, message=message, finish_reason="stop")],
                               usage=SimpleNamespace(prompt_tokens=50, completion_tokens=5))


def msg(role, content):
    return {"role": role, "content": content}


# ---------- Conversation ----------

def test_conversation_co_system():
    conv = Conversation("Bạn là JobRadar.")
    conv.add_user("Xin chào")
    conv.add_assistant("Chào bạn!")
    assert conv.messages() == [msg("system", "Bạn là JobRadar."), msg("user", "Xin chào"),
                               msg("assistant", "Chào bạn!")], "Thứ tự: system rồi lần lượt các lượt thêm vào"


@pytest.mark.parametrize("system", [None, "", "   "])
def test_conversation_khong_system(system):
    conv = Conversation(system)
    assert conv.messages() == [], "system None/rỗng → lịch sử ban đầu rỗng"
    conv.add_user("Hi")
    assert conv.messages() == [msg("user", "Hi")]


def test_conversation_messages_la_ban_sao():
    conv = Conversation("S")
    got = conv.messages()
    got.append(msg("user", "chen ngang"))
    assert conv.messages() == [msg("system", "S")], (
        "messages() phải trả list MỚI (vd. list(self._history)), sửa nó không được làm đổi lịch sử"
    )


def test_conversation_hai_doi_tuong_doc_lap():
    a, b = Conversation(), Conversation()
    a.add_user("chỉ ở a")
    assert b.messages() == [], "Mỗi Conversation có list riêng — tạo list trong __init__, đừng dùng biến dùng chung"


def test_conversation_user_rong():
    conv = Conversation()
    with pytest.raises(ValueError):
        conv.add_user("   ")
    conv.add_assistant("")
    assert conv.messages() == [msg("assistant", "")], "add_assistant chấp nhận chuỗi rỗng"


# ---------- estimate_tokens ----------

@pytest.mark.parametrize("text, expected", [("", 0), ("a", 1), ("abc", 1), ("abcd", 2), ("x" * 300, 100)])
def test_estimate_tokens(text, expected):
    assert estimate_tokens(text) == expected, "math.ceil(len(text) / 3)"


# ---------- count_message_tokens ----------

def test_count_message_tokens():
    assert count_message_tokens([msg("user", "abcdef"), msg("assistant", "")]) == (4 + 2) + (4 + 0), (
        "Mỗi message = MESSAGE_OVERHEAD (4) + estimate_tokens(content)"
    )


def test_count_message_tokens_rong():
    assert count_message_tokens([]) == 0


# ---------- trim_history ----------
# Mỗi message dài 30 ký tự = 10 token + 4 = 14; system "ssssss" = 2 + 4 = 6.
SYS = msg("system", "s" * 6)
U1, A1, U2, A2, U3 = (msg(r, ch * 30) for r, ch in
                      [("user", "a"), ("assistant", "b"), ("user", "c"), ("assistant", "d"), ("user", "e")])
HISTORY = [SYS, U1, A1, U2, A2, U3]


def test_trim_history_du_ngan_sach_giu_het():
    assert trim_history(HISTORY, 76) == HISTORY, "Tổng đúng bằng ngân sách (76) → giữ tất cả"


def test_trim_history_cat_tin_cu():
    assert trim_history(HISTORY, 50) == [SYS, U2, A2, U3], (
        "Giữ system + đi từ mới về cũ: 6+14 (U3) +14 (A2) +14 (U2) = 48 ≤ 50, thêm A1 thành 62 > 50 → dừng"
    )


def test_trim_history_luon_giu_system_va_tin_cuoi():
    assert trim_history(HISTORY, 10) == [SYS, U3], "Ngân sách quá nhỏ vẫn giữ system và câu mới nhất"


def test_trim_history_khong_co_system():
    assert trim_history([U1, A1, U2, A2, U3], 30) == [A2, U3], "Không có system thì chỉ cắt theo ngân sách"


def test_trim_history_dung_lai_khong_nhay_coc():
    big = msg("assistant", "b" * 300)  # 104 token
    small = msg("user", "abc")  # 5 token
    assert trim_history([SYS, small, big, U3], 60) == [SYS, U3], (
        "Gặp message không vừa thì DỪNG, không bỏ qua nó để lấy message cũ hơn (mất mạch hội thoại)"
    )


def test_trim_history_khong_sua_dau_vao():
    original = copy.deepcopy(HISTORY)
    trim_history(HISTORY, 10)
    assert HISTORY == original, "Không được sửa list đầu vào (đừng dùng pop/del trên messages)"


def test_trim_history_rong_va_chi_system():
    assert trim_history([], 100) == []
    assert trim_history([SYS], 100) == [SYS]


# ---------- chat_turn ----------

def test_chat_turn_luu_ca_hai_luot():
    conv = Conversation("S")
    answer = chat_turn(conv, "Data Engineer là gì?", FakeClient(["  Là người xây pipeline.  "]))
    assert answer == "Là người xây pipeline.", "Trả về content đã strip"
    assert conv.messages() == [msg("system", "S"), msg("user", "Data Engineer là gì?"),
                               msg("assistant", "Là người xây pipeline.")], "Lưu cả câu hỏi và câu trả lời vào conv"


def test_chat_turn_gui_lai_lich_su():
    conv, client = Conversation("S"), FakeClient(["Tên bạn là Lan.", "Bạn tên Lan."])
    chat_turn(conv, "Mình tên Lan", client)
    chat_turn(conv, "Mình tên gì?", client)
    assert len(client.calls) == 2, "Mỗi lượt gọi API đúng 1 lần"
    assert client.calls[1]["messages"] == [msg("system", "S"), msg("user", "Mình tên Lan"),
                                           msg("assistant", "Tên bạn là Lan."), msg("user", "Mình tên gì?")], (
        "Lượt 2 phải gửi lại TOÀN BỘ lịch sử — LLM không tự nhớ"
    )
    kwargs = client.calls[1]
    assert kwargs.get("model") == DEFAULT_MODEL and kwargs.get("max_tokens") == 512
    assert kwargs.get("extra_body") == EXTRA_BODY, "Nhớ extra_body=EXTRA_BODY"


def test_chat_turn_cat_theo_ngan_sach():
    conv, client = Conversation("s" * 6), FakeClient(["b" * 30])
    for ch in "ace":
        chat_turn(conv, ch * 30, client, max_context_tokens=50)
    sent = client.calls[-1]["messages"]
    assert sent == [SYS, msg("user", "c" * 30), msg("assistant", "b" * 30), msg("user", "e" * 30)], (
        "Gửi trim_history(conv.messages(), max_context_tokens), không gửi toàn bộ lịch sử"
    )
    assert len(conv.messages()) == 7, "conv vẫn giữ ĐỦ lịch sử; chỉ bản gửi đi bị cắt"


def test_chat_turn_content_none():
    conv = Conversation()
    assert chat_turn(conv, "Hi", FakeClient([None])) == ""
    assert conv.messages()[-1] == msg("assistant", "")
