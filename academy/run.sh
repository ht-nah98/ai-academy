#!/usr/bin/env bash
# Chạy app (chế độ dev, tự reload). Ưu tiên .venv ở thư mục gốc repo nếu có.
cd "$(dirname "$0")"
PY=python3
[ -x ../.venv/bin/python ] && PY=../.venv/bin/python
exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8100}" --reload
