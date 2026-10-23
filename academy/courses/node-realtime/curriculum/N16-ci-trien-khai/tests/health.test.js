// Test tự chấm cho bài N16 — registerHealthRoutes (health.ts).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';

const { registerHealthRoutes } = await import(pathToFileURL(join(process.cwd(), 'health.ts')).href);

/** App Express tí hon chỉ có health routes, DB giả; trả { get(path) → { status, body, cacheControl } }. */
async function startHealth(t, deps) {
  const app = express();
  registerHealthRoutes(app, deps);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async get(path) {
      const res = await fetch(base + path, { signal: AbortSignal.timeout(3000) });
      return { status: res.status, body: await res.json(), cacheControl: res.headers.get('cache-control') };
    },
  };
}

function fakeDb(impl) {
  const calls = [];
  return { calls, query: (sql, params) => { calls.push(sql); return impl(sql, params); } };
}

describe('registerHealthRoutes', () => {
  test('registerHealthRoutes: /health luôn 200 ok, không gọi DB, no-store', async (t) => {
    const db = fakeDb(() => Promise.reject(new Error('db chết')));
    const h = await startHealth(t, { db, isShuttingDown: () => false });
    const r = await h.get('/health');
    assert.equal(r.status, 200, '/health phải 200 kể cả khi DB lỗi');
    assert.deepEqual(r.body, { status: 'ok' }, '/health trả { status: "ok" }');
    assert.equal(db.calls.length, 0, '/health không được gọi DB');
    assert.match(String(r.cacheControl), /no-store/, '/health phải có Cache-Control: no-store');
  });

  test('registerHealthRoutes: /ready 200 khi DB trả lời, 503 db_unavailable khi DB lỗi', async (t) => {
    let healthy = true;
    const db = fakeDb(() => (healthy ? Promise.resolve({ rows: [{ '?column?': 1 }] }) : Promise.reject(new Error('ECONNREFUSED'))));
    const h = await startHealth(t, { db, isShuttingDown: () => false });
    const ok = await h.get('/ready');
    assert.equal(ok.status, 200, '/ready phải 200 khi DB trả lời');
    assert.deepEqual(ok.body, { status: 'ready' }, '/ready trả { status: "ready" }');
    assert.ok(db.calls.some((s) => /select\s+1/i.test(s)), '/ready phải chạy SELECT 1');
    assert.match(String(ok.cacheControl), /no-store/, '/ready phải có Cache-Control: no-store');
    healthy = false;
    const bad = await h.get('/ready');
    assert.equal(bad.status, 503, '/ready phải 503 khi DB lỗi');
    assert.deepEqual(bad.body, { status: 'db_unavailable' }, 'DB lỗi → { status: "db_unavailable" }');
  });

  test('registerHealthRoutes: /ready trả 503 đúng hạn khi DB treo (readyTimeoutMs)', async (t) => {
    const db = fakeDb(() => new Promise(() => {})); // không bao giờ xong
    const h = await startHealth(t, { db, isShuttingDown: () => false, readyTimeoutMs: 200 });
    const t0 = performance.now();
    const r = await h.get('/ready');
    const ms = performance.now() - t0;
    assert.equal(r.status, 503, '/ready phải 503 khi DB không trả lời kịp');
    assert.deepEqual(r.body, { status: 'db_unavailable' }, 'DB treo → { status: "db_unavailable" }');
    assert.ok(ms >= 150 && ms < 1000, `phải trả lời ngay khi hết readyTimeoutMs=200 (đo được ${Math.round(ms)} ms)`);
  });

  test('registerHealthRoutes: đang tắt → /ready 503 shutting_down, /health vẫn 200', async (t) => {
    let stopping = false;
    const db = fakeDb(() => Promise.resolve({ rows: [] }));
    const h = await startHealth(t, { db, isShuttingDown: () => stopping });
    assert.equal((await h.get('/ready')).status, 200, 'chưa tắt: /ready 200');
    stopping = true;
    const before = db.calls.length;
    const r = await h.get('/ready');
    assert.equal(r.status, 503, 'đang tắt: /ready phải 503');
    assert.deepEqual(r.body, { status: 'shutting_down' }, 'đang tắt → { status: "shutting_down" }');
    assert.equal(db.calls.length, before, 'đang tắt thì không cần hỏi DB');
    assert.equal((await h.get('/health')).status, 200, 'đang tắt: /health vẫn 200 (tiến trình còn sống)');
  });
});
