"""Đường dẫn cấu hình. ACADEMY_ROOT đổi gốc; từng thư mục có thể ghi đè riêng."""
import os
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parent.parent


def root() -> Path:
    return Path(os.environ.get("ACADEMY_ROOT") or DEFAULT_ROOT)


def _dir(env: str, name: str) -> Path:
    return Path(os.environ[env]) if os.environ.get(env) else root() / name


def curriculum_dir() -> Path:
    return _dir("ACADEMY_CURRICULUM", "curriculum")


def workspace_dir() -> Path:
    return _dir("ACADEMY_WORKSPACE", "workspace")


def data_dir() -> Path:
    return _dir("ACADEMY_DATA", "data")


def cache_dir() -> Path:
    return _dir("ACADEMY_CACHE", "cache") / "llm"
