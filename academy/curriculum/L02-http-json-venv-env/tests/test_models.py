"""Test tự chấm cho bài L02. KHÔNG gọi mạng: dùng JSON giả và file .env tạm."""
import pytest

from models import (MODELS_URL, fetch_model_ids, filter_by_keyword, get_api_key,
                    group_by_publisher, parse_model_ids, read_env_file)

FAKE_PAYLOAD = {
    "object": "list",
    "data": [
        {"id": "nvidia/nemotron-3-super-120b-a12b", "object": "model", "owned_by": "nvidia"},
        {"id": "meta/llama-3.1-8b-instruct", "object": "model", "owned_by": "meta"},
        {"id": "deepseek-ai/deepseek-v4.1-flash", "object": "model", "owned_by": "deepseek-ai"},
        {"id": "nvidia/nemotron-3-embed-1b", "object": "model", "owned_by": "nvidia"},
        {"id": "meta/codellama-70b", "object": "model", "owned_by": "meta"},
    ],
}


# ---------- read_env_file ----------

def test_read_env_co_ban(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "# file bí mật, không commit\n"
        "\n"
        "NVIDIA_API_KEY=nvapi-abc123\n"
        "  MODEL = nvidia/nemotron  \n",
        encoding="utf-8",
    )
    assert read_env_file(str(env)) == {"NVIDIA_API_KEY": "nvapi-abc123", "MODEL": "nvidia/nemotron"}, (
        "Bỏ qua dòng trống và dòng '#', nhớ .strip() cả key lẫn value"
    )


def test_read_env_dau_bang_va_dau_nhay(tmp_path):
    env = tmp_path / ".env"
    env.write_text('TOKEN=a=b=c\nNAME="JobRadar"\nCITY=\'Hà Nội\'\n', encoding="utf-8")
    assert read_env_file(str(env)) == {"TOKEN": "a=b=c", "NAME": "JobRadar", "CITY": "Hà Nội"}, (
        "Chỉ tách ở dấu '=' đầu tiên (split('=', 1)) và bỏ cặp nháy bao quanh value"
    )


def test_read_env_khong_co_file(tmp_path):
    assert read_env_file(str(tmp_path / "khong-ton-tai.env")) == {}, (
        "File không tồn tại thì trả về {} thay vì để FileNotFoundError"
    )


# ---------- get_api_key ----------

def test_key_uu_tien_bien_moi_truong(tmp_path):
    env = tmp_path / ".env"
    env.write_text("NVIDIA_API_KEY=tu-file\n", encoding="utf-8")
    assert get_api_key(str(env), environ={"NVIDIA_API_KEY": "tu-env"}) == "tu-env", (
        "Biến môi trường phải được ưu tiên hơn file .env"
    )


def test_key_lay_tu_file_env(tmp_path):
    env = tmp_path / ".env"
    env.write_text("NVIDIA_API_KEY=tu-file\n", encoding="utf-8")
    assert get_api_key(str(env), environ={}) == "tu-file", (
        "Không có biến môi trường thì đọc từ file .env (dùng read_env_file)"
    )


def test_key_thieu_thi_bao_loi(tmp_path):
    with pytest.raises(RuntimeError, match="NVIDIA_API_KEY") as err:
        get_api_key(str(tmp_path / ".env"), environ={})
    assert not isinstance(err.value, NotImplementedError), "Hàm get_api_key vẫn còn là TODO"


def test_key_rong_coi_nhu_thieu(tmp_path):
    env = tmp_path / ".env"
    env.write_text("NVIDIA_API_KEY=\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="NVIDIA_API_KEY"):
        get_api_key(str(env), environ={})


# ---------- parse / fetch ----------

def test_parse_model_ids_sap_xep():
    assert parse_model_ids(FAKE_PAYLOAD) == [
        "deepseek-ai/deepseek-v4.1-flash",
        "meta/codellama-70b",
        "meta/llama-3.1-8b-instruct",
        "nvidia/nemotron-3-embed-1b",
        "nvidia/nemotron-3-super-120b-a12b",
    ], "Lấy item['id'] của từng phần tử trong payload['data'] rồi sorted()"


@pytest.mark.parametrize("bad", [{"error": "unauthorized"}, {"data": "oops"}, ["not", "a", "dict"]])
def test_parse_payload_sai_bao_valueerror(bad):
    with pytest.raises(ValueError):
        parse_model_ids(bad)


def test_fetch_dung_ham_fetch_duoc_truyen_vao():
    called = []

    def fake_get(url):
        called.append(url)
        return FAKE_PAYLOAD

    ids = fetch_model_ids(fetch=fake_get)
    assert called == [MODELS_URL], "fetch_model_ids phải gọi hàm fetch được truyền vào đúng 1 lần, với MODELS_URL"
    assert len(ids) == 5 and ids[0] == "deepseek-ai/deepseek-v4.1-flash", (
        "Kết quả phải là parse_model_ids(...) của JSON mà fetch trả về"
    )


# ---------- group / filter ----------

def test_group_by_publisher():
    ids = parse_model_ids(FAKE_PAYLOAD) + ["mystery-model"]
    assert group_by_publisher(ids) == {
        "deepseek-ai": ["deepseek-ai/deepseek-v4.1-flash"],
        "meta": ["meta/codellama-70b", "meta/llama-3.1-8b-instruct"],
        "nvidia": ["nvidia/nemotron-3-embed-1b", "nvidia/nemotron-3-super-120b-a12b"],
        "unknown": ["mystery-model"],
    }, "Publisher = phần trước '/' (model_id.split('/', 1)[0]); không có '/' thì vào 'unknown'"


def test_group_list_sap_xep():
    result = group_by_publisher(["z/b", "z/a"])
    assert result == {"z": ["z/a", "z/b"]}, "Mỗi list trong nhóm phải sắp xếp A→Z"


def test_filter_by_keyword():
    ids = [m["id"] for m in FAKE_PAYLOAD["data"]]
    assert filter_by_keyword(ids, "NEMOTRON") == [
        "nvidia/nemotron-3-super-120b-a12b",
        "nvidia/nemotron-3-embed-1b",
    ], "Không phân biệt hoa thường và giữ nguyên thứ tự ban đầu"
    assert filter_by_keyword(ids, "gpt") == [], "Không khớp thì trả về []"
