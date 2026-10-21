// Test tự chấm cho bài N06. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Server listen cổng 0 trên 127.0.0.1; client chỉ dùng transport websocket, không tự kết nối lại.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';

const mod = await import(pathToFileURL(join(process.cwd(), 'rooms.js')).href);
const { normalizeRoom, createRoomServer, sendWithRetry, MAX_TEXT } = mod;

const cleanups = [];
after(async () => {
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* dọn tiếp */ }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startRooms() {
  const out = createRoomServer();
  assert.ok(out && out.server instanceof http.Server, 'createRoomServer phải trả { server: http.Server, io }');
  assert.ok(out.io instanceof Server, 'createRoomServer phải trả { server, io } với io là Socket.IO Server');
  assert.equal(out.server.listening, false, 'createRoomServer chỉ tạo server, KHÔNG tự listen()');
  cleanups.push(() => new Promise((r) => out.io.close(() => r())));
  await new Promise((resolve, reject) => {
    out.server.once('error', reject);
    out.server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${out.server.address().port}`;
}

/** Client Socket.IO gom mọi sự kiện server gửi; next(event) chờ sự kiện kế tiếp (tối đa 2 giây). */
function client(url, name) {
  const socket = ioClient(url, { auth: { name }, transports: ['websocket'], reconnection: false, forceNew: true });
  cleanups.push(() => socket.disconnect());
  const inbox = [];
  const waiters = [];
  socket.onAny((event, data) => {
    const item = { event, data };
    const w = waiters.shift();
    if (w) w(item);
    else inbox.push(item);
  });
  return {
    socket,
    connected: () => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Hết 2 giây mà "${name}" chưa kết nối được`)), 2000);
      socket.once('connect', () => { clearTimeout(t); resolve(); });
      socket.once('connect_error', (e) => { clearTimeout(t); reject(e); });
    }),
    ask: (event, payload) => socket.timeout(2000).emitWithAck(event, payload).catch(() => {
      throw new Error(`Server không gọi ack cho sự kiện "${event}" trong 2 giây`);
    }),
    next(ms = 2000) {
      if (inbox.length) return Promise.resolve(inbox.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Hết ${ms} ms mà server không gửi sự kiện nào`)), ms);
        waiters.push((m) => { clearTimeout(t); resolve(m); });
      });
    },
    async nothing(ms = 150) {
      await sleep(ms);
      return inbox.splice(0);
    },
  };
}

async function member(url, name, rooms = []) {
  const c = client(url, name);
  await c.connected();
  for (const r of rooms) {
    const res = await c.ask('join', r);
    assert.equal(res.ok, true, `${name} join "${r}" phải được ack {ok: true}, nhận ${JSON.stringify(res)}`);
  }
  return c;
}

// ---------- normalizeRoom ----------

test('normalizeRoom: trim, chữ thường, chỉ a-z 0-9 -', () => {
  assert.equal(normalizeRoom('  Dev '), 'dev', "'  Dev ' → 'dev'");
  assert.equal(normalizeRoom('team-1'), 'team-1', "'team-1' giữ nguyên");
  assert.equal(normalizeRoom('a'.repeat(30)), 'a'.repeat(30), '30 ký tự vẫn hợp lệ');
  for (const bad of ['', '   ', 'phòng 1', 'dev!', 'a'.repeat(31), 'dev_ops', 42, null, undefined, ['dev'], { room: 'dev' }]) {
    assert.equal(normalizeRoom(bad), null, `${JSON.stringify(bad)} → null`);
  }
});

// ---------- createRoomServer ----------

test('createRoomServer: GET / trả giao diện, đường dẫn khác 404', async () => {
  const base = await startRooms();
  const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
  assert.equal(r.status, 200, 'GET / phải trả 200');
  assert.match(r.headers.get('content-type') ?? '', /^text\/html; charset=utf-8/i, 'Content-Type phải là text/html; charset=utf-8');
  assert.match(await r.text(), /TeamPulse/, 'Body phải là nội dung public/index.html');
  assert.equal((await fetch(base + '/x', { signal: AbortSignal.timeout(2000) })).status, 404, 'Đường dẫn khác phải trả 404');
});

test('createRoomServer: middleware từ chối tên không hợp lệ', async () => {
  const base = await startRooms();
  for (const name of [undefined, '', '   ', 'x'.repeat(21), 7]) {
    const c = client(base, name);
    await assert.rejects(c.connected(), (e) => e.message === 'invalid_name',
      `auth.name = ${JSON.stringify(name)} → connect_error với message "invalid_name"`);
  }
  const ok = client(base, '  An ');
  await ok.connected();
});

test('createRoomServer: join trả ack có members, người khác nhận joined', async () => {
  const base = await startRooms();
  const an = await member(base, 'An', ['dev']);
  const binh = await member(base, 'Binh');
  assert.deepEqual(await binh.ask('join', ' DEV '), { ok: true, room: 'dev', members: 2 },
    'join " DEV " → ack {ok: true, room: "dev", members: 2} (số người SAU khi vào)');
  assert.deepEqual(await an.next(), { event: 'joined', data: { room: 'dev', name: 'Binh' } },
    'An (đã ở dev) nhận "joined" {room, name}');
  assert.deepEqual(await binh.nothing(), [], 'Người vừa vào không nhận "joined" của chính mình');
  assert.deepEqual(await binh.ask('join', 'dev'), { ok: true, room: 'dev', members: 2 }, 'Join lại room đang ở: vẫn ok, members không đổi');
  assert.deepEqual(await an.nothing(), [], 'Join lại room đang ở không gửi "joined" lần nữa');
  assert.deepEqual(await binh.ask('join', 'phòng 1'), { ok: false, error: 'invalid_room' }, 'Room sai → {ok: false, error: "invalid_room"}');
});

test('createRoomServer: chat chỉ tới người trong room, id tăng dần, ack {ok, id}', async () => {
  const base = await startRooms();
  const an = await member(base, 'An', ['dev', 'general']);
  const binh = await member(base, 'Binh', ['dev']);
  await an.next(); // joined Binh
  const chi = await member(base, 'Chi', ['general']);
  await an.next(); // joined Chi
  const ack1 = await an.ask('chat', { room: 'dev', text: '  Build xong  ' });
  assert.deepEqual(ack1, { ok: true, id: 1 }, 'Tin đầu tiên của server: ack {ok: true, id: 1}');
  for (const [who, c] of [['An', an], ['Binh', binh]]) {
    const m = await c.next();
    assert.equal(m.event, 'chat', `${who} (trong dev) phải nhận sự kiện "chat"`);
    assert.equal(m.data.id, 1, 'msg.id = 1');
    assert.equal(m.data.room, 'dev', 'msg.room = "dev"');
    assert.equal(m.data.from, 'An', 'msg.from = tên người gửi');
    assert.equal(m.data.text, 'Build xong', 'msg.text đã trim');
    assert.ok(typeof m.data.ts === 'string' && !Number.isNaN(Date.parse(m.data.ts)), 'msg.ts là new Date().toISOString()');
  }
  assert.deepEqual(await chi.nothing(), [], 'Chi không ở dev → không nhận tin của dev');
  const ack2 = await an.ask('chat', { room: 'general', text: 'Họp 3h' });
  assert.deepEqual(ack2, { ok: true, id: 2 }, 'id tăng dần trên toàn server: 2');
  assert.equal((await chi.next()).data.text, 'Họp 3h', 'Chi (trong general) nhận tin của general');
});

test('createRoomServer: chat sai → ack lỗi, không ai nhận', async () => {
  const base = await startRooms();
  const an = await member(base, 'An', ['dev']);
  const binh = await member(base, 'Binh', ['dev']);
  await an.next(); // joined Binh
  assert.deepEqual(await an.ask('chat', { room: 'general', text: 'hi' }), { ok: false, error: 'not_in_room' }, 'Chưa vào general → not_in_room');
  assert.deepEqual(await an.ask('chat', { room: '???', text: 'hi' }), { ok: false, error: 'not_in_room' }, 'Room sai → not_in_room');
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: '   ' }), { ok: false, error: 'invalid_text' }, 'text rỗng → invalid_text');
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: 5 }), { ok: false, error: 'invalid_text' }, 'text không phải chuỗi → invalid_text');
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: 'x'.repeat(MAX_TEXT + 1) }), { ok: false, error: 'invalid_text' }, `text dài hơn ${MAX_TEXT} → invalid_text`);
  assert.deepEqual(await binh.nothing(), [], 'Tin sai không được gửi cho ai');
  an.socket.emit('chat', { room: 'dev', text: 'không cần ack' });
  assert.equal((await binh.next()).data.text, 'không cần ack', 'Client không gửi ack → server vẫn xử lý, không ném lỗi');
});

test('createRoomServer: gửi lại cùng clientId → chỉ phát một lần, ack id cũ (idempotent)', async () => {
  const base = await startRooms();
  const an = await member(base, 'An', ['dev']);
  const binh = await member(base, 'Binh', ['dev']);
  await an.next(); // joined Binh
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: 'Deploy 10h', clientId: 'an-1' }), { ok: true, id: 1 },
    'Lần gửi đầu với clientId "an-1" → ack {ok: true, id: 1}');
  assert.equal((await binh.next()).data.text, 'Deploy 10h', 'Lần gửi đầu: Binh nhận tin');
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: 'Deploy 10h', clientId: 'an-1' }), { ok: true, id: 1 },
    'Gửi lại cùng clientId "an-1" → ack lại {ok: true, id: 1} như lần đầu, không cấp id mới');
  assert.deepEqual(await binh.nothing(), [], 'Gửi lại cùng clientId → KHÔNG phát "chat" lần nữa');
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: 'Deploy 10h', clientId: 'an-2' }), { ok: true, id: 2 },
    'clientId khác ("an-2") → tin mới, id 2');
  assert.equal((await binh.next()).data.id, 2, 'Binh nhận tin id 2');
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: 'không có clientId' }), { ok: true, id: 3 }, 'Không có clientId → tin mới, id 3');
  assert.deepEqual(await an.ask('chat', { room: 'dev', text: 'không có clientId' }), { ok: true, id: 4 }, 'Không có clientId → mỗi lần là tin mới, id 4');
});

test('createRoomServer: leave và ngắt kết nối → left cho người còn lại', async () => {
  const base = await startRooms();
  const an = await member(base, 'An', ['dev', 'general']);
  const binh = await member(base, 'Binh', ['dev', 'general']);
  await an.next(); // joined Binh dev
  await an.next(); // joined Binh general
  assert.deepEqual(await binh.ask('leave', 'general'), { ok: true, room: 'general' }, 'leave → ack {ok: true, room}');
  assert.deepEqual(await an.next(), { event: 'left', data: { room: 'general', name: 'Binh' } }, 'An nhận "left" của general');
  assert.deepEqual(await binh.ask('leave', 'general'), { ok: false, error: 'not_in_room' }, 'Rời room không ở → not_in_room');
  assert.deepEqual(await binh.nothing(), [], 'Người rời không nhận "left" của chính mình');
  binh.socket.disconnect();
  assert.deepEqual(await an.next(), { event: 'left', data: { room: 'dev', name: 'Binh' } },
    'Binh ngắt kết nối → An nhận "left" cho room dev (dùng sự kiện disconnecting)');
  assert.deepEqual(await an.nothing(), [], 'Không gửi "left" cho general lần nữa (Binh đã rời general)');
});

// ---------- sendWithRetry ----------

/** Server Socket.IO thử: bỏ qua `ignore` lần đầu của sự kiện "save", sau đó ack. */
async function flakyServer(ignore) {
  const server = http.createServer();
  const io = new Server(server);
  const seen = [];
  io.on('connection', (socket) => {
    socket.on('save', (payload, ack) => {
      seen.push(payload);
      if (seen.length > ignore) ack({ saved: payload.n, try: seen.length });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => io.close(() => r())));
  const socket = ioClient(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false, forceNew: true });
  cleanups.push(() => socket.disconnect());
  await new Promise((r) => socket.once('connect', r));
  return { socket, seen };
}

test('sendWithRetry: có ack ngay → attempts 1', async () => {
  const { socket, seen } = await flakyServer(0);
  const r = await sendWithRetry(socket, 'save', { n: 7 }, { timeoutMs: 500 });
  assert.deepEqual(r, { response: { saved: 7, try: 1 }, attempts: 1 }, 'Ack lần đầu → { response, attempts: 1 }');
  assert.equal(seen.length, 1, 'Chỉ gửi một lần');
});

test('sendWithRetry: không có ack → gửi lại sau timeoutMs', async () => {
  const { socket, seen } = await flakyServer(2);
  const t0 = Date.now();
  const r = await sendWithRetry(socket, 'save', { n: 1 }, { timeoutMs: 100, retries: 2 });
  const took = Date.now() - t0;
  assert.deepEqual(r, { response: { saved: 1, try: 3 }, attempts: 3 }, 'Bỏ qua 2 lần, lần 3 có ack → attempts 3');
  assert.equal(seen.length, 3, 'Server nhận 3 lần gửi (2 lần đầu không ack)');
  assert.ok(took >= 180 && took < 1500, `Phải chờ khoảng 2 × timeoutMs trước lần 3, đo được ${took} ms`);
});

test('sendWithRetry: hết lượt → reject ack_timeout', async () => {
  const { socket, seen } = await flakyServer(99);
  await assert.rejects(sendWithRetry(socket, 'save', { n: 2 }, { timeoutMs: 60, retries: 1 }),
    (e) => e instanceof Error && e.message === 'ack_timeout', 'Hết 1 + retries lần không có ack → Error("ack_timeout")');
  assert.equal(seen.length, 2, 'retries = 1 → gửi tổng cộng 2 lần');
});
