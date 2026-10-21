#!/usr/bin/env bash
# Chạy app (chế độ dev, tự reload) — một server, mọi khóa học, cổng 8100. Ưu tiên .venv ở thư mục gốc repo nếu có.
cd "$(dirname "$0")"
PY=python3
[ -x ../.venv/bin/python ] && PY=../.venv/bin/python
[ -n "${1:-}" ] && echo "Lưu ý: không cần tham số khóa nữa (\"$1\" bị bỏ qua) — mọi khóa chạy chung một server, chọn ở trang Thư viện khóa học."
# Khóa Node có package.json mà chưa có node_modules, hoặc package-lock.json mới hơn bản đã cài → cài thư viện
for pkg in courses/*/package.json; do
  [ -f "$pkg" ] || continue
  C="$(dirname "$pkg")"
  if { [ ! -d "$C/node_modules" ] || [ "$C/package-lock.json" -nt "$C/node_modules/.package-lock.json" ]; } && command -v npm >/dev/null 2>&1; then
    echo "Cài thư viện cho khóa $(basename "$C") (npm install)…"
    (cd "$C" && npm install --no-audit --no-fund) || echo "npm install lỗi ở $C — chấm bài khóa này sẽ báo thiếu thư viện."
  fi
done
exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8100}" --reload
