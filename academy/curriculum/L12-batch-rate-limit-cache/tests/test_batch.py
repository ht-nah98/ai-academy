"""Test tự chấm cho bài L12. Client GIẢ + đồng hồ GIẢ: không gọi mạng, không chờ thật.

run_batch được test với build_messages/parse giả, nên bài này qua test được
kể cả trước khi bạn copy extract.py của L11 sang (chạy thật thì cần copy).
"""
import json
from types import SimpleNamespace

import pytest

from batch import PARAMS, RateLimiter, cache_key, estimate_cost, run_batch


class FakeClock:
    """Đồng hồ giả: sleep(s) chỉ cộng s vào thời gian, không chờ thật."""

    def __init__(self):
        self.now, self.sleeps = 1000.0, []

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(round(seconds, 6))
        self.now += seconds


class HTTPError(Exception):
    def __init__(self, status_code):
        super().__init__(f"Error code: {status_code}")
        self.status_code = status_code


class FakeClient:
    """`script` là list: chuỗi = trả nội dung đó; Exception = raise. Hết script thì lặp phần tử cuối."""

    def __init__(self, script):
        self.script, self.calls = list(script), []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        item = self.script[min(len(self.calls), len(self.script)) - 1]
        if isinstance(item, Exception):
            raise item
        message = SimpleNamespace(role="assistant", content=item)
        usage = SimpleNamespace(prompt_tokens=1000, completion_tokens=100)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=usage)


def fake_messages(title, description):
    return [{"role": "user", "content": f"{title}: {description}"}]


def fake_parse(content):
    data = json.loads(content)
    if "skills" not in data:
        raise ValueError("thiếu skills")
    return data


JOBS = [{"job_id": f"J{i}", "title": f"Job {i}", "description": f"Mô tả {i}"} for i in range(1, 4)]
OK = '{"skills": ["SQL"]}'


# ---------- cache_key ----------

def test_cache_key_on_dinh_va_dung_dinh_dang():
    msgs = [{"role": "user", "content": "Xin chào"}]
    k = cache_key("m", msgs, {"temperature": 0, "max_tokens": 10})
    assert isinstance(k, str) and len(k) == 64 and all(c in "0123456789abcdef" for c in k), (
        "Trả hexdigest của SHA-256 (64 ký tự hex)"
    )
    assert k == cache_key("m", msgs, {"max_tokens": 10, "temperature": 0}), (
        "Cùng nội dung, khác thứ tự key → cùng khóa (json.dumps sort_keys=True)"
    )


def test_cache_key_doi_bat_ky_thanh_phan_nao_thi_doi_khoa():
    msgs = [{"role": "user", "content": "Xin chào"}]
    base = cache_key("m", msgs, {"temperature": 0})
    assert base != cache_key("m2", msgs, {"temperature": 0}), "Khác model → khác khóa"
    assert base != cache_key("m", [{"role": "user", "content": "Xin chào!"}], {"temperature": 0}), "Khác prompt → khác khóa"
    assert base != cache_key("m", msgs, {"temperature": 0.7}), "Khác tham số → khác khóa"


# ---------- RateLimiter ----------

def test_rate_limiter_khong_chan_khi_chua_vuot():
    fc = FakeClock()
    lim = RateLimiter(rpm=3, clock=fc.clock, sleep=fc.sleep)
    for _ in range(3):
        lim.wait()
    assert fc.sleeps == [], "3 lần gọi với rpm=3 → không phải chờ"


def test_rate_limiter_cho_dung_bang_thoi_gian_can_thiet():
    fc = FakeClock()
    lim = RateLimiter(rpm=3, clock=fc.clock, sleep=fc.sleep)
    lim.wait()
    fc.now += 10
    lim.wait()
    lim.wait()
    fc.now += 5          # t = 1015: đã có 3 lần gọi trong 60 giây gần nhất
    lim.wait()
    assert fc.sleeps == [45.0], (
        "Lần thứ 4 phải chờ tới khi lần gọi cũ nhất (t=1000) ra khỏi cửa sổ 60 giây: 1000 + 60 - 1015 = 45"
    )


def test_rate_limiter_cua_so_truot():
    fc = FakeClock()
    lim = RateLimiter(rpm=2, clock=fc.clock, sleep=fc.sleep)
    times = []
    for _ in range(6):
        lim.wait()
        times.append(fc.now)
    for i in range(len(times) - 2):
        assert times[i + 2] - times[i] >= 60, "Không bao giờ quá rpm lần gọi trong bất kỳ 60 giây nào"
    assert times[-1] - times[0] == 120, "6 lần, rpm=2 → lần cuối ở giây thứ 120 (không chờ thừa)"


# ---------- estimate_cost ----------

def test_estimate_cost_tu_mau_ra_tong():
    est = estimate_cost(prompt_tokens=21_000, completion_tokens=1_200, n_sampled=20, n_total=100_000,
                        prices={"input": 0.30, "output": 0.90})
    assert est == {"prompt_tokens_per_job": 1050.0, "completion_tokens_per_job": 60.0,
                   "per_job_usd": 0.000369, "total_usd": 36.9}, (
        "1 tin = 1050/1e6*0.30 + 60/1e6*0.90 = 0.000369 USD → 100.000 tin = 36.9 USD"
    )


def test_estimate_cost_lam_tron_sau_cung():
    est = estimate_cost(10, 10, n_sampled=3, n_total=1_000_000, prices={"input": 1.0, "output": 2.0})
    assert est["per_job_usd"] == 0.00001 and est["total_usd"] == 10.0, (
        "total_usd nhân từ per_job CHƯA làm tròn (0.00001), rồi mới làm tròn 2 chữ số"
    )
    assert est["prompt_tokens_per_job"] == 3.3


def test_estimate_cost_khong_co_mau():
    with pytest.raises(ValueError):
        estimate_cost(0, 0, n_sampled=0, n_total=10)


# ---------- run_batch ----------

def run(client, tmp_path, jobs=JOBS, **kw):
    fc = FakeClock()
    return run_batch(jobs, client, cache_dir=tmp_path / "cache", model="m", build_messages=fake_messages,
                     parse=fake_parse, sleep=fc.sleep, **kw)


def test_run_batch_ket_qua_va_thong_ke(tmp_path):
    client = FakeClient([OK])
    rep = run(client, tmp_path, prices={"input": 0.30, "output": 0.90})
    assert set(rep) == {"results", "errors", "stats"}
    assert rep["results"] == {"J1": {"skills": ["SQL"]}, "J2": {"skills": ["SQL"]}, "J3": {"skills": ["SQL"]}}
    assert rep["stats"] == {"total": 3, "ok": 3, "failed": 0, "cache_hits": 0, "api_calls": 3,
                            "prompt_tokens": 3000, "completion_tokens": 300, "cost_usd": 0.00117}, (
        "cost = 3000/1e6*0.30 + 300/1e6*0.90 = 0.00117"
    )
    kw = client.calls[0]
    assert kw["model"] == "m" and kw["messages"] == fake_messages("Job 1", "Mô tả 1")
    for k, v in PARAMS.items():
        assert kw.get(k) == v, f"Gửi kèm **PARAMS (thiếu {k})"


def test_run_batch_lan_hai_lay_tu_cache(tmp_path):
    run(FakeClient([OK]), tmp_path)
    client2 = FakeClient([OK])
    rep = run(client2, tmp_path)
    assert client2.calls == [], "Lần chạy thứ 2 với cùng input → không gọi API lần nào"
    assert rep["stats"]["cache_hits"] == 3 and rep["stats"]["api_calls"] == 0
    assert rep["stats"]["prompt_tokens"] == 0 and rep["stats"]["cost_usd"] == 0, "Cache hit = 0 token, 0 đồng"
    assert rep["results"]["J2"] == {"skills": ["SQL"]}
    files = sorted(p.name for p in (tmp_path / "cache").iterdir())
    assert len(files) == 3 and all(f.endswith(".json") for f in files), (
        "Mỗi tin 1 file <key>.json, không còn file .tmp"
    )


def test_run_batch_khong_cache_output_hong(tmp_path):
    rep = run(FakeClient(['{"level": "junior"}']), tmp_path, jobs=JOBS[:1])
    assert rep["errors"]["J1"].startswith("parse:"), "parse lỗi → errors[job_id] = 'parse: ...'"
    assert rep["stats"]["failed"] == 1 and rep["results"] == {}
    client2 = FakeClient([OK])
    rep2 = run(client2, tmp_path, jobs=JOBS[:1])
    assert len(client2.calls) == 1, "Output hỏng KHÔNG được ghi cache → lần sau phải gọi lại"
    assert rep2["results"] == {"J1": {"skills": ["SQL"]}}


def test_run_batch_loi_mot_tin_khong_dung_ca_lo(tmp_path):
    client = FakeClient([OK, HTTPError(401), OK])
    rep = run(client, tmp_path)
    assert set(rep["results"]) == {"J1", "J3"}, "Tin lỗi bị bỏ qua, các tin khác vẫn chạy"
    assert rep["errors"]["J2"].startswith("api:"), "Lỗi gọi API → errors[job_id] = 'api: ...'"
    assert rep["stats"]["api_calls"] == 2 and rep["stats"]["failed"] == 1


def test_run_batch_retry_va_rate_limit(tmp_path):
    class CountingLimiter:
        def __init__(self):
            self.waits = 0

        def wait(self):
            self.waits += 1

    client = FakeClient([HTTPError(429), OK])
    fc = FakeClock()
    lim = CountingLimiter()
    rep = run_batch(JOBS, client, cache_dir=tmp_path / "c", model="m", limiter=lim,
                    build_messages=fake_messages, parse=fake_parse, sleep=fc.sleep)
    assert rep["stats"]["ok"] == 3, "429 lần đầu → call_with_retry thử lại và thành công"
    assert len(client.calls) == 4, "3 tin + 1 lần thử lại"
    assert fc.sleeps == [2.0], "Backoff dùng hàm sleep truyền vào run_batch (call_with_retry(..., sleep=sleep))"
    assert lim.waits == 3, "limiter.wait() gọi 1 lần cho mỗi tin cần gọi API (trước call_with_retry)"
    run_batch(JOBS, FakeClient([OK]), cache_dir=tmp_path / "c", model="m", limiter=lim,
              build_messages=fake_messages, parse=fake_parse, sleep=fc.sleep)
    assert lim.waits == 3, "Cache hit thì không gọi API → không cần limiter.wait()"
