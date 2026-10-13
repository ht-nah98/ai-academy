#!/usr/bin/env bash
# Cài đặt AI Academy (WSL / Ubuntu / Linux / macOS). Chạy lại nhiều lần vẫn an toàn.
set -e
cd "$(dirname "$0")"

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "LỖI: không tìm thấy Python 3.10 trở lên (khuyến nghị 3.12)."
  echo "Cài trên Ubuntu/WSL:"
  echo "  sudo apt update && sudo apt install python3 python3-venv python3-pip"
  echo "Sau đó chạy lại: ./setup.sh"
  exit 1
fi
echo "==> Dùng $($PY --version) ($(command -v $PY))"

if [ ! -x .venv/bin/python ]; then
  echo "==> Tạo môi trường ảo .venv ..."
  rm -rf .venv
  if ! "$PY" -m venv .venv; then
    echo "LỖI: không tạo được venv. Trên Ubuntu/WSL hãy chạy:"
    echo "  sudo apt install python3-venv python3-pip"
    echo "rồi chạy lại ./setup.sh"
    rm -rf .venv
    exit 1
  fi
else
  echo "==> .venv đã có, bỏ qua bước tạo."
fi

echo "==> Cài thư viện (có thể mất 1-3 phút) ..."
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/python -m pip install -r academy/requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Đã tạo file .env từ .env.example."
else
  echo "==> .env đã có, giữ nguyên."
fi

cat <<'MSG'

Xong! Các bước tiếp theo:
  1. Mở file .env, thay nvapi-... bằng API key của bạn (lấy miễn phí tại https://build.nvidia.com).
     Có thể làm sau — chưa có key vẫn học được các bài chạy test.
  2. Chạy app:   ./start.sh
  3. Mở trình duyệt:  http://127.0.0.1:8100
MSG
