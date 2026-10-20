// Test tự chấm cho bài N04. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Mọi server listen cổng 0 trên 127.0.0.1; mọi kết nối và server được đóng trong after().
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

const mod = await import(pathToFileURL(join(process.cwd(), 'chat.js')).href);
const { parseClientMessage, broadcast, createChatServer, MAX_NAME, MAX_TEXT, OPEN } = mod;

const servers = [];
const clients = [];
after(() => {
  for (const c of clients) c.terminate();
  for (const s of servers) {
    s.closeAllConnections?.();
    s.close();
  }
});

async function startChat() {
  const server = createChatServer();
  assert.ok(server instanceof http.Server, 'createChatServer phải trả về http.Server');
  assert.equal(server.listening, false, 'createChatServer chỉ tạo server, KHÔNG tự listen()');
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  return { base: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws` };
}

/** Client thử: gom mọi tin JSON nhận được; next() chờ tin kế tiếp (tối đa 2 giây). */
async function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  clients.push(ws);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data) => {
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      m = { notJson: String(data) };
    }
    const w = waiters.shift();
    if (w) w(m);
    else inbox.push(m);
  });
  ws.on('error', () => {});
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Hết 2 giây mà chưa kết nối được tới /ws')), 2000);
    ws.once('open', () => { clearTimeout(t); resolve(); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
  const c = {
    ws,
    send: (obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
    next(ms = 2000) {
      if (inbox.length) return Promise.resolve(inbox.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Hết ${ms} ms mà server không gửi tin nào`)), ms);
        waiters.push((m) => { clearTimeout(t); resolve(m); });
      });
    },
    /** Không được nhận thêm tin nào trong `ms` mili giây. */
    async nothing(ms = 150) {
      await new Promise((r) => setTimeout(r, ms));
      return inbox.splice(0);
    },
  };
  return c;
}

/** Kết nối và join với tên `name`, trả client đã nhận welcome. */
async function joined(wsUrl, name) {
  const c = await client(wsUrl);
  c.send({ type: 'join', name });
  const w = await c.next();
  assert.equal(w.type, 'welcome', `join hợp lệ với tên "${name}" phải nhận {type: "welcome"}, nhận được ${JSON.stringify(w)}`);
  return c;
}

// ---------- parseClientMessage ----------

test('parseClientMessage: join và chat hợp lệ được chuẩn hoá', () => {
  assert.deepEqual(parseClientMessage('{"type":"join","name":"  An  "}'), { ok: true, msg: { type: 'join', name: 'An' } },
    'join: name phải được trim');
  assert.deepEqual(parseClientMessage(Buffer.from('{"type":"chat","text":" Chào cả nhà ","x":1}')),
    { ok: true, msg: { type: 'chat', text: 'Chào cả nhà' } }, 'chat: nhận cả Buffer, text được trim, bỏ khóa thừa');
});

test('parseClientMessage: JSON hỏng hoặc không phải object → invalid_json', () => {
  for (const raw of ['{hỏng', '', '[1,2]', '42', 'null', '"chuỗi"']) {
    let r;
    assert.doesNotThrow(() => { r = parseClientMessage(raw); }, `parseClientMessage(${JSON.stringify(raw)}) không được ném lỗi`);
    assert.deepEqual(r, { ok: false, error: 'invalid_json' }, `${JSON.stringify(raw)} → { ok: false, error: 'invalid_json' }`);
  }
});

test('parseClientMessage: type lạ → unknown_type', () => {
  for (const raw of ['{"type":"kick"}', '{}', '{"type":"JOIN","name":"An"}']) {
    assert.deepEqual(parseClientMessage(raw), { ok: false, error: 'unknown_type' }, `${raw} → unknown_type`);
  }
});

test('parseClientMessage: tên và nội dung sai độ dài/kiểu', () => {
  const cases = [
    ['{"type":"join"}', 'invalid_name'], ['{"type":"join","name":"   "}', 'invalid_name'],
    ['{"type":"join","name":7}', 'invalid_name'], [JSON.stringify({ type: 'join', name: 'a'.repeat(MAX_NAME + 1) }), 'invalid_name'],
    ['{"type":"chat"}', 'invalid_text'], ['{"type":"chat","text":"  "}', 'invalid_text'],
    ['{"type":"chat","text":["a"]}', 'invalid_text'], [JSON.stringify({ type: 'chat', text: 'x'.repeat(MAX_TEXT + 1) }), 'invalid_text'],
  ];
  for (const [raw, error] of cases) {
    assert.deepEqual(parseClientMessage(raw), { ok: false, error }, `${raw.slice(0, 40)} → ${error}`);
  }
  assert.equal(parseClientMessage(JSON.stringify({ type: 'join', name: 'a'.repeat(MAX_NAME) })).ok, true, `Tên đúng ${MAX_NAME} ký tự vẫn hợp lệ`);
  assert.equal(parseClientMessage(JSON.stringify({ type: 'chat', text: 'x'.repeat(MAX_TEXT) })).ok, true, `Tin đúng ${MAX_TEXT} ký tự vẫn hợp lệ`);
});

// ---------- broadcast ----------

function fake(readyState = OPEN) {
  return { readyState, got: [], send(d) { this.got.push(d); } };
}

test('broadcast: gửi cùng một chuỗi JSON cho client OPEN, trả số đã gửi', () => {
  const a = fake();
  const b = fake();
  const n = broadcast(new Set([a, b]), { type: 'chat', text: 'hi' });
  assert.equal(n, 2, 'Có 2 client OPEN → trả 2');
  assert.deepEqual(a.got, ['{"type":"chat","text":"hi"}'], 'Mỗi client nhận đúng JSON.stringify(payload)');
  assert.equal(a.got[0], b.got[0], 'Mọi client nhận cùng một chuỗi');
});

test('broadcast: bỏ qua except và client không OPEN', () => {
  const me = fake();
  const other = fake();
  const closing = fake(2);
  const closed = fake(3);
  const connecting = fake(0);
  const n = broadcast([me, other, closing, closed, connecting], { type: 'left' }, me);
  assert.equal(n, 1, 'Chỉ "other" được gửi → trả 1');
  assert.equal(me.got.length, 0, 'Client except không được nhận');
  assert.equal(closing.got.length + closed.got.length + connecting.got.length, 0, 'Chỉ gửi cho client có readyState === OPEN (1)');
  assert.equal(broadcast([], { type: 'x' }), 0, 'Không có client → trả 0');
});

// ---------- createChatServer ----------

test('createChatServer: GET / trả giao diện chat, đường dẫn khác 404', async () => {
  const { base } = await startChat();
  const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
  assert.equal(r.status, 200, 'GET / phải trả 200');
  assert.match(r.headers.get('content-type') ?? '', /^text\/html; charset=utf-8/i, 'Content-Type phải là text/html; charset=utf-8');
  assert.match(await r.text(), /TeamPulse/, 'Body phải là nội dung public/index.html');
  assert.equal((await fetch(base + '/x', { signal: AbortSignal.timeout(2000) })).status, 404, 'Đường dẫn khác phải trả 404');
});

test('createChatServer: join → welcome cho mình, joined cho người khác, users sắp xếp', async () => {
  const { wsUrl } = await startChat();
  const binh = await joined(wsUrl, 'Binh');
  const an = await client(wsUrl);
  an.send({ type: 'join', name: ' An ' });
  assert.deepEqual(await an.next(), { type: 'welcome', name: 'An', users: ['An', 'Binh'] },
    'Người vào nhận {type: "welcome", name, users} — users sắp A→Z, gồm cả mình');
  assert.deepEqual(await binh.next(), { type: 'joined', name: 'An', users: ['An', 'Binh'] },
    'Người đã ở trong phòng nhận {type: "joined", name, users}');
  assert.deepEqual(await an.nothing(), [], 'Người vừa vào không nhận "joined" của chính mình');
});

test('createChatServer: chat tới mọi người đã join, kể cả người gửi', async () => {
  const { wsUrl } = await startChat();
  const an = await joined(wsUrl, 'An');
  const binh = await joined(wsUrl, 'Binh');
  await an.next(); // joined Binh
  const lurker = await client(wsUrl); // kết nối nhưng chưa join
  an.send({ type: 'chat', text: '  Deploy lúc 10h  ' });
  for (const [who, c] of [['An', an], ['Binh', binh]]) {
    const m = await c.next();
    assert.equal(m.type, 'chat', `${who} phải nhận tin chat`);
    assert.equal(m.from, 'An', 'from là tên người gửi');
    assert.equal(m.text, 'Deploy lúc 10h', 'text đã trim');
    assert.ok(typeof m.ts === 'string' && !Number.isNaN(Date.parse(m.ts)), 'ts là new Date().toISOString()');
  }
  assert.deepEqual(await lurker.nothing(), [], 'Client chưa join không được nhận tin chat');
});

test('createChatServer: chat trước khi join → not_joined', async () => {
  const { wsUrl } = await startChat();
  const c = await client(wsUrl);
  c.send({ type: 'chat', text: 'xin chào' });
  assert.deepEqual(await c.next(), { type: 'error', error: 'not_joined' }, 'Chưa join mà chat → {type: "error", error: "not_joined"}');
});

test('createChatServer: trùng tên (không phân biệt hoa thường) và join hai lần', async () => {
  const { wsUrl } = await startChat();
  const an = await joined(wsUrl, 'An');
  const copy = await client(wsUrl);
  copy.send({ type: 'join', name: 'an' });
  assert.deepEqual(await copy.next(), { type: 'error', error: 'name_taken' }, '"an" trùng "An" → name_taken');
  assert.deepEqual(await an.nothing(), [], 'Join thất bại không được báo "joined" cho người khác');
  an.send({ type: 'join', name: 'An2' });
  assert.deepEqual(await an.next(), { type: 'error', error: 'already_joined' }, 'Đã join mà join tiếp → already_joined');
  copy.send({ type: 'join', name: 'Chi' });
  assert.deepEqual((await copy.next()).users, ['An', 'Chi'], 'Sau lỗi name_taken vẫn join được bằng tên khác');
});

test('createChatServer: JSON hỏng → error cho người gửi, kết nối vẫn dùng được', async () => {
  const { wsUrl } = await startChat();
  const an = await joined(wsUrl, 'An');
  const binh = await joined(wsUrl, 'Binh');
  await an.next(); // joined Binh
  an.send('{hỏng');
  assert.deepEqual(await an.next(), { type: 'error', error: 'invalid_json' }, 'JSON hỏng → {type: "error", error: "invalid_json"}');
  assert.deepEqual(await binh.nothing(), [], 'Lỗi chỉ gửi cho người gửi sai');
  an.send({ type: 'chat', text: 'vẫn sống' });
  assert.equal((await an.next()).text, 'vẫn sống', 'Sau tin hỏng, kết nối vẫn mở và chat được');
  assert.equal(an.ws.readyState, OPEN, 'Server không được đóng kết nối vì một tin hỏng');
});

test('createChatServer: rời phòng → left cho người còn lại, users cập nhật', async () => {
  const { wsUrl } = await startChat();
  const an = await joined(wsUrl, 'An');
  const binh = await joined(wsUrl, 'Binh');
  await an.next(); // joined Binh
  const ghost = await client(wsUrl); // chưa join
  ghost.ws.close();
  binh.ws.terminate(); // mất kết nối đột ngột, không có frame close
  assert.deepEqual(await an.next(), { type: 'left', name: 'Binh', users: ['An'] },
    'Khi Binh mất kết nối, An nhận {type: "left", name: "Binh", users: ["An"]}');
  assert.deepEqual(await an.nothing(), [], 'Client chưa join rời đi thì không báo "left"');
  const binh2 = await client(wsUrl);
  binh2.send({ type: 'join', name: 'Binh' });
  assert.equal((await binh2.next()).type, 'welcome', 'Tên của người đã rời phải được giải phóng, join lại được');
});
