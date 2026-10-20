// Test tự chấm cho bài N02. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Server trong test listen ở cổng 0 (hệ điều hành tự chọn cổng trống) trên 127.0.0.1 và luôn được đóng.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(join(process.cwd(), 'api.js')).href);
const { ChatRoom, sendJson, readJsonBody, createApp, MAX_TEXT } = mod;

const servers = [];
after(() => {
  for (const s of servers) {
    s.closeAllConnections?.();
    s.close();
  }
});

/** Cho server listen ở cổng ngẫu nhiên, trả về base URL. */
async function listen(server) {
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function startApp(room = new ChatRoom()) {
  const server = createApp(room);
  assert.ok(server instanceof http.Server, 'createApp phải trả về http.Server (dùng http.createServer)');
  assert.equal(server.listening, false, 'createApp chỉ tạo server, KHÔNG tự gọi listen()');
  return { room, base: await listen(server) };
}

async function call(base, path, init) {
  const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(3000) });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: res.status, headers: res.headers, body, text };
}

const bodyOf = (s) => Readable.from([Buffer.from(s)]);

// ---------- ChatRoom ----------

test('ChatRoom.post: tạo tin có id tăng dần, trim, ts ISO', () => {
  const room = new ChatRoom();
  const a = room.post(' an ', ' Chào ');
  const b = room.post('binh', 'Hi');
  assert.equal(a.id, 1, 'Tin đầu tiên có id 1');
  assert.equal(b.id, 2, 'Tin thứ hai có id 2');
  assert.equal(a.user, 'an', 'user phải được trim');
  assert.equal(a.text, 'Chào', 'text phải được trim');
  assert.equal(typeof a.ts, 'string', 'ts là chuỗi');
  assert.ok(!Number.isNaN(Date.parse(a.ts)) && a.ts.endsWith('Z'), 'ts dạng new Date().toISOString()');
  assert.deepEqual(Object.keys(a).sort(), ['id', 'text', 'ts', 'user'], 'Tin chỉ có 4 khóa id, user, text, ts');
  assert.equal(room.messages.length, 2, 'Tin phải được lưu vào this.messages');
});

test('ChatRoom.post: phát sự kiện "message" với đúng tin vừa tạo', () => {
  const room = new ChatRoom();
  const seen = [];
  room.on('message', (m) => seen.push(m));
  const m = room.post('an', 'Xin chào');
  assert.equal(seen.length, 1, 'Mỗi lần post phải emit("message", tin) đúng một lần');
  assert.equal(seen[0], m, 'Đối số của sự kiện phải là chính tin vừa tạo');
});

test('ChatRoom.post: dữ liệu sai → lỗi status 400, không lưu, không emit, không tăng id', () => {
  const room = new ChatRoom();
  let emitted = 0;
  room.on('message', () => { emitted += 1; });
  const bad = [['', 'x'], ['  ', 'x'], [undefined, 'x'], [7, 'x'], ['an', ''], ['an', '   '], ['an', null], ['an', 'x'.repeat(MAX_TEXT + 1)]];
  for (const [u, t] of bad) {
    assert.throws(() => room.post(u, t), (err) => err.status === 400,
      `post(${JSON.stringify(u)}, ${JSON.stringify(t)?.slice(0, 20)}) phải ném lỗi có status 400 (dùng httpError)`);
  }
  assert.equal(room.messages.length, 0, 'Dữ liệu sai thì không được lưu');
  assert.equal(emitted, 0, 'Dữ liệu sai thì không được emit');
  assert.equal(room.post('an', 'x'.repeat(MAX_TEXT)).id, 1, `text đúng ${MAX_TEXT} ký tự vẫn hợp lệ; id không tăng khi lỗi`);
});

test('ChatRoom.history: lọc theo sinceId, trả mảng mới', () => {
  const room = new ChatRoom();
  room.post('an', '1');
  room.post('an', '2');
  room.post('an', '3');
  assert.deepEqual(room.history().map((m) => m.id), [1, 2, 3], 'Không truyền sinceId → mọi tin');
  assert.deepEqual(room.history(1).map((m) => m.id), [2, 3], 'history(1) → tin có id > 1');
  assert.deepEqual(room.history(3), [], 'history(3) → [] khi không có tin mới');
  const h = room.history();
  h.pop();
  assert.equal(room.messages.length, 3, 'Sửa mảng trả về không được làm mất tin trong room');
});

// ---------- sendJson ----------

test('sendJson: đúng status, Content-Type và body JSON', async () => {
  const server = http.createServer((req, res) => sendJson(res, 418, { tea: 'trà đá', n: 2 }));
  const base = await listen(server);
  const r = await call(base, '/');
  assert.equal(r.status, 418, 'Phải trả đúng status truyền vào');
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8',
    'Content-Type phải đúng là "application/json; charset=utf-8"');
  assert.deepEqual(r.body, { tea: 'trà đá', n: 2 }, 'Body phải là JSON.stringify(data)');
});

// ---------- readJsonBody ----------

test('readJsonBody: gom nhiều mẩu rồi parse', async () => {
  const req = Readable.from([Buffer.from('{"user":"an",'), Buffer.from('"text":"chào"}')]);
  const p = readJsonBody(req);
  assert.ok(p instanceof Promise, 'readJsonBody phải là hàm async');
  assert.deepEqual(await p, { user: 'an', text: 'chào' }, 'Phải gom đủ các mẩu Buffer rồi mới JSON.parse');
});

test('readJsonBody: body rỗng / JSON hỏng / không phải object → 400', async () => {
  for (const raw of ['', '{"user": ', '[1,2]', '42', 'null']) {
    await assert.rejects(readJsonBody(bodyOf(raw)), (err) => err.status === 400,
      `Body ${JSON.stringify(raw)} phải ném lỗi có status 400`);
  }
});

test('readJsonBody: vượt limit → 413', async () => {
  const big = JSON.stringify({ text: 'x'.repeat(200) });
  await assert.rejects(readJsonBody(bodyOf(big), 100), (err) => err.status === 413,
    'Body dài hơn limit byte phải ném lỗi có status 413');
  assert.deepEqual(await readJsonBody(bodyOf('{"a":1}'), 7), { a: 1 }, 'Body dài đúng bằng limit vẫn hợp lệ');
});

// ---------- createApp ----------

test('createApp: GET /health → 200 {ok: true}', async () => {
  const { base } = await startApp();
  const r = await call(base, '/health');
  assert.equal(r.status, 200, 'GET /health phải trả 200');
  assert.deepEqual(r.body, { ok: true }, 'GET /health phải trả {"ok": true}');
});

test('createApp: POST /messages → 201 và tin vừa tạo; GET /messages đọc lại', async () => {
  const { base, room } = await startApp();
  let emitted = 0;
  room.on('message', () => { emitted += 1; });
  const r = await call(base, '/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: 'an', text: 'Deploy lúc 10h' }),
  });
  assert.equal(r.status, 201, 'Tạo tin thành công phải trả 201 Created');
  assert.equal(r.body?.id, 1, 'Body trả về là tin vừa tạo (id 1)');
  assert.equal(r.body?.text, 'Deploy lúc 10h', 'Body có text của tin');
  assert.equal(emitted, 1, 'POST qua API cũng phải phát sự kiện message (gọi room.post)');
  const g = await call(base, '/messages');
  assert.equal(g.status, 200, 'GET /messages phải trả 200');
  assert.deepEqual(g.body?.messages?.map((m) => m.text), ['Deploy lúc 10h'], 'GET /messages trả {messages: [...]}');
});

test('createApp: GET /messages?since=N chỉ trả tin mới', async () => {
  const room = new ChatRoom();
  room.post('an', '1');
  room.post('an', '2');
  room.post('an', '3');
  const { base } = await startApp(room);
  assert.deepEqual((await call(base, '/messages?since=2')).body?.messages?.map((m) => m.id), [3],
    '?since=2 → chỉ tin id 3 (nhớ tách query khỏi đường dẫn bằng new URL)');
  assert.equal((await call(base, '/messages?since=abc')).body?.messages?.length, 3, 'since không phải số → coi như 0');
});

test('createApp: dữ liệu sai → 400 kèm {error}', async () => {
  const { base, room } = await startApp();
  const broken = await call(base, '/messages', { method: 'POST', body: '{"user": "an", ' });
  assert.equal(broken.status, 400, 'JSON hỏng phải trả 400');
  assert.equal(typeof broken.body?.error, 'string', 'Response lỗi phải là JSON {"error": "..."}');
  const empty = await call(base, '/messages', { method: 'POST', body: JSON.stringify({ user: 'an', text: '  ' }) });
  assert.equal(empty.status, 400, 'text rỗng phải trả 400 (lỗi status 400 từ room.post)');
  assert.equal(room.messages.length, 0, 'Request lỗi không được tạo tin');
});

test('createApp: body quá lớn → 413', async () => {
  const { base } = await startApp();
  const r = await call(base, '/messages', { method: 'POST', body: JSON.stringify({ user: 'an', text: 'x'.repeat(20_000) }) });
  assert.equal(r.status, 413, 'Body lớn hơn 10000 byte phải trả 413');
  assert.equal(typeof r.body?.error, 'string', 'Response 413 phải là JSON {"error": "..."}');
});

test('createApp: sai route → 404, sai method → 405 có header Allow', async () => {
  const { base } = await startApp();
  const nf = await call(base, '/khong-co');
  assert.equal(nf.status, 404, 'Đường dẫn không tồn tại phải trả 404');
  assert.equal(typeof nf.body?.error, 'string', 'Response 404 phải là JSON {"error": "..."}');
  const na = await call(base, '/messages', { method: 'DELETE' });
  assert.equal(na.status, 405, 'DELETE /messages phải trả 405 Method Not Allowed');
  assert.equal(na.headers.get('allow'), 'GET, POST', 'Response 405 phải có header "Allow: GET, POST"');
  assert.equal(typeof na.body?.error, 'string', 'Response 405 phải là JSON {"error": "..."}');
});

test('createApp: lỗi bất ngờ → 500 JSON, server vẫn sống', async () => {
  const room = new ChatRoom();
  room.history = () => { throw new Error('ổ đĩa hỏng'); };
  const { base } = await startApp(room);
  const r = await call(base, '/messages');
  assert.equal(r.status, 500, 'Lỗi không có err.status phải trả 500');
  assert.equal(typeof r.body?.error, 'string', 'Response 500 phải là JSON {"error": "..."}');
  assert.equal((await call(base, '/health')).status, 200, 'Sau lỗi 500 server vẫn phải trả lời request khác');
});
