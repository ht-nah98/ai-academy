// Test tự chấm cho bài N03. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Mọi server listen cổng 0 trên 127.0.0.1; mọi kết nối và server được đóng trong after().
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

const mod = await import(pathToFileURL(join(process.cwd(), 'echo.js')).href);
const { startPolling, computeAccept, handshakeResponse, readyStateName, createEchoServer } = mod;

const servers = [];
const clients = [];
const pollers = [];
after(() => {
  for (const p of pollers) p.stop?.();
  for (const c of clients) c.terminate();
  for (const s of servers) {
    s.closeAllConnections?.();
    s.close();
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listen(server) {
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

/** Mở client WebSocket và bắt đầu gom tin ngay (để không lỡ tin "welcome"). */
function connect(url) {
  const ws = new WebSocket(url);
  clients.push(ws);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data, isBinary) => {
    const item = { data, isBinary };
    const w = waiters.shift();
    if (w) w(item);
    else inbox.push(item);
  });
  ws.on('error', () => {});
  const opened = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Hết 2 giây mà chưa kết nối được WebSocket')), 2000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
  function next(ms = 2000) {
    if (inbox.length) return Promise.resolve(inbox.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Hết ${ms} ms mà server không gửi tin nào`)), ms);
      waiters.push((item) => { clearTimeout(t); resolve(item); });
    });
  }
  return { ws, opened, next };
}

async function startEcho() {
  const server = createEchoServer();
  assert.ok(server instanceof http.Server, 'createEchoServer phải trả về http.Server');
  assert.equal(server.listening, false, 'createEchoServer chỉ tạo server, KHÔNG tự listen()');
  const port = await listen(server);
  return { port, base: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws` };
}

// ---------- startPolling ----------

/** Server tin nhắn giả: ghi lại mọi `since` nhận được. */
async function fakeMessageServer(messages) {
  const sinces = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const since = Number(u.searchParams.get('since')) || 0;
    sinces.push(u.searchParams.get('since'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: messages.filter((m) => m.id > since) }));
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}/messages`, sinces };
}

test('startPolling: trả về ngay {stop, stats}, lượt đầu since=0', async () => {
  const srv = await fakeMessageServer([]);
  const p = startPolling({ url: srv.url, intervalMs: 1000, onMessage: () => {} });
  pollers.push(p);
  assert.ok(!(p instanceof Promise), 'startPolling trả object ngay, không phải Promise (đừng khai báo async)');
  assert.equal(typeof p.stop, 'function', 'Kết quả phải có hàm stop()');
  assert.deepEqual(Object.keys(p.stats).sort(), ['empty', 'errors', 'received', 'requests'],
    'stats phải có đúng 4 khóa requests, empty, received, errors');
  await sleep(150);
  assert.equal(srv.sinces[0], '0', 'Lượt đầu phải gọi url?since=0 ngay, không chờ intervalMs');
  assert.equal(p.stats.requests, 1, 'Sau 150 ms với intervalMs 1000 chỉ có 1 request');
  assert.equal(p.stats.empty, 1, 'Response không có tin → tăng stats.empty');
  p.stop();
});

test('startPolling: nhận tin theo thứ tự, since tăng theo id cuối', async () => {
  const messages = [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
  const srv = await fakeMessageServer(messages);
  const got = [];
  const p = startPolling({ url: srv.url, intervalMs: 40, onMessage: (m) => got.push(m.text) });
  pollers.push(p);
  await sleep(120);
  messages.push({ id: 3, text: 'c' });
  await sleep(200);
  p.stop();
  assert.deepEqual(got, ['a', 'b', 'c'], 'onMessage phải được gọi cho từng tin đúng thứ tự, mỗi tin đúng một lần');
  assert.equal(p.stats.received, 3, 'stats.received = tổng số tin đã nhận');
  assert.ok(srv.sinces.includes('2') && srv.sinces.at(-1) === '3', 'since phải là id của tin cuối cùng đã nhận (2, rồi 3)');
  assert.ok(p.stats.requests >= 4, `intervalMs 40 trong ~320 ms phải có nhiều request, đo được ${p.stats.requests}`);
  assert.equal(p.stats.empty, p.stats.requests - 2, 'Chỉ 2 response có tin, còn lại là response rỗng');
});

test('startPolling: stop() dừng hẳn, không gửi thêm request', async () => {
  const srv = await fakeMessageServer([]);
  const p = startPolling({ url: srv.url, intervalMs: 30, onMessage: () => {} });
  pollers.push(p);
  await sleep(100);
  p.stop();
  await sleep(30);
  const count = srv.sinces.length;
  await sleep(150);
  assert.equal(srv.sinces.length, count, 'Sau stop() không được gửi thêm request nào (nhớ clearTimeout)');
});

test('startPolling: lỗi mạng không làm dừng polling', async () => {
  const dead = http.createServer();
  const port = await listen(dead);
  await new Promise((r) => dead.close(r));      // cổng giờ không còn ai nghe → fetch lỗi
  const p = startPolling({ url: `http://127.0.0.1:${port}/messages`, intervalMs: 20, onMessage: () => {} });
  pollers.push(p);
  await sleep(250);
  p.stop();
  assert.ok(p.stats.errors >= 2, `fetch lỗi phải tăng stats.errors và vẫn thử lại; đo được errors=${p.stats.errors}`);
  assert.equal(p.stats.requests, p.stats.errors, 'Lượt lỗi vẫn tính là một request đã xong');
});

// ---------- computeAccept & handshakeResponse ----------

test('computeAccept: đúng ví dụ trong RFC 6455', () => {
  assert.equal(computeAccept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
    'base64(SHA-1(key + WS_GUID)) với key mẫu của RFC phải ra s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('computeAccept: đúng với key ngẫu nhiên', () => {
  const key = randomBytes(16).toString('base64');
  const expected = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  assert.equal(computeAccept(key), expected, 'Phải nối key với WS_GUID (không có khoảng trắng), SHA-1, rồi base64');
});

const goodHeaders = () => ({
  upgrade: 'websocket', connection: 'Upgrade',
  'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
});

test('handshakeResponse: request hợp lệ → 101 kèm Accept', () => {
  assert.deepEqual(handshakeResponse(goodHeaders()), {
    status: 101,
    headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Accept': 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=' },
  }, 'Request hợp lệ → {status: 101, headers: {Upgrade, Connection, Sec-WebSocket-Accept}}');
  const mixed = { ...goodHeaders(), upgrade: 'WebSocket', connection: 'keep-alive, Upgrade' };
  assert.equal(handshakeResponse(mixed).status, 101,
    'upgrade không phân biệt hoa thường; connection có thể là danh sách "keep-alive, Upgrade"');
});

test('handshakeResponse: thiếu/sai header → 400', () => {
  const cases = [
    ['thiếu upgrade', { upgrade: undefined }],
    ['upgrade sai', { upgrade: 'h2c' }],
    ['connection không có upgrade', { connection: 'keep-alive' }],
    ['thiếu key', { 'sec-websocket-key': undefined }],
    ['key không phải 16 byte', { 'sec-websocket-key': Buffer.from('ngan').toString('base64') }],
  ];
  for (const [name, patch] of cases) {
    assert.deepEqual(handshakeResponse({ ...goodHeaders(), ...patch }), { status: 400, headers: {} },
      `${name} → {status: 400, headers: {}}`);
  }
});

test('handshakeResponse: sai version → 426 báo bản 13', () => {
  assert.deepEqual(handshakeResponse({ ...goodHeaders(), 'sec-websocket-version': '8' }),
    { status: 426, headers: { 'Sec-WebSocket-Version': '13' } },
    'Version khác 13 → {status: 426, headers: {"Sec-WebSocket-Version": "13"}}');
});

// ---------- readyStateName ----------

test('readyStateName: 0–3 và giá trị lạ', () => {
  const names = [0, 1, 2, 3, 7].map((n) => readyStateName({ readyState: n }));
  assert.deepEqual(names, ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED', 'UNKNOWN'],
    '0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED, số khác UNKNOWN');
});

// ---------- createEchoServer ----------

test('createEchoServer: GET / trả trang HTML, đường dẫn khác 404', async () => {
  const { base } = await startEcho();
  const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
  assert.equal(r.status, 200, 'GET / phải trả 200');
  assert.match(r.headers.get('content-type') ?? '', /^text\/html; charset=utf-8/i, 'Content-Type phải là text/html; charset=utf-8');
  assert.match(await r.text(), /new WebSocket\(/, 'Body phải là nội dung public/index.html');
  const nf = await fetch(base + '/khong-co', { signal: AbortSignal.timeout(2000) });
  assert.equal(nf.status, 404, 'Đường dẫn khác phải trả 404');
});

test('createEchoServer: kết nối /ws nhận welcome, readyState OPEN', async () => {
  const { wsUrl } = await startEcho();
  const c = connect(wsUrl);
  await c.opened;
  assert.equal(readyStateName(c.ws), 'OPEN', 'Sau sự kiện open, readyState phải là OPEN (1)');
  const first = await c.next();
  assert.equal(first.isBinary, false, 'Tin welcome phải là text');
  assert.equal(first.data.toString(), 'welcome', 'Ngay khi kết nối, server phải gửi "welcome"');
});

test('createEchoServer: text → "echo: <text>", giữ tiếng Việt', async () => {
  const { wsUrl } = await startEcho();
  const c = connect(wsUrl);
  await c.opened;
  await c.next();
  c.ws.send('xin chào');
  const reply = await c.next();
  assert.equal(reply.isBinary, false, 'Trả lời tin text phải là text (đừng gửi Buffer thẳng)');
  assert.equal(reply.data.toString(), 'echo: xin chào', 'Tin text "xin chào" → "echo: xin chào"');
});

test('createEchoServer: binary → trả đúng các byte, dạng binary', async () => {
  const { wsUrl } = await startEcho();
  const c = connect(wsUrl);
  await c.opened;
  await c.next();
  c.ws.send(Buffer.from([1, 2, 3, 255]));
  const reply = await c.next();
  assert.equal(reply.isBinary, true, 'Tin binary phải được trả lại dạng binary ({ binary: true })');
  assert.deepEqual([...reply.data], [1, 2, 3, 255], 'Phải trả lại đúng các byte đã nhận');
});

test('createEchoServer: mỗi client có kênh riêng; đóng kết nối → CLOSED', async () => {
  const { wsUrl } = await startEcho();
  const a = connect(wsUrl);
  const b = connect(wsUrl);
  await Promise.all([a.opened, b.opened]);
  await a.next();
  await b.next();
  a.ws.send('từ A');
  assert.equal((await a.next()).data.toString(), 'echo: từ A', 'A nhận echo của chính A');
  await assert.rejects(b.next(300), 'Echo chỉ gửi lại cho người gửi, B không được nhận tin của A');
  const closed = new Promise((r) => a.ws.once('close', r));
  a.ws.close(1000, 'bye');
  assert.equal(readyStateName(a.ws), 'CLOSING', 'Ngay sau close(), readyState là CLOSING (2)');
  await closed;
  assert.equal(readyStateName(a.ws), 'CLOSED', 'Sau sự kiện close, readyState là CLOSED (3)');
});

test('createEchoServer: đường dẫn khác /ws bị từ chối', async () => {
  const { port } = await startEcho();
  const c = connect(`ws://127.0.0.1:${port}/khac`);
  await assert.rejects(c.opened, 'Kết nối WebSocket tới đường dẫn khác /ws phải bị từ chối (WebSocketServer({ path: "/ws" }))');
});
