#!/usr/bin/env python3
"""Probe NVIDIA build.nvidia.com chat models: which respond, latency, reasoning output.

Usage: NVIDIA_API_KEY=nvapi-... python3 scripts/nv_probe.py [model ...]
Key is read from env, else from ./.env (NVIDIA_API_KEY=...). Results go to docs/probe-results.json.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "moonshotai/kimi-k3",
    "z-ai/glm-5.3",
    "z-ai/glm-5.3-flash",
    "deepseek-ai/deepseek-v4.1-flash",
    "openai/gpt-oss-20b",
    "google/gemma-4-31b-it",
    "poolside/laguna-xs-2.1",
]
PROMPT = "Trả lời bằng tiếng Việt, đúng một câu: 17 * 23 bằng bao nhiêu?"


def load_key():
    key = os.environ.get("NVIDIA_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("NVIDIA_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    if not key:
        sys.exit("NVIDIA_API_KEY not set (env or .env)")
    return key


def probe(model, key):
    body = {"model": model, "messages": [{"role": "user", "content": PROMPT}],
            "max_tokens": 1024, "temperature": 0.6}
    req = urllib.request.Request(f"{BASE}/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.load(r)
            headers = {k: v for k, v in r.headers.items() if "ratelimit" in k.lower()}
    except urllib.error.HTTPError as e:
        return {"model": model, "ok": False, "status": e.code,
                "error": e.read().decode(errors="replace")[:300]}
    except Exception as e:  # timeout, network
        return {"model": model, "ok": False, "error": repr(e)[:300]}
    msg = data["choices"][0]["message"]
    return {"model": model, "ok": True, "latency_s": round(time.time() - t0, 2),
            "answer": (msg.get("content") or "")[:200],
            "has_reasoning": bool(msg.get("reasoning_content") or msg.get("reasoning")),
            "usage": data.get("usage"), "ratelimit_headers": headers}


def main():
    key = load_key()
    results = []
    for m in sys.argv[1:] or DEFAULT_MODELS:
        res = probe(m, key)
        results.append(res)
        status = f"{res['latency_s']}s  {res['answer']!r}" if res["ok"] else f"FAIL {res.get('status', '')} {res['error'][:120]}"
        print(f"{m:45} {status}")
    out = ROOT / "docs" / "probe-results.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\nSaved {out}")


if __name__ == "__main__":
    main()
