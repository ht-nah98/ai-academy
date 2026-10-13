"""JobRadar — Bài L04: Temperature & system prompt.

Bài trước JobRadar đã biết trả lời. Bài này ta dạy nó trả lời ĐÚNG KIỂU:
- system prompt rõ ràng (vai trò, luật, định dạng, ví dụ mẫu),
- temperature phù hợp với từng loại việc,
- và ĐO được độ ổn định: hỏi cùng một câu N lần, đếm có bao nhiêu câu trả lời khác nhau.

Chạy thật:  python prompting.py "Đặt tên ngắn cho app tìm việc IT"
            (cần venv đã cài openai + file .env có NVIDIA_API_KEY — như L03)
Chạy test:  bấm "Chạy test" (client GIẢ, không gọi mạng, không tốn token).
"""
import os
import sys

BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"
DEFAULT_SYSTEM = (
    "Bạn là JobRadar, trợ lý về thị trường việc làm IT tại Việt Nam. "
    "Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt."
)
EXTRA_BODY = {"chat_template_kwargs": {"enable_thinking": False}}


def build_system_prompt(persona, rules, output_format=None):
    """Ghép system prompt từ 3 phần, mỗi phần một dòng (nối bằng "\\n"):

        <persona>
        Luật:
        - <luật 1>
        - <luật 2>
        Định dạng: <output_format>

    - persona: chuỗi mô tả vai trò. Rỗng/chỉ khoảng trắng -> raise ValueError.
    - rules: list chuỗi. Bỏ khoảng trắng hai đầu từng luật, BỎ QUA luật rỗng.
      Nếu không còn luật nào -> không có dòng "Luật:".
    - output_format: None hoặc rỗng -> không có dòng "Định dạng: ...".
    - persona và output_format cũng được strip.
    """
    # TODO
    raise NotImplementedError("TODO: viết build_system_prompt")


def build_few_shot(system, examples, question):
    """Tạo messages kiểu "few-shot": cho model xem vài cặp hỏi–đáp mẫu trước câu hỏi thật.

    - Đầu tiên là {"role": "system", "content": system}.
    - Mỗi cặp (hỏi, đáp) trong examples -> 2 message: "user" (hỏi) rồi "assistant" (đáp),
      giữ đúng thứ tự trong examples.
    - Cuối cùng là {"role": "user", "content": question}.
    - question rỗng/chỉ khoảng trắng -> raise ValueError.
    """
    # TODO
    raise NotImplementedError("TODO: viết build_few_shot")


def sample_answers(question, client, n=5, temperature=0.7, system=DEFAULT_SYSTEM,
                   model=DEFAULT_MODEL, max_tokens=64):
    """Hỏi CÙNG một câu n lần, trả về list n câu trả lời (theo thứ tự gọi).

    - Mỗi lần gọi client.chat.completions.create(...) bằng keyword với:
        model, messages (system + user như L03), temperature, max_tokens, extra_body=EXTRA_BODY.
      system None/rỗng -> chỉ có message "user".
    - Câu trả lời: response.choices[0].message.content, strip; None -> "".
    - n < 1 -> raise ValueError, không gọi API.
    """
    # TODO
    raise NotImplementedError("TODO: viết sample_answers")


def diversity(answers):
    """Đo độ đa dạng / ổn định của một list câu trả lời.

    So sánh sau khi chuẩn hóa: strip() và lower() (vậy "ITJob" và " itjob " là một).
    Trả về dict:
        {"unique": số câu trả lời khác nhau,
         "stability": (số lần xuất hiện của câu trả lời phổ biến nhất) / tổng, làm tròn 2 chữ số}
    answers rỗng -> raise ValueError.

    Ví dụ: ["A", "a", "B", "A"] -> {"unique": 2, "stability": 0.75}
    """
    # TODO
    raise NotImplementedError("TODO: viết diversity")


def choose_temperature(task_type):
    """Chọn temperature theo loại việc (không phân biệt hoa thường, bỏ khoảng trắng hai đầu).

    - Việc cần MỘT đáp án đúng, lặp lại được: "extract", "classify", "sql"  -> 0.0
    - Trò chuyện, hỏi đáp thông thường:          "chat", "qa"                -> 0.5
    - Việc cần ý tưởng mới:                      "brainstorm", "slogan"      -> 1.0
    - Loại khác -> raise ValueError (đừng đoán bừa).
    """
    # TODO
    raise NotImplementedError("TODO: viết choose_temperature")


# ----------------------------------------------------------------------------
# Phần dưới ĐÃ VIẾT SẴN: tạo client thật và chạy thí nghiệm temperature.
# ----------------------------------------------------------------------------

def load_api_key(env_path=".env"):
    """Lấy NVIDIA_API_KEY từ biến môi trường hoặc file .env (như L02, L03)."""
    key = os.environ.get("NVIDIA_API_KEY")
    if not key and os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                name, _, value = line.strip().partition("=")
                if name.strip() == "NVIDIA_API_KEY":
                    key = value.strip().strip('"').strip("'")
    if not key:
        raise RuntimeError("Thiếu NVIDIA_API_KEY — tạo file .env cạnh prompting.py (xem lesson.md)")
    return key


def make_client():
    from openai import OpenAI
    return OpenAI(base_url=BASE_URL, api_key=load_api_key())


if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or "Đặt một tên ngắn (tối đa 4 từ) cho app tìm việc IT. Chỉ trả về cái tên."
    client = make_client()
    for t in (0.0, 1.2):
        answers = sample_answers(question, client, n=5, temperature=t, system=None)
        print(f"temperature={t}: {diversity(answers)}")
        for a in answers:
            print("   ", a)
