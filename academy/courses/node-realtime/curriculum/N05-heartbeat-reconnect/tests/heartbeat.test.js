// Test tự chấm cho bài N05. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Server listen cổng 0 trên 127.0.0.1; mọi kết nối, server và timer được dọn trong after().
import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const mod = await import(pathToFileURL(join(process.cwd(), 'heartbeat.js')).href);
const { startHeartbeat, backoffDelay, createReconnectingClient, OPEN } = mod;

const cleanups = [];
after(() => {
  for (const fn of cleanups.reverse()) {
    try { fn(); } catch { /* dọn tiếp */ }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chờ tới khi cond() đúng, tối đa ms mili giây. */
async function until(cond, ms, message) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(message);
    await sleep(5);
  }
}

/** Server ws thật ở cổng ngẫu nhiên. `refuse` = số lần đầu từ chối nâng cấp (đóng socket). */
async function startServer({ refuse = 0 } = {}) {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const state = { upgrades: 0, received: [], wss, server };
  server.on('upgrade', (req, socket, head) => {
    state.upgrades += 1;
    if (state.upgrades <= refuse) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws) => {
    ws.on('message', (d) => state.received.push(String(d)));
    ws.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.closeAllConnections?.();
    server.close();
  });
  state.url = `ws://127.0.0.1:${server.address().port}`;
  return state;
}

function track(client) {
  cleanups.push(() => client.close());
  return client;
}

// ---------- startHeartbeat (wss giả, đồng hồ giả) ----------

function fakeWss() {
  const wss = new EventEmitter();
  wss.clients = new Set();
  wss.connect = () => {
    const ws = new EventEmitter();
    ws.pings = 0;
    ws.terminated = false;
    ws.ping = () => { ws.pings += 1; };
    ws.terminate = () => { ws.terminated = true; wss.clients.delete(ws); };
    wss.clients.add(ws);
    wss.emit('connection', ws);
    return ws;
  };
  return wss;
}

test('startHeartbeat: sweep ping kết nối sống, terminate kết nối không trả pong', () => {
  const wss = fakeWss();
  const dead = [];
  const hb = startHeartbeat(wss, { intervalMs: 60_000, onDead: (ws) => dead.push(ws) });
  cleanups.push(() => hb.stop());
  const good = wss.connect();
  const bad = wss.connect();
  assert.equal(good.isAlive, true, 'Kết nối mới phải có ws.isAlive = true');
  assert.equal(hb.sweep(), 0, 'Lượt đầu: chưa ai bị coi là chết → trả 0');
  assert.equal(good.pings, 1, 'Lượt đầu phải gọi ws.ping() cho mỗi kết nối');
  assert.equal(good.isAlive, false, 'Sau khi ping, isAlive phải đặt về false (chờ pong)');
  good.emit('pong');
  assert.equal(good.isAlive, true, "Nhận 'pong' → isAlive = true");
  assert.equal(hb.sweep(), 1, 'Lượt 2: kết nối không trả pong bị terminate → trả 1');
  assert.equal(bad.terminated, true, 'Kết nối không trả pong phải bị ws.terminate()');
  assert.equal(good.terminated, false, 'Kết nối có pong không được terminate');
  assert.deepEqual(dead, [bad], 'onDead(ws) được gọi đúng một lần cho kết nối chết');
  assert.equal(good.pings, 2, 'Kết nối sống được ping tiếp ở lượt 2');
});

test('startHeartbeat: setInterval gọi sweep định kỳ, stop() dừng hẳn', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const wss = fakeWss();
    const hb = startHeartbeat(wss, { intervalMs: 1000 });
    const ws = wss.connect();
    mock.timers.tick(999);
    assert.equal(ws.pings, 0, 'Chưa tới intervalMs thì chưa ping');
    mock.timers.tick(1);
    assert.equal(ws.pings, 1, 'Sau intervalMs phải ping một lần (setInterval(sweep, intervalMs))');
    mock.timers.tick(1000);
    assert.equal(ws.terminated, true, 'Không có pong sau 2 × intervalMs → terminate');
    hb.stop();
    const later = wss.connect();
    assert.equal(later.isAlive, undefined, "Sau stop() không còn gắn listener 'connection'");
    mock.timers.tick(5000);
    assert.equal(later.pings, 0, 'Sau stop() interval không còn chạy');
  } finally {
    mock.timers.reset();
  }
});

test('startHeartbeat: với ws thật, client treo bị phát hiện trong 2 × intervalMs', async () => {
  const srv = await startServer();
  const hb = startHeartbeat(srv.wss, { intervalMs: 50 });
  cleanups.push(() => hb.stop());
  const { WebSocket } = await import('ws');
  const healthy = new WebSocket(srv.url);
  const frozen = new WebSocket(srv.url);
  cleanups.push(() => { healthy.terminate(); frozen.terminate(); });
  healthy.on('error', () => {});
  frozen.on('error', () => {});
  await Promise.all([healthy, frozen].map((w) => new Promise((r) => w.once('open', r))));
  await until(() => srv.wss.clients.size === 2, 1000, 'Server phải thấy 2 kết nối');
  const t0 = Date.now();
  frozen._socket.pause(); // client vẫn "còn" nhưng không đọc gì → không trả pong (như mạng treo)
  await until(() => srv.wss.clients.size === 1, 1000, 'Client treo phải bị terminate trong vòng 1 giây (interval 50 ms)');
  const detect = Date.now() - t0;
  assert.ok(detect <= 400, `Phát hiện sau ${detect} ms — phải ≤ khoảng 2 × intervalMs`);
  await sleep(200);
  assert.equal(healthy.readyState, OPEN, 'Client khoẻ (tự trả pong) phải còn mở sau nhiều lượt heartbeat');
});

// ---------- backoffDelay ----------

test('backoffDelay: tăng gấp đôi, có trần, jitter trong [cap/2, cap]', () => {
  assert.equal(backoffDelay(0, { random: () => 0 }), 250, 'attempt 0, base 500, random 0 → 250');
  assert.equal(backoffDelay(0, { random: () => 1 }), 500, 'attempt 0, random 1 → 500');
  assert.equal(backoffDelay(3, { random: () => 1 }), 4000, 'attempt 3 → cap = 500 × 2^3 = 4000');
  assert.equal(backoffDelay(3, { random: () => 0.5 }), 3000, 'attempt 3, random 0.5 → 2000 + 1000');
  assert.equal(backoffDelay(20, { random: () => 1 }), 30000, 'Không vượt maxMs mặc định 30000');
  assert.equal(backoffDelay(2, { baseMs: 100, maxMs: 300, random: () => 1 }), 300, 'cap = min(300, 400) = 300');
  for (let a = 0; a < 12; a += 1) {
    const d = backoffDelay(a);
    const cap = Math.min(30000, 500 * 2 ** a);
    assert.ok(Number.isInteger(d) && d >= cap / 2 && d <= cap, `attempt ${a}: ${d} phải là số nguyên trong [${cap / 2}, ${cap}]`);
  }
});

// ---------- createReconnectingClient ----------

test('createReconnectingClient: tin gửi trước khi mở được xếp hàng rồi gửi bù đúng thứ tự', async () => {
  const srv = await startServer();
  let opened = 0;
  const c = track(createReconnectingClient(srv.url, { onOpen: () => { opened += 1; } }));
  assert.equal(c.send({ n: 1 }), 'queued', 'Chưa OPEN → send trả "queued"');
  assert.equal(c.send({ n: 2 }), 'queued', 'Chưa OPEN → send trả "queued"');
  assert.equal(c.queued, 2, 'queued = số tin trong hàng đợi');
  await until(() => opened === 1, 2000, 'onOpen() phải được gọi khi kết nối mở');
  assert.equal(c.readyState, OPEN, 'readyState = OPEN sau khi kết nối');
  assert.equal(c.send({ n: 3 }), 'sent', 'Đang OPEN → send trả "sent"');
  await until(() => srv.received.length === 3, 2000, 'Server phải nhận đủ 3 tin');
  assert.deepEqual(srv.received, ['{"n":1}', '{"n":2}', '{"n":3}'], 'Tin xếp hàng được gửi trước, đúng thứ tự, dạng JSON');
  assert.equal(c.queued, 0, 'Gửi bù xong thì hàng đợi rỗng');
});

test('createReconnectingClient: mất kết nối → onRetry, kết nối lại, gửi bù tin lúc offline', async () => {
  const srv = await startServer();
  const retries = [];
  const texts = [];
  let opened = 0;
  const c = track(createReconnectingClient(srv.url, {
    baseMs: 20, random: () => 1,
    onOpen: () => { opened += 1; },
    onRetry: (info) => retries.push(info),
    onMessage: (t) => texts.push(t),
  }));
  await until(() => opened === 1, 2000, 'Lần kết nối đầu phải mở');
  for (const ws of srv.wss.clients) ws.send('xin chào');
  await until(() => texts.length === 1, 2000, 'onMessage(text) phải nhận tin server gửi');
  assert.equal(texts[0], 'xin chào', 'onMessage nhận String(data)');
  for (const ws of srv.wss.clients) ws.terminate(); // server cắt đột ngột
  await until(() => retries.length === 1, 2000, 'Mất kết nối phải gọi onRetry({attempt, delay})');
  assert.deepEqual(retries[0], { attempt: 0, delay: 20 }, 'Lần thử đầu: attempt 0, delay = backoffDelay(0, {baseMs: 20, random: () => 1}) = 20');
  assert.equal(c.send({ offline: true }), 'queued', 'Trong lúc mất kết nối, send phải xếp hàng');
  await until(() => opened === 2, 2000, 'Phải tự kết nối lại sau delay');
  await until(() => srv.received.includes('{"offline":true}'), 2000, 'Tin gửi lúc offline phải tới server sau khi kết nối lại');
  for (const ws of srv.wss.clients) ws.terminate();
  await until(() => retries.length === 2, 2000, 'Mất kết nối lần 2 phải gọi onRetry');
  assert.equal(retries[1].attempt, 0, 'Kết nối thành công phải đặt lại attempt về 0');
});

test('createReconnectingClient: server từ chối → thử lại với delay tăng dần', async () => {
  const srv = await startServer({ refuse: 3 });
  const retries = [];
  let opened = 0;
  track(createReconnectingClient(srv.url, {
    baseMs: 10, random: () => 1,
    onOpen: () => { opened += 1; },
    onRetry: (info) => retries.push(info),
  }));
  await until(() => opened === 1, 3000, 'Sau 3 lần bị từ chối, lần thứ 4 phải kết nối được');
  assert.deepEqual(retries.map((r) => r.attempt), [0, 1, 2], 'attempt tăng 0, 1, 2 qua các lần thất bại liên tiếp');
  assert.deepEqual(retries.map((r) => r.delay), [10, 20, 40], 'delay tăng gấp đôi: 10, 20, 40');
  assert.equal(srv.upgrades, 4, 'Tổng cộng 4 lần thử nâng cấp');
});

test('createReconnectingClient: close() dừng hẳn, không kết nối lại', async () => {
  const srv = await startServer();
  let opened = 0;
  const retries = [];
  const c = track(createReconnectingClient(srv.url, {
    baseMs: 10, onOpen: () => { opened += 1; }, onRetry: (i) => retries.push(i),
  }));
  await until(() => opened === 1, 2000, 'Kết nối đầu phải mở');
  c.close();
  await until(() => srv.wss.clients.size === 0, 2000, 'close() phải đóng kết nối hiện tại');
  await sleep(150);
  assert.equal(srv.upgrades, 1, 'Sau close() không được kết nối lại');
  assert.deepEqual(retries, [], 'Đóng chủ động không gọi onRetry');
});

test('createReconnectingClient: hàng đợi đầy thì bỏ tin cũ nhất', async () => {
  const srv = await startServer({ refuse: 1 });
  let opened = 0;
  const c = track(createReconnectingClient(srv.url, { baseMs: 40, random: () => 1, maxQueue: 3, onOpen: () => { opened += 1; } }));
  for (let n = 1; n <= 5; n += 1) c.send({ n });
  assert.equal(c.queued, 3, 'maxQueue = 3 → hàng đợi giữ tối đa 3 tin');
  await until(() => opened === 1, 2000, 'Phải kết nối được ở lần thử thứ 2');
  await until(() => srv.received.length === 3, 2000, 'Server phải nhận 3 tin còn trong hàng đợi');
  assert.deepEqual(srv.received, ['{"n":3}', '{"n":4}', '{"n":5}'], 'Tin cũ nhất (1, 2) bị bỏ, giữ 3 tin mới nhất');
});
