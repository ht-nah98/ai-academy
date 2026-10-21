// Test tự chấm cho bài N07. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Đồng hồ giả (now) thay cho Date.now; server listen cổng 0 trên 127.0.0.1, đóng trong after().
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

const mod = await import(pathToFileURL(join(process.cwd(), 'auth.js')).href);
const { signToken, verifyToken, authenticateUpgrade, createAuthServer, OPEN } = mod;

const SECRET = 'test-secret';
const T0 = Date.UTC(2026, 9, 20, 8, 0, 0); // 2026-10-20 08:00:00 UTC
const ORIGIN = 'http://127.0.0.1:3007';

const cleanups = [];
after(() => {
  for (const fn of cleanups.reverse()) {
    try { fn(); } catch { /* dọn tiếp */ }
  }
});

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (body, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64url');

// ---------- signToken ----------

test('signToken: body.sig, body là JSON base64url có exp, sig là HMAC-SHA256', () => {
  const t = signToken({ sub: 'an', rooms: ['dev'] }, SECRET, { ttlSec: 60, now: () => T0 });
  assert.equal(typeof t, 'string', 'signToken phải trả chuỗi');
  const parts = t.split('.');
  assert.equal(parts.length, 2, 'Token có đúng 2 phần ngăn bởi dấu chấm');
  const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  assert.deepEqual(payload, { sub: 'an', rooms: ['dev'], exp: T0 / 1000 + 60 }, 'Payload giữ nguyên trường và thêm exp = giây hiện tại + ttlSec');
  assert.equal(parts[1], sign(parts[0]), 'Phần 2 = createHmac("sha256", secret).update(body).digest("base64url")');
  const original = { sub: 'binh', rooms: [] };
  signToken(original, SECRET, { now: () => T0 });
  assert.deepEqual(original, { sub: 'binh', rooms: [] }, 'Không được sửa object payload truyền vào');
  const def = JSON.parse(Buffer.from(signToken({ sub: 'c' }, SECRET, { now: () => T0 + 999 }).split('.')[0], 'base64url'));
  assert.equal(def.exp, T0 / 1000 + 3600, 'ttlSec mặc định 3600; exp làm tròn xuống giây (Math.floor)');
});

// ---------- verifyToken ----------

test('verifyToken: token đúng → ok, user có sub/rooms/exp', () => {
  const t = signToken({ sub: 'an', rooms: ['general', 'dev'] }, SECRET, { ttlSec: 60, now: () => T0 });
  assert.deepEqual(verifyToken(t, SECRET, { now: () => T0 + 59_000 }),
    { ok: true, user: { sub: 'an', rooms: ['general', 'dev'], exp: T0 / 1000 + 60 } }, 'Còn hạn → { ok: true, user }');
});

test('verifyToken: sai định dạng, sai chữ ký, hết hạn — không ném lỗi', () => {
  const now = () => T0;
  const good = signToken({ sub: 'an', rooms: ['dev'] }, SECRET, { ttlSec: 60, now });
  const tampered = b64({ sub: 'an', rooms: ['dev', 'admin'], exp: T0 / 1000 + 60 }) + '.' + good.split('.')[1];
  const cases = [
    [undefined, 'malformed'], [42, 'malformed'], ['', 'malformed'], ['abc', 'malformed'], ['a.b.c', 'malformed'],
    [good.split('.')[0] + '.', 'malformed'],
    [tampered, 'bad_signature'],
    [good.split('.')[0] + '.' + sign(good.split('.')[0], 'secret-khac'), 'bad_signature'],
    [good.slice(0, -2), 'bad_signature'],
    ['!!!.' + sign('!!!'), 'malformed'],
    [b64([1, 2]) + '.' + sign(b64([1, 2])), 'malformed'],
    [b64({ sub: 'an' }) + '.' + sign(b64({ sub: 'an' })), 'expired'],
  ];
  for (const [token, error] of cases) {
    let r;
    assert.doesNotThrow(() => { r = verifyToken(token, SECRET, { now }); }, `verifyToken(${JSON.stringify(token)}) không được ném lỗi`);
    assert.deepEqual(r, { ok: false, error }, `${JSON.stringify(token)?.slice(0, 30)} → ${error}`);
  }
  assert.deepEqual(verifyToken(good, SECRET, { now: () => T0 + 60_000 }), { ok: false, error: 'expired' }, 'now() đúng bằng exp × 1000 → expired');
});

// ---------- authenticateUpgrade ----------

test('authenticateUpgrade: Origin lạ → 403, thiếu token → 401', () => {
  const opts = { secret: SECRET, allowedOrigins: [ORIGIN], now: () => T0 };
  const t = signToken({ sub: 'an', rooms: ['dev'] }, SECRET, { now: () => T0 });
  assert.deepEqual(authenticateUpgrade({ headers: { origin: 'https://evil.example', authorization: `Bearer ${t}` } }, opts),
    { ok: false, status: 403, error: 'bad_origin' }, 'Origin không trong allowedOrigins → 403 bad_origin (kể cả khi token đúng)');
  assert.deepEqual(authenticateUpgrade({ headers: { origin: ORIGIN } }, opts), { ok: false, status: 401, error: 'no_token' },
    'Không có token → 401 no_token');
  assert.deepEqual(authenticateUpgrade({ headers: {}, url: `/ws?token=${t}` }, opts), { ok: false, status: 401, error: 'no_token' },
    'Không đọc token từ query string');
  assert.deepEqual(authenticateUpgrade({ headers: { authorization: 'Bearer abc' } }, opts), { ok: false, status: 401, error: 'malformed' },
    'Token sai → 401 kèm mã lỗi của verifyToken');
});

test('authenticateUpgrade: token qua Authorization Bearer hoặc cookie tp_token', () => {
  const opts = { secret: SECRET, allowedOrigins: [ORIGIN], now: () => T0 };
  const t = signToken({ sub: 'an', rooms: ['dev'] }, SECRET, { now: () => T0 });
  const user = { sub: 'an', rooms: ['dev'], exp: T0 / 1000 + 3600 };
  assert.deepEqual(authenticateUpgrade({ headers: { authorization: `Bearer ${t}` } }, opts), { ok: true, user },
    'Không có Origin (client không phải trình duyệt) + Bearer đúng → ok');
  assert.deepEqual(authenticateUpgrade({ headers: { origin: ORIGIN, cookie: `theme=dark; tp_token=${t}; lang=vi` } }, opts), { ok: true, user },
    'Cookie "theme=dark; tp_token=...; lang=vi" → tìm đúng tp_token');
  const other = signToken({ sub: 'binh', rooms: [] }, SECRET, { now: () => T0 });
  assert.equal(authenticateUpgrade({ headers: { authorization: `Bearer ${t}`, cookie: `tp_token=${other}` } }, opts).user?.sub, 'an',
    'Có cả hai → ưu tiên Authorization');
});

// ---------- createAuthServer ----------

async function startAuth(clock) {
  const server = createAuthServer({ secret: SECRET, allowedOrigins: [ORIGIN], now: () => clock.t });
  assert.ok(server instanceof http.Server, 'createAuthServer phải trả về http.Server');
  assert.equal(server.listening, false, 'createAuthServer chỉ tạo server, KHÔNG tự listen()');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => { server.closeAllConnections?.(); server.close(); });
  return server.address().port;
}

/** Gửi request nâng cấp thô qua TCP, trả toàn bộ response (để thấy server từ chối TRƯỚC 101). */
function rawUpgrade(port, path, extraHeaders = '') {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    const t = setTimeout(() => { sock.destroy(); reject(new Error('Hết 2 giây mà server không trả lời request nâng cấp')); }, 2000);
    sock.on('data', (d) => { data += d; });
    sock.on('close', () => { clearTimeout(t); resolve(data); });
    sock.on('error', () => {});
    sock.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n`
      + `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${extraHeaders}\r\n`);
  });
}

function connect(port, headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
  cleanups.push(() => ws.terminate());
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    const w = waiters.shift();
    if (w) w(m); else inbox.push(m);
  });
  ws.on('error', () => {});
  return {
    ws,
    opened: () => new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('unexpected-response', (req, res) => reject(new Error(`Bị từ chối HTTP ${res.statusCode}`)));
    }),
    next(ms = 2000) {
      if (inbox.length) return Promise.resolve(inbox.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Hết ${ms} ms mà server không gửi tin nào`)), ms);
        waiters.push((m) => { clearTimeout(t); resolve(m); });
      });
    },
    async nothing(ms = 150) {
      await new Promise((r) => setTimeout(r, ms));
      return inbox.splice(0);
    },
  };
}

test('createAuthServer: từ chối 401/403/404 bằng HTTP, không trả 101', async () => {
  const clock = { t: T0 };
  const port = await startAuth(clock);
  const t = signToken({ sub: 'an', rooms: ['dev'] }, SECRET, { now: () => T0 });
  const noToken = await rawUpgrade(port, '/ws');
  assert.match(noToken, /^HTTP\/1\.1 401 /, `Không token → "HTTP/1.1 401 ...", nhận: ${noToken.slice(0, 40)}`);
  assert.match(noToken, /\{"error":"no_token"\}/, 'Body JSON {"error":"no_token"}');
  assert.doesNotMatch(noToken, /101 Switching/, 'Bị từ chối thì không được có 101');
  const evil = await rawUpgrade(port, '/ws', `Origin: https://evil.example\r\nAuthorization: Bearer ${t}\r\n`);
  assert.match(evil, /^HTTP\/1\.1 403 /, 'Origin lạ → 403');
  assert.match(evil, /bad_origin/, 'Body có bad_origin');
  assert.match(await rawUpgrade(port, '/khac', `Authorization: Bearer ${t}\r\n`), /^HTTP\/1\.1 404 /, 'Đường dẫn khác /ws → 404');
  assert.equal((await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })).status, 404, 'Request HTTP thường → 404');
});

test('createAuthServer: token đúng → kết nối, chat tới người có quyền ở room', async () => {
  const clock = { t: T0 };
  const port = await startAuth(clock);
  const an = connect(port, { authorization: `Bearer ${signToken({ sub: 'an', rooms: ['general', 'dev'] }, SECRET, { now: () => T0 })}`, origin: ORIGIN });
  const binh = connect(port, { cookie: `tp_token=${signToken({ sub: 'binh', rooms: ['general'] }, SECRET, { now: () => T0 })}` });
  await an.opened();
  await binh.opened();
  an.ws.send(JSON.stringify({ type: 'chat', room: 'general', text: 'Họp 3h' }));
  const expected = { type: 'chat', room: 'general', from: 'an', text: 'Họp 3h' };
  assert.deepEqual(await an.next(), expected, 'Người gửi cũng nhận tin của room; from = user.sub');
  assert.deepEqual(await binh.next(), expected, 'Binh có quyền general → nhận tin');
  an.ws.send(JSON.stringify({ type: 'chat', room: 'dev', text: 'Deploy' }));
  assert.equal((await an.next()).room, 'dev', 'An có quyền dev → nhận tin dev');
  assert.deepEqual(await binh.nothing(), [], 'Binh KHÔNG có quyền dev → không nhận tin dev');
});

test('createAuthServer: không có quyền ở room → forbidden; tin hỏng → bad_message', async () => {
  const clock = { t: T0 };
  const port = await startAuth(clock);
  const an = connect(port, { authorization: `Bearer ${signToken({ sub: 'an', rooms: ['general', 'dev'] }, SECRET, { now: () => T0 })}` });
  const binh = connect(port, { authorization: `Bearer ${signToken({ sub: 'binh', rooms: ['general'] }, SECRET, { now: () => T0 })}` });
  await an.opened();
  await binh.opened();
  binh.ws.send(JSON.stringify({ type: 'chat', room: 'dev', text: 'cho xem với' }));
  assert.deepEqual(await binh.next(), { type: 'error', error: 'forbidden' }, 'Binh gửi vào dev → {type: "error", error: "forbidden"}');
  assert.deepEqual(await an.nothing(), [], 'Tin bị cấm không được gửi cho ai');
  binh.ws.send('{hỏng');
  assert.deepEqual(await binh.next(), { type: 'error', error: 'bad_message' }, 'JSON hỏng → bad_message');
  assert.equal(binh.ws.readyState, OPEN, 'Tin sai không làm đóng kết nối');
});

test('createAuthServer: token hết hạn giữa chừng → token_expired, đóng code 4001', async () => {
  const clock = { t: T0 };
  const port = await startAuth(clock);
  const binh = connect(port, { authorization: `Bearer ${signToken({ sub: 'binh', rooms: ['general'] }, SECRET, { ttlSec: 60, now: () => T0 })}` });
  await binh.opened();
  binh.ws.send(JSON.stringify({ type: 'chat', room: 'general', text: 'còn hạn' }));
  assert.equal((await binh.next()).type, 'chat', 'Còn hạn → chat bình thường');
  clock.t = T0 + 61_000;
  const closed = new Promise((r) => binh.ws.once('close', (code) => r(code)));
  binh.ws.send(JSON.stringify({ type: 'chat', room: 'general', text: 'hết hạn rồi' }));
  assert.deepEqual(await binh.next(), { type: 'error', error: 'token_expired' }, 'Hết hạn → {type: "error", error: "token_expired"}');
  assert.equal(await closed, 4001, 'Rồi server đóng kết nối với code 4001');
  const late = await rawUpgrade(port, '/ws', `Authorization: Bearer ${signToken({ sub: 'binh', rooms: ['general'] }, SECRET, { ttlSec: 60, now: () => T0 })}\r\n`);
  assert.match(late, /^HTTP\/1\.1 401 [\s\S]*expired/, 'Kết nối mới bằng token đã hết hạn → 401 expired');
});
