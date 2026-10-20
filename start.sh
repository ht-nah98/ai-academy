#!/usr/bin/env bash
# Chạy AI Academy.
#   ./start.sh        → khóa AI & Data (cổng 8100)
#   ./start.sh node   → khóa Node.js & WebSocket (cổng 8200)
# Đổi cổng: PORT=8300 ./start.sh node
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Chưa có .venv — hãy chạy ./setup.sh trước."
  exit 1
fi
NAME="AI Academy"
DEFAULT_PORT=8100
case "${1:-}" in
  "" | ai) ;;
  node)
    C="$PWD/academy/courses/node-realtime"
    if ! command -v node >/dev/null 2>&1; then
      echo "Chưa có Node.js — hãy cài Node.js 22 trở lên (https://nodejs.org) rồi chạy lại."
      exit 1
    fi
    if [ ! -d "$C/node_modules" ] && [ -f "$C/package.json" ]; then
      echo "Cài thư viện cho khóa Node (npm install)…"
      (cd "$C" && npm install --no-audit --no-fund) || exit 1
    fi
    export ACADEMY_CURRICULUM="$C/curriculum" ACADEMY_WORKSPACE="$C/workspace" ACADEMY_DATA="$C/data" ACADEMY_CACHE="$C/cache"
    NAME="Khóa Node.js & WebSocket"
    DEFAULT_PORT=8200 ;;
  *) echo "Khóa không hợp lệ: $1 (dùng: ./start.sh [ai|node])"; exit 1 ;;
esac
PORT="${PORT:-$DEFAULT_PORT}"
echo "$NAME chạy tại http://127.0.0.1:${PORT}  (Ctrl+C để dừng)"
cd academy
exec ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
