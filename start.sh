#!/usr/bin/env bash
# Chạy AI Academy — một server phục vụ mọi khóa học (cổng 8100).
#   ./start.sh
# Đổi cổng: PORT=8300 ./start.sh
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Chưa có .venv — hãy chạy ./setup.sh trước."
  exit 1
fi
[ -n "${1:-}" ] && echo "Lưu ý: không cần tham số khóa nữa (\"$1\" bị bỏ qua) — mọi khóa chạy chung một server, chọn ở trang Thư viện khóa học."
# Khóa Node (academy/courses/<id>/package.json) chưa có node_modules → npm install
for pkg in academy/courses/*/package.json; do
  [ -f "$pkg" ] || continue
  C="$(dirname "$pkg")"
  [ -d "$C/node_modules" ] && continue
  if ! command -v npm >/dev/null 2>&1; then
    echo "Khóa $(basename "$C") cần Node.js 22 trở lên (https://nodejs.org) — các khóa khác vẫn dùng được."
    continue
  fi
  echo "Cài thư viện cho khóa $(basename "$C") (npm install)…"
  (cd "$C" && npm install --no-audit --no-fund) || echo "npm install lỗi ở $C — chấm bài khóa này sẽ báo thiếu thư viện."
done
PORT="${PORT:-8100}"
echo "AI Academy chạy tại http://127.0.0.1:${PORT}  (Ctrl+C để dừng)"
cd academy
exec ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
