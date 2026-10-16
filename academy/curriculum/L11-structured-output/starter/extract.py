"""JobRadar — Bài L11: Structured output & validate.

Trích kỹ năng, cấp bậc, lương, hình thức làm việc từ mô tả công việc (văn bản tự do)
thành JSON đúng schema. LLM trả về CHUỖI — chuỗi đó có thể sai định dạng, thiếu trường,
sai kiểu. Code của bạn phải kiểm định (validate) trước khi cho dữ liệu đi tiếp.

Cần pydantic + openai (đã có trong requirements.txt).
Chạy thật:  python extract.py          (trích 3 tin đầu trong CSDL của L10, cần .env có NVIDIA_API_KEY)
Chạy test:  bấm "Chạy test" (client GIẢ, không gọi mạng).
"""
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ValidationError, field_validator, model_validator

BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"
EXTRA_BODY = {"chat_template_kwargs": {"enable_thinking": False}}
# workspace/L11-structured-output/extract.py → lên 2 cấp là thư mục academy/
HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "L10-etl-chat-luong-du-lieu" / "jobradar.db"  # CSDL sạch bạn tạo ở L10

LEVELS = ("intern", "fresher", "junior", "middle", "senior")
WORK_MODES = ("remote", "hybrid", "onsite")

SYSTEM_RULES = """Bạn là bộ trích xuất thông tin tin tuyển dụng IT.
Đọc tiêu đề và mô tả, trả về DUY NHẤT một object JSON đúng schema sau, không giải thích, không markdown:
{schema}
Quy tắc:
- skills: mọi công nghệ/kỹ năng được nhắc tới (cả bắt buộc và "lợi thế"), giữ cách viết trong tin.
- level: một trong {levels}; không suy ra được thì null.
- salary_min, salary_max: triệu VND/tháng; chỉ có mức trần ("lên tới 30 triệu") thì salary_min = null; không có thì null.
- work_mode: một trong {modes}; tin không nói thì null.
- Không bịa: thông tin không có trong tin thì để null hoặc [].
"""

FEW_SHOT_TITLE = "Junior Data Analyst"
FEW_SHOT_DESCRIPTION = (
    "Công ty ABC cần tuyển Junior Data Analyst. Yêu cầu thành thạo SQL và Excel, "
    "biết Power BI là lợi thế. Lương lên tới 18 triệu. Làm hybrid 3 ngày/tuần."
)
FEW_SHOT_ANSWER = {"skills": ["SQL", "Excel", "Power BI"], "level": "junior",
                   "salary_min": None, "salary_max": 18, "work_mode": "hybrid"}


class ExtractionError(Exception):
    """LLM trả output không dùng được sau khi đã thử hết số lần cho phép."""


class JobInfo(BaseModel):
    """Schema đầu ra của bộ trích xuất. Mọi dữ liệu từ LLM phải đi qua đây.

    Trường (tất cả đều có giá trị mặc định → JSON thiếu trường vẫn hợp lệ):
      skills:     list[str], mặc định []
      level:      một trong LEVELS hoặc None
      salary_min: float >= 0 hoặc None   (triệu VND/tháng)
      salary_max: float >= 0 hoặc None
      work_mode:  một trong WORK_MODES hoặc None

    Chuẩn hóa TRƯỚC khi kiểm tra kiểu (field_validator(..., mode="before")):
      - skills: None → []; bỏ khoảng trắng hai đầu; bỏ chuỗi rỗng; bỏ trùng không phân biệt
        hoa thường, giữ lần xuất hiện đầu ("SQL", "sql " → ["SQL"]).
        skills không phải list (vd. chuỗi "Python, SQL") → trả nguyên để pydantic báo lỗi kiểu.
      - level, work_mode: chuỗi → .strip().lower(); chuỗi rỗng → None.
        ("Senior " → "senior"; "manager" vẫn lỗi vì không thuộc LEVELS.)
    Kiểm tra SAU (model_validator(mode="after")):
      - salary_min hoặc salary_max âm → lỗi
      - có cả hai mà salary_min > salary_max → lỗi
    Lỗi thì raise ValueError trong validator — pydantic gom lại thành ValidationError.
    """

    # TODO: khai báo 5 trường và các validator theo docstring
    pass


def build_extraction_messages(title, description):
    """Tạo messages cho một lần trích xuất — 4 message, đúng thứ tự:

      1. system:    SYSTEM_RULES.format(schema=..., levels=..., modes=...)
                      schema = json.dumps(JobInfo.model_json_schema(), ensure_ascii=False)
                      levels = ", ".join(LEVELS);  modes = ", ".join(WORK_MODES)
      2. user:      ví dụ mẫu — format_job(FEW_SHOT_TITLE, FEW_SHOT_DESCRIPTION)
      3. assistant: câu trả lời mẫu — json.dumps(FEW_SHOT_ANSWER, ensure_ascii=False)
      4. user:      tin thật — format_job(title, description)

    Schema lấy từ JobInfo → sửa model là prompt tự cập nhật (một nguồn sự thật).
    """
    # TODO
    raise NotImplementedError("TODO: viết build_extraction_messages")


def parse_json_reply(text):
    """Lấy object JSON từ câu trả lời của LLM, trả về dict.

    LLM hay "trang trí" output. Phải chịu được:
      - khoảng trắng / xuống dòng thừa
      - bọc trong code fence: ```json ... ```  hoặc  ``` ... ```
      - chữ thừa trước/sau: 'Đây là kết quả: {...} Hy vọng giúp ích!'
        → lấy đoạn từ dấu '{' ĐẦU TIÊN tới dấu '}' CUỐI CÙNG
    text là None/rỗng, không có '{' ... '}', JSON hỏng, hoặc JSON không phải object (vd. list)
    → raise ValueError.
    (json.JSONDecodeError đã là con của ValueError.)
    """
    # TODO
    raise NotImplementedError("TODO: viết parse_json_reply")


def extract_job(title, description, client, model=DEFAULT_MODEL, max_attempts=2):
    """Trích một tin → JobInfo. Có vòng tự sửa (repair) khi output sai.

    Mỗi lần thử gọi ĐÚNG MỘT lần:
        client.chat.completions.create(model=model, messages=messages, temperature=0,
                                       max_tokens=400, extra_body=EXTRA_BODY)
    rồi: content → parse_json_reply → JobInfo.model_validate.

    Lần đầu messages = build_extraction_messages(title, description).
    Thất bại (ValueError hoặc ValidationError) và còn lượt → thêm 2 message rồi gọi lại:
        {"role": "assistant", "content": <output vừa nhận>}
        {"role": "user", "content": REPAIR_PROMPT.format(error=<str(lỗi)>)}
    Hết max_attempts lượt vẫn lỗi → raise ExtractionError (kèm thông điệp lỗi cuối).
    description rỗng/chỉ khoảng trắng → raise ValueError, KHÔNG gọi API.
    """
    # TODO
    raise NotImplementedError("TODO: viết extract_job")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN.
# ----------------------------------------------------------------------------

REPAIR_PROMPT = ("Output vừa rồi không hợp lệ: {error}\n"
                 "Trả lại DUY NHẤT object JSON đúng schema, không giải thích.")


def format_job(title, description):
    return f"Tiêu đề: {title}\nMô tả: {description}"


def load_api_key():
    """NVIDIA_API_KEY: biến môi trường trước, rồi .env cạnh file này, rồi .env ở gốc repo."""
    key = os.environ.get("NVIDIA_API_KEY")
    for env_path in (HERE / ".env", HERE.parents[2] / ".env"):
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
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    client = make_client()
    if not DB_PATH.exists():
        raise SystemExit(f"Chưa có {DB_PATH} — hãy chạy `python pipeline.py` ở bài L10 trước.")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT job_id, title, description FROM jobs ORDER BY job_id LIMIT ?", (n,)).fetchall()
    conn.close()
    for row in rows:
        print(f"\n{row['job_id']} | {row['title']}\n  {row['description'][:120]}...")
        try:
            print("  →", extract_job(row["title"], row["description"], client).model_dump())
        except ExtractionError as e:
            print("  ✗", e)
