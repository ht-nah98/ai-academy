#!/usr/bin/env bash
# Chạy app (chế độ dev, tự reload). Ưu tiên .venv ở thư mục gốc repo nếu có.
#   ./run.sh        → khóa AI (curriculum/), cổng 8100
#   ./run.sh node   → khóa Node.js & WebSocket (courses/node-realtime/), cổng 8200
cd "$(dirname "$0")"
PY=python3
[ -x ../.venv/bin/python ] && PY=../.venv/bin/python
DEFAULT_PORT=8100
case "${1:-}" in
  "" | ai) ;;
  node)
    C="$PWD/courses/node-realtime"
    if [ ! -d "$C/node_modules" ] && [ -f "$C/package.json" ]; then
      echo "Cài thư viện cho khóa Node (npm install)…"
      (cd "$C" && npm install --no-audit --no-fund) || exit 1
    fi
    export ACADEMY_CURRICULUM="$C/curriculum" ACADEMY_WORKSPACE="$C/workspace" ACADEMY_DATA="$C/data" ACADEMY_CACHE="$C/cache"
    DEFAULT_PORT=8200 ;;
  *) echo "Khóa không hợp lệ: $1 (dùng: ./run.sh [ai|node])"; exit 1 ;;
esac
exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-$DEFAULT_PORT}" --reload
