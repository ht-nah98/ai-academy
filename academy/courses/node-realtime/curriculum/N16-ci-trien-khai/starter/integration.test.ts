// Test tích hợp của TeamPulse (N15) — CÓ SẴN ở bài này, thêm 1 test cho /health và /ready (N16).
// Chạy: npm run test:mine — cũng là bước test của CI (.github/workflows/ci.yml).
// Test /health, /ready cần health.ts (Bước 3) xong: trước đó startServer ném "TODO: registerHealthRoutes".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { prepareDb } from './server.ts';
import { api, connectWs, loginAs, startTestApp, waitForMessage } from './testkit.ts';

// Một DB cho cả file (khởi động PGlite ~1 giây, migration 001→004 một lần); mỗi test tự reset qua startTestApp.
const db = new PGlite();
before(async () => {
  await prepareDb(db);
});
after(async () => {
  await db.close();
});

test('POST tạo tin, GET đọc lại, author lấy từ phiên đăng nhập', async (t) => {
  const { baseUrl } = await startTestApp(t, db);
  const an = await loginAs(baseUrl, 'an_le');
  const first = await api(baseUrl, '/channels/1/messages', { method: 'POST', cookie: an, body: { author: 'giam_doc', text: 'Chào cả nhóm' } });
  const second = await api(baseUrl, '/channels/1/messages', { method: 'POST', cookie: an, body: { text: 'Có ai không?' } });
  const list = await api(baseUrl, '/channels/1/messages', { cookie: an });
  assert.equal(first.status, 201, 'POST tin mới phải trả 201');
  assert.equal(first.body.id, 1, 'DB vừa reset nên tin đầu tiên có id 1');
  assert.equal(first.body.author, 'an_le', 'author là username của phiên, không phải "giam_doc" trong body');
  assert.equal(second.body.id, 2, 'tin thứ hai có id 2');
  assert.equal(list.status, 200, 'GET phải trả 200');
  assert.deepEqual(list.body.items.map((m: { text: string }) => m.text), ['Có ai không?', 'Chào cả nhóm'], 'GET trả tin mới nhất trước (N11)');
});

test('tin gửi qua WebSocket được lưu vào DB (GET thấy)', async (t) => {
  const { baseUrl, wsUrl } = await startTestApp(t, db);
  const an = await loginAs(baseUrl, 'an_le');
  const { ws } = await connectWs(t, wsUrl, { cookie: an });

  const ack = waitForMessage(ws, (m) => m.type === 'ack' && m.clientMsgId === 'an-1');
  ws.send(JSON.stringify({ type: 'chat', clientMsgId: 'an-1', text: 'Gửi qua WebSocket' }));
  const { id } = await ack;
  const list = await api(baseUrl, '/channels/1/messages', { cookie: an });

  assert.equal(list.status, 200, 'GET phải trả 200');
  assert.equal(list.body.items.length, 1, 'DB phải có đúng một tin sau khi gửi qua WebSocket');
  const [saved] = list.body.items;
  assert.equal(saved.id, id, 'id trong DB trùng id trong ack');
  assert.equal(saved.text, 'Gửi qua WebSocket', 'text đã lưu đúng');
  assert.equal(saved.author, 'an_le', 'author là người đăng nhập');
});

test('tin POST qua REST tới client WebSocket đang mở', async (t) => {
  const { baseUrl, wsUrl } = await startTestApp(t, db);
  const an = await loginAs(baseUrl, 'an_le');
  const binh = await loginAs(baseUrl, 'binh_tran');
  const { ws } = await connectWs(t, wsUrl, { cookie: binh });

  const live = waitForMessage(ws, (m) => m.type === 'message');
  const posted = await api(baseUrl, '/channels/1/messages', { method: 'POST', cookie: an, body: { text: 'Họp lúc 3 giờ' } });
  const msg = await live;

  assert.equal(posted.status, 201, 'POST trả 201');
  assert.equal(msg.id, posted.body.id, 'Binh nhận đúng id của tin vừa POST');
  assert.equal(msg.text, 'Họp lúc 3 giờ', 'Binh nhận đúng text');
  assert.equal(msg.author, 'an_le', 'Binh thấy tin của An');
});

test('kết nối lại với lastSeenId chỉ nhận tin còn thiếu', async (t) => {
  const { baseUrl, wsUrl } = await startTestApp(t, db);
  const an = await loginAs(baseUrl, 'an_le');
  for (const text of ['một', 'hai', 'ba']) {
    await api(baseUrl, '/channels/1/messages', { method: 'POST', cookie: an, body: { text } });
  }
  const chi = await loginAs(baseUrl, 'chi_pham');

  const { missed, synced } = await connectWs(t, wsUrl, { cookie: chi, lastSeenId: 2 });

  assert.deepEqual(missed.map((m) => m.id), [3], 'chỉ nhận bù đúng tin id 3');
  assert.equal(missed[0]?.text, 'ba', 'tin bù là tin "ba"');
  assert.equal(synced.lastId, 3, 'synced.lastId là id tin cuối');
});

test('/health và /ready không cần đăng nhập; đang tắt thì /ready 503', async (t) => {
  const { baseUrl, app } = await startTestApp(t, db);
  const health = await api(baseUrl, '/health');
  const ready = await api(baseUrl, '/ready');
  assert.deepEqual([health.status, health.body], [200, { status: 'ok' }], '/health 200 không cần cookie');
  assert.deepEqual([ready.status, ready.body], [200, { status: 'ready' }], '/ready 200 khi DB trả lời');
  app.beginShutdown();
  const stopping = await api(baseUrl, '/ready');
  assert.deepEqual([stopping.status, stopping.body], [503, { status: 'shutting_down' }], 'sau beginShutdown, /ready 503');
});
