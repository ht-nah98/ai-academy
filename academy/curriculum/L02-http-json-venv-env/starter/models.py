"""JobRadar — Bài L02: HTTP, JSON, venv, .env — gọi API NVIDIA.

JobRadar sẽ dùng các model AI miễn phí trên build.nvidia.com. Trước khi gọi model,
ta cần biết: có những model nào? của hãng nào? Endpoint công khai (không cần key):

    GET https://integrate.api.nvidia.com/v1/models

trả về JSON dạng:

    {"object": "list",
     "data": [{"id": "meta/llama-3.1-8b-instruct", "object": "model", "owned_by": "meta"}, ...]}

Chạy thật:  python models.py            (in thống kê)
            python models.py nemotron   (lọc theo từ khóa)
Chạy test:  bấm "Chạy test" trên web app (test KHÔNG gọi mạng).
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

MODELS_URL = "https://integrate.api.nvidia.com/v1/models"


def http_get_json(url, timeout=15):
    """Gửi HTTP GET tới `url`, trả về dữ liệu JSON đã parse (dict/list).

    Hàm này ĐÃ VIẾT SẴN — đọc để hiểu: gửi request, kiểm tra status, rồi parse body JSON.
    """
    request = urllib.request.Request(url, headers={"Accept": "application/json",
                                                   "User-Agent": "JobRadar/0.1"})
    # urlopen tự raise urllib.error.HTTPError nếu status là 4xx/5xx
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read()           # bytes — dữ liệu thô từ mạng
    return json.loads(body)              # bytes/str JSON -> dict Python


def read_env_file(path):
    """Đọc file .env, trả về dict {TÊN: giá_trị}.

    Quy tắc:
    - Mỗi dòng dạng KEY=VALUE. Bỏ khoảng trắng thừa hai bên key và value.
    - Bỏ qua dòng trống và dòng bắt đầu bằng '#'.
    - Chỉ tách ở dấu '=' ĐẦU TIÊN (value có thể chứa '=': "A=x=y" -> {"A": "x=y"}).
    - Nếu value nằm trong cặp nháy "..." hoặc '...' thì bỏ cặp nháy đó.
    - File không tồn tại -> trả về {} (không raise).

    Gợi ý: os.path.exists(path), open(path, encoding="utf-8"), line.strip(),
            line.split("=", 1)
    """
    # TODO
    raise NotImplementedError("TODO: viết read_env_file")


def get_api_key(env_path=".env", environ=None):
    """Lấy NVIDIA_API_KEY: ưu tiên biến môi trường, sau đó tới file .env.

    - `environ` là dict biến môi trường; nếu None thì dùng os.environ.
      (Tham số này tồn tại để test có thể truyền dict giả, không đụng máy thật.)
    - Nếu không tìm thấy ở đâu (hoặc giá trị rỗng) -> raise RuntimeError với
      thông báo có chứa chữ "NVIDIA_API_KEY" và hướng dẫn tạo file .env.
    """
    # TODO: if environ is None: environ = os.environ
    raise NotImplementedError("TODO: viết get_api_key")


def parse_model_ids(payload):
    """Từ JSON của /v1/models, trả về list các "id" model, sắp xếp A→Z.

    - payload có dạng {"data": [{"id": ...}, ...]}.
    - Nếu payload không phải dict hoặc không có key "data" là một list
      -> raise ValueError (API trả về thứ ta không hiểu thì phải báo rõ).
    """
    # TODO
    raise NotImplementedError("TODO: viết parse_model_ids")


def fetch_model_ids(fetch=http_get_json, url=MODELS_URL):
    """Lấy danh sách id model: gọi hàm `fetch` với `url` rồi parse_model_ids(...).

    `fetch` là hàm nhận url và trả về JSON đã parse. Mặc định là http_get_json
    (gọi mạng thật); test sẽ truyền vào một hàm giả trả về JSON cố định.
    """
    # TODO: 2 dòng là đủ
    raise NotImplementedError("TODO: viết fetch_model_ids")


def group_by_publisher(model_ids):
    """Nhóm model theo nhà phát hành (phần trước dấu '/' đầu tiên trong id).

    Trả về dict {publisher: [id, ...]}, mỗi list sắp xếp A→Z.
    id không có '/' -> nhóm "unknown".

    Ví dụ: ["meta/llama-3", "nvidia/nemotron", "meta/codellama"]
        -> {"meta": ["meta/codellama", "meta/llama-3"], "nvidia": ["nvidia/nemotron"]}
    """
    # TODO
    raise NotImplementedError("TODO: viết group_by_publisher")


def filter_by_keyword(model_ids, keyword):
    """Trả về các id chứa `keyword` (không phân biệt hoa thường), giữ thứ tự."""
    # TODO
    raise NotImplementedError("TODO: viết filter_by_keyword")


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    env_path = here / ".env"
    if not env_path.exists():
        env_path = here.parents[2] / ".env"  # gốc repo
    key = get_api_key(str(env_path))
    print(f"Key từ {env_path}: {key[:8]}... ({len(key)} ký tự)")
    ids = fetch_model_ids()
    print(f"Có {len(ids)} model trên build.nvidia.com")
    groups = group_by_publisher(ids)
    # Xếp nhà phát hành theo số model giảm dần, lấy 5 nhà đầu.
    # lambda kv: -len(kv[1]) = một hàm def không tên (xem L01 Bước 6).
    top = sorted(groups.items(), key=lambda kv: -len(kv[1]))[:5]
    for publisher, models in top:
        print(f"  {publisher:<15} {len(models)} model")
    if len(sys.argv) > 1:
        for model_id in filter_by_keyword(ids, sys.argv[1]):
            print("  -", model_id)
