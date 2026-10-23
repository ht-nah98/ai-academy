// Test tự chấm cho bài N16 — createShutdown (shutdown.ts) và server.ts thật (TeamPulse N14 + N16) nhận SIGTERM.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const { createShutdown } = await import(pathToFileURL(join(process.cwd(), 'shutdown.ts')).href);

/** Server tí hon: /slow trả lời sau 300 ms, /hang không bao giờ trả lời, /ws là WebSocket. */
async function startServer(t) {
  const server = http.createServer((req, res) => {
    if (req.url === '/slow') setTimeout(() => res.end('xong'), 300);
    else if (req.url !== '/hang') res.end('ok');
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    for (const ws of wss.clients) ws.terminate();
  });
  const port = server.address().port;
  return { server, wss, port };
}

/** GET không dùng keep-alive (mỗi lần một kết nối mới): resolve { status, body } hoặc reject. */
function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, agent: false }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function openWs(t, port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => ws.terminate());
  ws.on('error', () => {});
  await once(ws, 'open');
  return ws;
}

function deps(s, extra = {}) {
  const events = [];
  return {
    events,
    d: {
      server: s.server, wss: s.wss, timeoutMs: 2000,
      closeDb: async () => { events.push('closeDb'); },
      onStart: () => { events.push('onStart'); },
      log: () => {},
      ...extra,
    },
  };
}

describe('createShutdown', () => {
  test('createShutdown: client WebSocket nhận mã đóng 1001, onStart gọi trước', { timeout: 5000 }, async (t) => {
    const s = await startServer(t);
    const a = await openWs(t, s.port);
    const b = await openWs(t, s.port);
    const { d, events } = deps(s);
    const closes = Promise.all([once(a, 'close'), once(b, 'close')]);
    const done = createShutdown(d)('SIGTERM');
    assert.equal(events[0], 'onStart', 'onStart phải được gọi ngay đầu shutdown');
    const [[codeA], [codeB]] = await closes;
    assert.equal(codeA, 1001, 'client WS phải nhận close code 1001');
    assert.equal(codeB, 1001, 'mọi client WS đều nhận 1001');
    await done;
    assert.deepEqual(events, ['onStart', 'closeDb'], 'thứ tự: onStart → ... → closeDb');
  });

  test('createShutdown: request đang dở được trả lời xong, kết nối mới bị từ chối, closeDb sau cùng', { timeout: 5000 }, async (t) => {
    const s = await startServer(t);
    const { d, events } = deps(s);
    const arrived = once(s.server, 'request');
    const slow = get(s.port, '/slow');
    const [, res] = await arrived;
    res.on('finish', () => events.push('slow-done')); // server đã gửi xong câu trả lời
    const done = createShutdown(d)('SIGTERM');
    await assert.rejects(get(s.port, '/fast'), 'sau khi bắt đầu tắt, kết nối mới phải bị từ chối (server.close)');
    const r = await slow;
    assert.equal(r.body, 'xong', 'request /slow đang chạy phải được trả lời xong, không bị cắt');
    await done;
    assert.deepEqual(events, ['onStart', 'slow-done', 'closeDb'], 'closeDb phải chạy SAU khi request đang dở xong');
  });

  test('createShutdown: gọi hai lần trả cùng một Promise, closeDb đúng một lần', { timeout: 5000 }, async (t) => {
    const s = await startServer(t);
    const { d, events } = deps(s);
    const shutdown = createShutdown(d);
    const p1 = shutdown('SIGTERM');
    const p2 = shutdown('SIGINT');
    assert.equal(p1, p2, 'lần gọi thứ hai phải trả lại CÙNG Promise của lần đầu');
    await p1;
    await shutdown('SIGTERM');
    assert.equal(events.filter((e) => e === 'closeDb').length, 1, 'closeDb chỉ được gọi một lần');
    assert.equal(events.filter((e) => e === 'onStart').length, 1, 'onStart chỉ được gọi một lần');
  });

  test('createShutdown: quá timeoutMs thì cắt kết nối còn treo và vẫn đóng DB', { timeout: 5000 }, async (t) => {
    const s = await startServer(t);
    const { d, events } = deps(s, { timeoutMs: 300 });
    const arrived = once(s.server, 'request');
    const hanging = get(s.port, '/hang').then(() => 'trả lời', () => 'bị cắt');
    await arrived;
    const t0 = performance.now();
    await createShutdown(d)('SIGTERM');
    const ms = performance.now() - t0;
    assert.ok(ms >= 250 && ms < 1500, `phải chờ khoảng timeoutMs=300 rồi đi tiếp (đo được ${Math.round(ms)} ms)`);
    assert.equal(await hanging, 'bị cắt', 'request treo phải bị cắt (closeAllConnections) khi hết giờ');
    assert.ok(events.includes('closeDb'), 'hết giờ vẫn phải closeDb');
  });

  test('createShutdown: server.ts thật nhận SIGTERM → /ready 200, WS đăng nhập nhận 1001, thoát mã 0', { timeout: 20000, skip: process.platform === 'win32' ? 'SIGTERM thật chỉ kiểm trên Linux/macOS' : false }, async (t) => {
    // Chạy ở thư mục tạm: không có DATABASE_URL → PGlite ./.pgdata nằm trong thư mục tạm, xoá sau test.
    const dir = mkdtempSync(join(tmpdir(), 'tp-n16-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const child = spawn(process.execPath, [join(process.cwd(), 'server.ts')], {
      cwd: dir,
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', SHUTDOWN_TIMEOUT_MS: '3000', DATABASE_URL: '', ALLOWED_ORIGINS: '' },
      detached: true,
    });
    t.after(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* đã thoát */ } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const exited = once(child, 'exit');
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server.ts không in "nghe ở http://...:<cổng>" sau 15 giây. Output:\n${out}`)), 15000);
      const check = () => {
        const m = out.match(/nghe ở http:\/\/127\.0\.0\.1:(\d+)/);
        if (m) { clearTimeout(timer); child.stdout.off('data', check); resolve(Number(m[1])); }
      };
      child.stdout.on('data', check);
      child.on('exit', () => { clearTimeout(timer); reject(new Error(`server.ts thoát sớm. Output:\n${out}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const ready = await fetch(`${base}/ready`);
    assert.equal(ready.status, 200, 'server.ts chạy: /ready phải 200 KHÔNG cần đăng nhập (registerHealthRoutes gắn trước lớp kiểm phiên)');
    const body = JSON.stringify({ username: 'cham_bai', password: 'mat-khau-cham-bai' });
    const headers = { 'content-type': 'application/json' };
    await fetch(`${base}/api/register`, { method: 'POST', headers, body });
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers, body });
    assert.equal(login.status, 200, 'đăng nhập qua /api/login (N14) phải 200');
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie } });
    ws.on('error', () => {});
    await once(ws, 'open');
    const synced = new Promise((resolve) => ws.on('message', (d) => { if (String(d).includes('"synced"')) resolve(); }));
    ws.send(JSON.stringify({ type: 'hello', channelId: 1, lastSeenId: 0 }));
    await synced;
    const closed = once(ws, 'close');
    child.kill('SIGTERM');
    const [code] = await closed;
    assert.equal(code, 1001, 'SIGTERM: client WS phải nhận close code 1001');
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ } }, 8000);
    const [exitCode] = await exited;
    clearTimeout(timer);
    assert.equal(exitCode, 0, `server.ts phải tự thoát mã 0 sau khi tắt êm. Output:\n${out}`);
  });
});
