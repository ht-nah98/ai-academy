// Test tự chấm cho bài N13. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Postgres thật chạy trong tiến trình (PGlite, bộ nhớ) với migration 001→003; server listen cổng 0 trên 127.0.0.1, đóng trong after().
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { WebSocket, WebSocketServer } from 'ws';

const load = (file) => import(pathToFileURL(join(process.cwd(), file)).href);
const { saveMessage, messagesAfter, attachChat, withBroadcast, createChatServer } = await load('chat-store.ts');
const { migrate } = await load('migrate.ts');
const { createPgStore } = await load('store.ts');

const db = new PGlite();
const store = createPgStore(db);
const cleanups = [];
before(async () => {
  await migrate(db, join(process.cwd(), 'migrations'));
});
after(async () => {
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* dọn tiếp */ }
  }
  await db.close();
});

let seq = 0;
const cid = (p = 'c') => `${p}-${++seq}`;
/** Tạo một kênh mới (tên duy nhất), trả id. */
const channel = async (prefix) => (await store.createChannel(`${prefix}-${++seq}`)).id;
const msg = (channelId, text, author = 'an') => ({ channelId, author, clientMsgId: cid('m'), text });
const countRows = async (channelId) => (await db.query('SELECT count(*)::int AS n FROM messages WHERE channel_id = $1', [channelId])).rows[0].n;
async function codeOf(promise) {
  try { await promise; } catch (err) { return err.code ?? err.message; }
  return 'không lỗi';
}

// ---------- saveMessage ----------

test('saveMessage: lưu tin mới vào bảng messages của N12, id server cấp tăng dần, trả ChatMessage', async () => {
  const ch = await channel('s1');
  const a = await saveMessage(db, { channelId: ch, author: 'An', clientMsgId: 'sm-1', text: 'Chào' });
  assert.equal(a.duplicate, false, 'Tin mới → duplicate: false');
  assert.equal(typeof a.message.id, 'number', 'message.id phải là number (dùng rowToChatMessage)');
  assert.deepEqual({ ...a.message, id: 0, createdAt: '' },
    { id: 0, channelId: ch, author: 'An', clientMsgId: 'sm-1', text: 'Chào', createdAt: '' },
    'message = {id, channelId, author (tên), clientMsgId, text, createdAt}');
  assert.ok(!Number.isNaN(Date.parse(a.message.createdAt)), 'createdAt là chuỗi ngày ISO');
  const b = await saveMessage(db, { channelId: ch, author: 'Binh', clientMsgId: 'sm-2', text: 'Hi' });
  assert.ok(b.message.id > a.message.id, 'Tin lưu sau có id lớn hơn');
  assert.equal(await countRows(ch), 2, 'Bảng messages có đúng 2 dòng của kênh này');
  const users = (await db.query("SELECT count(*)::int AS n FROM users WHERE name IN ('An', 'Binh')")).rows[0].n;
  assert.equal(users, 2, 'Người gửi chưa có thì được tạo trong bảng users (theo name)');
  await saveMessage(db, { channelId: ch, author: 'An', clientMsgId: 'sm-3', text: 'Lần hai' });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE name = 'An'")).rows[0].n, 1, 'Người gửi đã có → dùng lại, không tạo thêm');
  assert.equal(await codeOf(saveMessage(db, { channelId: 999999, author: 'An', clientMsgId: 'sm-4', text: 'x' })), '23503',
    'Kênh không tồn tại → để lỗi khóa ngoại 23503 của Postgres ném ra');
});

test('saveMessage: gửi lại cùng clientMsgId → duplicate, trả tin CŨ, không thêm dòng; khác người gửi là tin khác', async () => {
  const ch = await channel('s2');
  const first = await saveMessage(db, { channelId: ch, author: 'An', clientMsgId: 'dup-1', text: 'Bản gốc' });
  const again = await saveMessage(db, { channelId: ch, author: 'An', clientMsgId: 'dup-1', text: 'Bản gửi lại' });
  assert.equal(again.duplicate, true, 'Cùng kênh, cùng người gửi, cùng clientMsgId → duplicate: true');
  assert.equal(again.message.id, first.message.id, 'Tin trùng trả về đúng id của tin đã lưu');
  assert.equal(again.message.text, 'Bản gốc', 'Giữ nội dung của lần lưu đầu');
  assert.equal(again.message.author, 'An', 'Tin cũ có author là tên người gửi');
  assert.equal(await countRows(ch), 1, 'Không được tạo dòng thứ hai');
  const other = await saveMessage(db, { channelId: ch, author: 'Binh', clientMsgId: 'dup-1', text: 'Của Binh' });
  assert.equal(other.duplicate, false, 'Cùng clientMsgId nhưng người gửi khác → tin khác, lưu bình thường');
  const ch2 = await channel('s2b');
  assert.equal((await saveMessage(db, { channelId: ch2, author: 'An', clientMsgId: 'dup-1', text: 'Kênh khác' })).duplicate, false,
    'Cùng clientMsgId nhưng kênh khác → tin khác');
});

// ---------- messagesAfter ----------

test('messagesAfter: chỉ tin của kênh, id > afterId, tăng dần, có limit, gồm cả tin REST', async () => {
  const ch = await channel('ma');
  const noise = await channel('ma-khac');
  const ids = [];
  for (let i = 1; i <= 3; i++) {
    ids.push((await saveMessage(db, msg(ch, `tin ${i}`))).message.id);
    await saveMessage(db, msg(noise, `nhiễu ${i}`));
  }
  ids.push((await store.addMessage({ channelId: ch, author: 'Chi', text: 'tin 4 (REST)' })).id);
  const all = await messagesAfter(db, ch, 0);
  assert.deepEqual(all.map((m) => m.id), ids, 'afterId = 0 → mọi tin của kênh, id tăng dần, không lẫn kênh khác');
  assert.deepEqual(all[3], { ...all[3], author: 'Chi', clientMsgId: null, text: 'tin 4 (REST)' }, 'Tin gửi qua REST có clientMsgId: null');
  assert.deepEqual((await messagesAfter(db, ch, ids[1])).map((m) => m.text), ['tin 3', 'tin 4 (REST)'], 'Chỉ tin có id > afterId');
  assert.deepEqual((await messagesAfter(db, ch, 0, 2)).map((m) => m.id), ids.slice(0, 2), 'limit = 2 → 2 tin CŨ nhất sau afterId');
  assert.deepEqual(await messagesAfter(db, ch, ids[3]), [], 'Không còn tin → mảng rỗng');
  assert.equal(typeof all[0].id, 'number', 'Phần tử là ChatMessage (rowToChatMessage)');
});

// ---------- attachChat (qua createChatServer) ----------

async function listen(server) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }));
  return server.address().port;
}

async function startChat(useDb = db) {
  return listen(createChatServer({ db: useDb }));
}

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  cleanups.push(() => ws.terminate());
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    const w = waiters.shift();
    if (w) w(m); else inbox.push(m);
  });
  ws.on('error', () => {});
  const c = {
    ws,
    opened: new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }),
    send: (obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
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
    /** Gửi hello, gom mọi tin tới khi nhận synced. */
    async hello(channelId, user, lastSeenId = 0) {
      await c.opened;
      c.send({ type: 'hello', channelId, user, lastSeenId });
      return c.untilSynced();
    },
    async untilSynced() {
      const got = [];
      for (let m = await c.next(); m.type !== 'synced'; m = await c.next()) {
        assert.notEqual(m.type, 'error', `Không chờ được synced, server báo lỗi: ${JSON.stringify(m)}`);
        got.push(m);
      }
      return got;
    },
  };
  return c;
}

/** Chờ cả ack và bản phát cho chính mình (thứ tự giữa hai tin không quan trọng). */
async function sendChat(c, clientMsgId, text) {
  c.send({ type: 'chat', clientMsgId, text });
  const a = await c.next();
  const b = await c.next();
  const ack = a.type === 'ack' ? a : b;
  const echo = a.type === 'ack' ? b : a;
  assert.equal(ack.type, 'ack', `Người gửi phải nhận {type: "ack"}, nhận: ${JSON.stringify(a)}`);
  assert.equal(echo.type, 'message', `Người gửi cũng nhận bản {type: "message"} của tin mình, nhận: ${JSON.stringify(echo)}`);
  return { ack, echo };
}

test('attachChat: chat → lưu, ack có id, phát cho mọi người cùng kênh; gửi lại → chỉ ack duplicate', async () => {
  const ch = await channel('ws1');
  const other = await channel('ws1-khac');
  const port = await startChat();
  const an = connect(port);
  const binh = connect(port);
  const khac = connect(port);
  assert.deepEqual(await an.hello(ch, 'an'), [], 'Kênh trống → không có tin gửi bù');
  await binh.hello(ch, 'binh');
  await khac.hello(other, 'chi');
  const { ack, echo } = await sendChat(an, 'w-1', 'Họp 3h');
  assert.equal(typeof ack.id, 'number', 'ack.id là id server cấp (number)');
  assert.deepEqual({ ...ack, id: 0 }, { type: 'ack', clientMsgId: 'w-1', id: 0, duplicate: false }, 'ack = {type, clientMsgId, id, duplicate: false}');
  assert.deepEqual(echo, { type: 'message', id: ack.id, channelId: ch, author: 'an', clientMsgId: 'w-1', text: 'Họp 3h', createdAt: echo.createdAt },
    'message = {type: "message", ...ChatMessage}, author lấy từ hello');
  assert.deepEqual(await binh.next(), echo, 'Binh cùng kênh nhận đúng tin đó');
  assert.deepEqual(await khac.nothing(), [], 'Kênh khác không nhận');
  assert.equal(await countRows(ch), 1, 'Đã lưu 1 dòng vào messages');
  an.send({ type: 'chat', clientMsgId: 'w-1', text: 'Họp 3h' });
  assert.deepEqual(await an.next(), { type: 'ack', clientMsgId: 'w-1', id: ack.id, duplicate: true }, 'Gửi lại cùng clientMsgId → ack duplicate: true, cùng id');
  assert.deepEqual(await binh.nothing(), [], 'Tin trùng không được phát lần nữa');
  assert.deepEqual(await an.nothing(), [], 'Người gửi chỉ nhận ack, không nhận thêm message');
  assert.equal(await countRows(ch), 1, 'Vẫn chỉ 1 dòng');
});

test('attachChat: JSON hỏng / sai dạng → bad_message; chat trước hello → hello_first; kênh không có → channel_not_found', async () => {
  const ch = await channel('ws2');
  const port = await startChat();
  const c = connect(port);
  await c.opened;
  c.send('{không phải json');
  assert.deepEqual(await c.next(), { type: 'error', error: 'bad_message' }, 'JSON hỏng → bad_message');
  c.send({ type: 'chat', clientMsgId: 'x-1', text: 'sớm quá' });
  assert.deepEqual(await c.next(), { type: 'error', error: 'hello_first' }, 'chat trước hello → hello_first');
  c.send({ type: 'hello', channelId: 'general', user: 'an' });
  assert.deepEqual(await c.next(), { type: 'error', error: 'bad_message' }, 'hello sai dạng (channelId không phải số) → bad_message');
  c.send({ type: 'hello', channelId: ch });
  assert.deepEqual(await c.next(), { type: 'error', error: 'bad_message' }, 'hello không có user (và kết nối chưa có ws.user) → bad_message');
  c.send({ type: 'hello', channelId: 999999, user: 'an' });
  assert.deepEqual(await c.next(), { type: 'error', error: 'channel_not_found' }, 'Kênh không tồn tại → channel_not_found');
  c.send({ type: 'chat', clientMsgId: 'x-2', text: 'vẫn chưa vào kênh' });
  assert.deepEqual(await c.next(), { type: 'error', error: 'hello_first' }, 'hello vào kênh không có thì vẫn chưa được chat');
  await c.hello(ch, 'an');
  c.send({ type: 'chat', clientMsgId: '', text: 'thiếu id' });
  assert.deepEqual(await c.next(), { type: 'error', error: 'bad_message' }, 'chat thiếu clientMsgId → bad_message');
  assert.equal(await countRows(ch), 0, 'Tin hỏng không được lưu');
});

test('attachChat: kết nối lại với lastSeenId → nhận bù tin bị lỡ theo thứ tự, rồi synced, rồi tin trực tiếp', async () => {
  const ch = await channel('ws3');
  const port = await startChat();
  const an = connect(port);
  await an.hello(ch, 'an');
  const ids = [];
  for (const t of ['m1', 'm2', 'm3']) ids.push((await sendChat(an, cid('ws3'), t)).ack.id);
  const binh = connect(port);
  await binh.opened;
  binh.send({ type: 'hello', channelId: ch, user: 'binh', lastSeenId: ids[0] });
  const missed = [await binh.next(), await binh.next()];
  assert.deepEqual(missed.map((m) => [m.type, m.text]), [['message', 'm2'], ['message', 'm3']], 'lastSeenId = id của m1 → bù m2, m3 theo thứ tự');
  assert.deepEqual(await binh.next(), { type: 'synced', lastId: ids[2] }, 'Sau tin bù → {type: "synced", lastId: id tin cuối}');
  const { ack } = await sendChat(an, cid('ws3'), 'm4');
  const live = await binh.next();
  assert.equal(live.id, ack.id, 'Sau synced nhận tin trực tiếp');
  assert.deepEqual(await binh.nothing(), [], 'Mỗi tin đúng một lần');
  const late = connect(port);
  await late.opened;
  late.send({ type: 'hello', channelId: ch, user: 'chi', lastSeenId: ack.id });
  assert.deepEqual(await late.next(), { type: 'synced', lastId: ack.id }, 'Không lỡ tin nào → synced ngay, lastId = lastSeenId');
});

test('attachChat: lỡ hơn 100 tin → gửi bù đủ, đọc theo trang tới hết', async () => {
  const ch = await channel('ws4');
  for (let i = 1; i <= 130; i++) await saveMessage(db, msg(ch, `b${i}`));
  const port = await startChat();
  const c = connect(port);
  const got = await c.hello(ch, 'an', 0);
  assert.equal(got.length, 130, `Phải bù đủ 130 tin (messagesAfter mỗi lần tối đa 100 → đọc tiếp tới hết), nhận ${got.length}`);
  assert.ok(got.every((m, i) => i === 0 || m.id > got[i - 1].id), 'id tăng dần');
  assert.equal(got[129].text, 'b130', 'Tin cuối là b130');
});

test('attachChat: kết nối đã có sẵn ws.user (N14 gán từ phiên đăng nhập) → bỏ qua user trong hello', async () => {
  const ch = await channel('ws5');
  const server = (await import('node:http')).createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => { ws.user = 'nguoi_that'; }); // chạy TRƯỚC listener của attachChat
  attachChat(wss, db);
  cleanups.push(() => wss.close());
  const port = await listen(server);
  const c = connect(port);
  await c.hello(ch, 'tu_khai_la_sep');
  const { echo } = await sendChat(c, cid('ws5'), 'Xin chào');
  assert.equal(echo.author, 'nguoi_that', 'author = ws.user có sẵn, KHÔNG phải user client tự khai trong hello');
});

/** Db bọc ngoài: câu ĐỌC BÙ đầu tiên (SQL có dạng `id > $n`) sau arm() bị giữ lại (trước hoặc sau khi chạy) để tạo đúng tình huống tranh chấp. */
function gatedDb(inner) {
  let gate = null;
  return {
    arm(mode) {
      let release;
      let reached;
      const released = new Promise((r) => { release = r; });
      const hit = new Promise((r) => { reached = r; });
      gate = { mode, released, reached };
      return { release, hit };
    },
    async query(sql, params) {
      const g = gate;
      if (!g || !/\bid\s*>\s*\$\d/i.test(sql)) return inner.query(sql, params);
      gate = null;
      if (g.mode === 'before') { g.reached(); await g.released; return inner.query(sql, params); }
      const result = await inner.query(sql, params);
      g.reached();
      await g.released;
      return result;
    },
  };
}

async function raceScenario(prefix, mode) {
  const ch = await channel(prefix);
  const gdb = gatedDb(db);
  const port = await startChat(gdb);
  const an = connect(port);
  await an.hello(ch, 'an');
  const ids = [];
  for (const t of ['r1', 'r2']) ids.push((await sendChat(an, cid(prefix), t)).ack.id);
  const binh = connect(port);
  await binh.opened;
  const { release, hit } = gdb.arm(mode);
  binh.send({ type: 'hello', channelId: ch, user: 'binh', lastSeenId: 0 });
  await hit; // Binh đang đọc bù
  const { ack } = await sendChat(an, cid(prefix), 'r3'); // tin mới đúng lúc đó
  release();
  const got = await binh.untilSynced();
  return { got, ids: [...ids, ack.id], binh };
}

test('attachChat: tin mới tới TRONG lúc đang đọc bù → không bị hở (gap)', async () => {
  const { got, ids, binh } = await raceScenario('race-gap', 'after');
  assert.deepEqual(got.map((m) => m.text), ['r1', 'r2', 'r3'],
    'Câu SELECT bù đã chạy xong trước khi r3 được lưu → r3 phải tới qua đường trực tiếp, trước synced, sau r1, r2');
  assert.deepEqual(got.map((m) => m.id), ids, 'Đúng thứ tự id');
  assert.deepEqual(await binh.nothing(), [], 'Không có tin thừa sau synced');
});

test('attachChat: tin vừa lưu vừa nằm trong kết quả đọc bù → không bị trùng', async () => {
  const { got, ids, binh } = await raceScenario('race-dup', 'before');
  assert.deepEqual(got.map((m) => m.text), ['r1', 'r2', 'r3'],
    'r3 vừa có trong kết quả SELECT bù vừa được phát → client chỉ được nhận r3 MỘT lần');
  assert.deepEqual(got.map((m) => m.id), ids, 'Đúng thứ tự id');
  assert.deepEqual(await binh.nothing(), [], 'Không có tin thừa sau synced');
});

// ---------- withBroadcast (REST của N11 + WebSocket) ----------

test('withBroadcast: hàm đọc giữ nguyên; addMessage lưu xong rồi mới phát, trả đúng tin', async () => {
  const ch = await channel('wb');
  const sent = [];
  const live = withBroadcast(store, { broadcast: (m) => sent.push(m) });
  assert.deepEqual(await live.getChannel(ch), await store.getChannel(ch), 'getChannel chuyển thẳng cho store gốc');
  assert.deepEqual(await live.listChannels(), await store.listChannels(), 'listChannels chuyển thẳng cho store gốc');
  assert.equal(await live.createChannel(`wb-moi-${++seq}`).then((c) => typeof c.id), 'number', 'createChannel chuyển thẳng cho store gốc');
  const m = await live.addMessage({ channelId: ch, author: 'Chi', text: 'qua REST' });
  assert.equal(await countRows(ch), 1, 'addMessage vẫn lưu vào DB');
  assert.deepEqual(sent, [{ ...m, clientMsgId: null }], 'Phát đúng một lần, tin vừa lưu + clientMsgId: null');
  assert.deepEqual(await live.listMessages(ch, { limit: 5 }), await store.listMessages(ch, { limit: 5 }), 'listMessages chuyển thẳng cho store gốc');
  await assert.rejects(live.addMessage({ channelId: 999999, author: 'Chi', text: 'x' }), 'Lưu lỗi (kênh không có) → lỗi ném ra');
  assert.equal(sent.length, 1, 'Lưu lỗi → không phát');
});

test('withBroadcast: POST /channels/:id/messages (REST N11) → tới WebSocket ngay; GET lịch sử đúng dạng N11', async () => {
  const ch = await channel('rest');
  const port = await startChat();
  const ws = connect(port);
  await ws.hello(ch, 'an');
  await sendChat(ws, cid('rest'), 'từ WebSocket');
  const base = `http://127.0.0.1:${port}`;
  const posted = await fetch(`${base}/channels/${ch}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: 'binh', text: 'từ REST' }),
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(posted.status, 201, 'POST tin qua REST → 201 (app N11)');
  const body = await posted.json();
  assert.deepEqual(await ws.next(), { type: 'message', ...body, clientMsgId: null }, 'Kết nối WebSocket trong kênh nhận ngay tin REST, clientMsgId: null');
  const page = await (await fetch(`${base}/channels/${ch}/messages?limit=1`, { signal: AbortSignal.timeout(2000) })).json();
  assert.deepEqual(page.items.map((m) => m.text), ['từ REST'], 'GET lịch sử: { items } mới → cũ như N11');
  assert.equal(typeof page.nextBefore, 'number', 'Còn tin cũ hơn (tin WebSocket) → nextBefore là số');
  const bad = await fetch(`${base}/channels/${ch}/messages?limit=500`, { signal: AbortSignal.timeout(2000) });
  assert.equal(bad.status, 400, 'limit sai → 400');
  assert.equal((await bad.json()).error, 'validation_failed', 'Lỗi 400 dạng N11: { error: "validation_failed", in, details }');
});
