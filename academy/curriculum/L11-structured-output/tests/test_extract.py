"""Test tự chấm cho bài L11. Client GIẢ trả lần lượt các chuỗi cho trước — không gọi mạng."""
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from extract import (FEW_SHOT_ANSWER, LEVELS, WORK_MODES, ExtractionError, JobInfo,
                     build_extraction_messages, extract_job, parse_json_reply)

GOOD = '{"skills": ["Python", "SQL"], "level": "junior", "salary_min": 15, "salary_max": 22, "work_mode": "hybrid"}'


class FakeClient:
    """Mỗi lần create(...) trả chuỗi kế tiếp trong `replies` và ghi lại tham số."""

    def __init__(self, *replies):
        self.replies, self.calls = list(replies), []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        content = self.replies[min(len(self.calls), len(self.replies)) - 1]
        message = SimpleNamespace(role="assistant", content=content)
        usage = SimpleNamespace(prompt_tokens=300, completion_tokens=40, total_tokens=340)
        return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason="stop")], usage=usage)


# ---------- JobInfo ----------

def test_jobinfo_hop_le_va_mac_dinh():
    info = JobInfo.model_validate(json.loads(GOOD))
    assert info.skills == ["Python", "SQL"] and info.level == "junior" and info.work_mode == "hybrid"
    assert info.salary_min == 15 and info.salary_max == 22
    empty = JobInfo.model_validate({})
    assert empty.model_dump() == {"skills": [], "level": None, "salary_min": None,
                                  "salary_max": None, "work_mode": None}, (
        "Mọi trường cần giá trị mặc định: skills=[] (không phải None), còn lại None"
    )


def test_jobinfo_chuan_hoa_skills():
    info = JobInfo.model_validate({"skills": [" SQL", "sql ", "", "Python", "  ", "PYTHON", "dbt"]})
    assert info.skills == ["SQL", "Python", "dbt"], (
        "skills: strip, bỏ chuỗi rỗng, bỏ trùng không phân biệt hoa thường (giữ lần đầu), giữ thứ tự"
    )
    assert JobInfo.model_validate({"skills": None}).skills == [], "skills = None → []"


def test_jobinfo_chuan_hoa_level_va_work_mode():
    info = JobInfo.model_validate({"level": " Senior ", "work_mode": "REMOTE"})
    assert info.level == "senior" and info.work_mode == "remote", (
        "level/work_mode: .strip().lower() trước khi kiểm tra (field_validator mode='before')"
    )
    blank = JobInfo.model_validate({"level": "", "work_mode": "  "})
    assert blank.level is None and blank.work_mode is None, "Chuỗi rỗng/khoảng trắng → None"
    assert set(LEVELS) == {"intern", "fresher", "junior", "middle", "senior"}
    assert set(WORK_MODES) == {"remote", "hybrid", "onsite"}


@pytest.mark.parametrize("bad", [
    {"level": "manager"},
    {"work_mode": "freelance"},
    {"skills": "Python, SQL"},
    {"salary_min": "khoảng 20"},
])
def test_jobinfo_tu_choi_gia_tri_sai(bad):
    with pytest.raises(ValidationError):
        JobInfo.model_validate(bad)


@pytest.mark.parametrize("bad", [
    {"salary_min": 30, "salary_max": 20},
    {"salary_min": -5},
    {"salary_max": -1},
])
def test_jobinfo_kiem_tra_luong(bad):
    with pytest.raises(ValidationError):
        JobInfo.model_validate(bad)
    assert JobInfo.model_validate({"salary_min": None, "salary_max": 18}).salary_max == 18, (
        "Chỉ có mức trần (salary_min = None) vẫn hợp lệ"
    )


# ---------- parse_json_reply ----------

@pytest.mark.parametrize("text", [
    GOOD,
    f"\n\n  {GOOD}  \n",
    f"```json\n{GOOD}\n```",
    f"```\n{GOOD}\n```",
    f"Đây là kết quả: {GOOD} Hy vọng giúp ích!",
])
def test_parse_json_reply_chiu_duoc_trang_tri(text):
    assert parse_json_reply(text) == json.loads(GOOD), (
        "Lấy đoạn từ '{' đầu tiên tới '}' cuối cùng rồi json.loads"
    )


@pytest.mark.parametrize("text", ["", "Xin lỗi, tôi không trích được.", '{"skills": ["SQL",}', '["SQL"]'])
def test_parse_json_reply_loi(text):
    with pytest.raises(ValueError):
        parse_json_reply(text)


# ---------- build_extraction_messages ----------

def test_build_messages_cau_truc_few_shot():
    msgs = build_extraction_messages("Junior Data Engineer", "Yêu cầu Python, SQL.")
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "user"], (
        "4 message: system, user (ví dụ), assistant (đáp án mẫu), user (tin thật)"
    )
    assert json.loads(msgs[2]["content"]) == FEW_SHOT_ANSWER, "assistant mẫu = json.dumps(FEW_SHOT_ANSWER)"
    JobInfo.model_validate(json.loads(msgs[2]["content"]))
    assert "Junior Data Engineer" in msgs[3]["content"] and "Yêu cầu Python, SQL." in msgs[3]["content"], (
        "Message cuối chứa tiêu đề và mô tả của tin thật (dùng format_job)"
    )


def test_build_messages_system_chua_schema():
    system = build_extraction_messages("T", "D")[0]["content"]
    for field in ("skills", "level", "salary_min", "salary_max", "work_mode"):
        assert f'"{field}"' in system, f"System prompt phải chứa schema JSON (thiếu trường {field})"
    for value in LEVELS + WORK_MODES:
        assert value in system, f"System prompt phải liệt kê giá trị hợp lệ: thiếu {value}"
    assert "{schema}" not in system and "{levels}" not in system, "Nhớ .format(...) các chỗ {schema}, {levels}, {modes}"


# ---------- extract_job ----------

def test_extract_job_thanh_cong_mot_lan_goi():
    client = FakeClient(f"```json\n{GOOD}\n```")
    info = extract_job("Junior DE", "Yêu cầu Python, SQL.", client)
    assert isinstance(info, JobInfo), "extract_job trả về đối tượng JobInfo"
    assert info.level == "junior"
    assert len(client.calls) == 1, "Output hợp lệ ngay → chỉ gọi API 1 lần"
    kw = client.calls[0]
    assert kw.get("temperature") == 0, "Trích xuất cần ổn định: temperature=0"
    assert kw.get("extra_body") == {"chat_template_kwargs": {"enable_thinking": False}}
    assert kw.get("messages") == build_extraction_messages("Junior DE", "Yêu cầu Python, SQL.")


def test_extract_job_tu_sua_khi_output_sai():
    bad = '{"skills": ["Python"], "level": "Lead"}'
    client = FakeClient(bad, GOOD)
    info = extract_job("Junior DE", "Yêu cầu Python, SQL.", client)
    assert info.level == "junior", "Lần 1 sai schema → gửi lỗi lại cho model → lần 2 đúng"
    assert len(client.calls) == 2
    second = client.calls[1]["messages"]
    assert len(second) == 6, "Lần thử lại = messages cũ + assistant (output sai) + user (thông báo lỗi)"
    assert second[4] == {"role": "assistant", "content": bad}, "Message thứ 5: nguyên output sai của model"
    assert second[5]["role"] == "user" and "level" in second[5]["content"], (
        "Message thứ 6: REPAIR_PROMPT chứa thông điệp lỗi (để model biết sai ở đâu)"
    )


def test_extract_job_het_luot_thi_raise():
    client = FakeClient("không phải JSON", "vẫn không phải JSON", GOOD)
    with pytest.raises(ExtractionError):
        extract_job("T", "Mô tả", client, max_attempts=2)
    assert len(client.calls) == 2, "max_attempts=2 → gọi tối đa 2 lần rồi raise ExtractionError"


def test_extract_job_mo_ta_rong_khong_goi_api():
    client = FakeClient(GOOD)
    with pytest.raises(ValueError):
        extract_job("T", "   ", client)
    assert client.calls == [], "Mô tả rỗng → raise ValueError trước khi gọi API"
