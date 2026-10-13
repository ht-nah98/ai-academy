#!/usr/bin/env bash
# Chạy AI Academy. Đổi cổng: PORT=8200 ./start.sh
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Chưa có .venv — hãy chạy ./setup.sh trước."
  exit 1
fi
PORT="${PORT:-8100}"
echo "AI Academy chạy tại http://127.0.0.1:${PORT}  (Ctrl+C để dừng)"
cd academy
exec ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
