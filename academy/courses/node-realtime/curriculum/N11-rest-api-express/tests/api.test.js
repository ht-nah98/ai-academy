// Test tự chấm cho bài N11. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// App chạy thật trên 127.0.0.1 cổng 0 (cổng ngẫu nhiên), gọi bằng fetch, đóng trong after().
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { z } from 'zod';

const load = (file) => import(pathToFileURL(join(process.cwd(), file)).href);
const mod = await load('app.ts');
const { ChannelBody, MessageBody, ListQuery, IdParams, toValidationError, validate, errorHandler, createApp, HttpError } = mod;
const { createMemoryStore } = await load('store.ts');

const servers = [];
after(() => { for (const s of servers) s.close(); });

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function call(base, method, path, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!('content-type' in init.headers)) init.headers['content-type'] = 'application/json';
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: res.status, headers: res.headers, json, text };
}

const T0 = Date.UTC(2026, 9, 20, 8, 0);

// ---------- schemas ----------

test('schemas: ChannelBody, MessageBody, ListQuery, IdParams kiểm tra và chuẩn hoá', () => {
  assert.deepEqual(ChannelBody.parse({ name: '  dev-ops ', x: 1 }), { name: 'dev-ops' }, 'ChannelBody: trim, bỏ khóa thừa');
  for (const name of ['a', 'Dev', 'phòng họp', 'a_b', 'x'.repeat(33), 42]) {
    assert.equal(ChannelBody.safeParse({ name }).success, false, `ChannelBody phải từ chối name = ${JSON.stringify(name)}`);
  }
  assert.equal(ChannelBody.safeParse({ name: 'x'.repeat(32) }).success, true, 'name dài 32 vẫn hợp lệ');
  assert.deepEqual(MessageBody.parse({ author: ' An ', text: ' Chào ', from: 'Giả' }), { author: 'An', text: 'Chào' },
    'MessageBody: trim, bỏ khóa thừa');
  for (const bad of [{ author: '', text: 'a' }, { author: 'a'.repeat(33), text: 'a' }, { author: 'An', text: '   ' },
    { author: 'An', text: 'x'.repeat(2001) }, { author: 'An' }, { author: 1, text: 'a' }]) {
    assert.equal(MessageBody.safeParse(bad).success, false, `MessageBody phải từ chối ${JSON.stringify(bad).slice(0, 50)}`);
  }
  assert.equal(MessageBody.safeParse({ author: 'a'.repeat(32), text: 'x'.repeat(2000) }).success, true, 'author 32, text 2000 vẫn hợp lệ');
  assert.deepEqual(ListQuery.parse({}), { limit: 20 }, 'ListQuery: limit mặc định 20, không có before');
  assert.deepEqual(ListQuery.parse({ limit: '5', before: '42' }), { limit: 5, before: 42 }, 'ListQuery: chuỗi query → số');
  for (const q of [{ limit: '0' }, { limit: '101' }, { limit: '2.5' }, { limit: 'abc' }, { before: '0' }, { before: '-3' }]) {
    assert.equal(ListQuery.safeParse(q).success, false, `ListQuery phải từ chối ${JSON.stringify(q)}`);
  }
  assert.deepEqual(IdParams.parse({ id: '7' }), { id: 7 }, 'IdParams: "7" → 7');
  for (const id of ['0', '-1', 'abc', '1.5']) {
    assert.equal(IdParams.safeParse({ id }).success, false, `IdParams phải từ chối id = "${id}"`);
  }
});

// ---------- toValidationError ----------

test('toValidationError: mỗi issue → { field, message }, path rỗng → "*"', () => {
  const schema = z.object({ author: z.string().min(1), meta: z.object({ tag: z.string() }) });
  const err = schema.safeParse({ author: '', meta: { tag: 5 } }).error;
  const body = toValidationError(err, 'body');
  assert.equal(body.error, 'validation_failed', 'error = "validation_failed"');
  assert.equal(body.in, 'body', 'in = source truyền vào');
  assert.deepEqual(body.details.map((d) => d.field), ['author', 'meta.tag'], 'field = path nối bằng dấu chấm, đúng thứ tự issues');
  assert.deepEqual(body.details.map((d) => d.message), err.issues.map((i) => i.message), 'message lấy từ issue.message');
  const whole = toValidationError(schema.safeParse(null).error, 'query');
  assert.deepEqual(whole.details.map((d) => d.field), ['*'], 'Cả dữ liệu sai (path rỗng) → field "*"');
  assert.equal(whole.in, 'query');
});

// ---------- validate ----------

test('validate: hợp lệ → dữ liệu đã chuẩn hoá; sai → ném HttpError 400', () => {
  assert.deepEqual(validate(ListQuery, { limit: '3' }, 'query'), { limit: 3 }, 'validate trả dữ liệu sau parse (đã đổi kiểu, có mặc định)');
  let thrown;
  try { validate(MessageBody, { author: 'An' }, 'body'); } catch (e) { thrown = e; }
  assert.ok(thrown instanceof HttpError, 'Dữ liệu sai phải ném HttpError');
  assert.equal(thrown.status, 400, 'status 400');
  assert.deepEqual(thrown.body.error, 'validation_failed');
  assert.deepEqual(thrown.body.details.map((d) => d.field), ['text'], 'details chỉ ra trường text bị thiếu');
});

// ---------- errorHandler ----------

test('errorHandler: HttpError, JSON hỏng, body quá lớn, lỗi lạ → 500 không lộ chi tiết', async () => {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.get('/teapot', () => { throw new HttpError(418, { error: 'teapot' }); });
  app.get('/boom', async () => { throw new Error('mật khẩu DB là hunter2'); });
  app.post('/echo', (req, res) => { res.json(req.body); });
  app.use(errorHandler);
  const base = await listen(app);
  const origError = console.error;
  console.error = () => {};
  try {
    let r = await call(base, 'GET', '/teapot');
    assert.deepEqual([r.status, r.json], [418, { error: 'teapot' }], 'HttpError → đúng status và body');
    r = await call(base, 'POST', '/echo', '{"a":');
    assert.deepEqual([r.status, r.json], [400, { error: 'bad_json' }], 'JSON hỏng → 400 bad_json');
    r = await call(base, 'POST', '/echo', { big: 'x'.repeat(2000) });
    assert.deepEqual([r.status, r.json], [413, { error: 'payload_too_large' }], 'Body quá giới hạn → 413 payload_too_large');
    r = await call(base, 'GET', '/boom');
    assert.deepEqual([r.status, r.json], [500, { error: 'internal' }], 'Lỗi lạ (kể cả trong handler async) → 500 { error: "internal" }');
    assert.doesNotMatch(r.text, /hunter2|at /, 'Không gửi message hay stack của lỗi cho client');
  } finally {
    console.error = origError;
  }
});

// ---------- createApp ----------

async function freshApp(store = createMemoryStore({ now: () => T0 })) {
  return { base: await listen(createApp(store)), store };
}

test('createApp: /health, X-Request-Id, 404 not_found', async () => {
  const { base } = await freshApp();
  let r = await call(base, 'GET', '/health');
  assert.deepEqual([r.status, r.json], [200, { ok: true }], 'GET /health → 200 { ok: true }');
  assert.match(r.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/, 'Mọi response có header X-Request-Id (randomUUID)');
  r = await call(base, 'GET', '/health', undefined, { 'x-request-id': 'req-abc' });
  assert.equal(r.headers.get('x-request-id'), 'req-abc', 'Request có sẵn x-request-id → dùng lại giá trị đó');
  r = await call(base, 'GET', '/khong-co');
  assert.deepEqual([r.status, r.json], [404, { error: 'not_found' }], 'Đường dẫn lạ → 404 { error: "not_found" }');
  assert.ok(r.headers.get('x-request-id'), 'Response 404 cũng có X-Request-Id');
  r = await call(base, 'DELETE', '/channels');
  assert.equal(r.status, 404, 'Method chưa hỗ trợ → 404 not_found');
});

test('createApp: tạo và đọc kênh — 201 + Location, 409, 400 có chi tiết, 404', async () => {
  const { base } = await freshApp();
  let r = await call(base, 'POST', '/channels', { name: ' general ' });
  assert.equal(r.status, 201, 'POST /channels hợp lệ → 201');
  assert.deepEqual(r.json, { id: 1, name: 'general', createdAt: new Date(T0).toISOString() }, 'Body là kênh vừa tạo (tên đã trim)');
  assert.equal(r.headers.get('location'), '/channels/1', 'Header Location: /channels/<id>');
  r = await call(base, 'POST', '/channels', { name: 'general' });
  assert.deepEqual([r.status, r.json], [409, { error: 'channel_exists' }], 'Trùng tên → 409 channel_exists');
  r = await call(base, 'POST', '/channels', { name: 'Phòng Họp!' });
  assert.equal(r.status, 400, 'Tên sai → 400');
  assert.equal(r.json?.error, 'validation_failed');
  assert.equal(r.json?.in, 'body');
  assert.deepEqual(r.json?.details?.map((d) => d.field), ['name'], 'details chỉ ra trường name');
  r = await call(base, 'POST', '/channels', 'name=dev', { 'content-type': 'text/plain' });
  assert.equal(r.status, 400, 'Body không phải JSON (content-type khác) → 400 validation_failed');
  assert.deepEqual(r.json?.details?.map((d) => d.field), ['*'], 'Cả body sai → field "*"');
  r = await call(base, 'POST', '/channels', '{"name":');
  assert.deepEqual([r.status, r.json], [400, { error: 'bad_json' }], 'JSON hỏng → 400 bad_json');
  r = await call(base, 'GET', '/channels');
  assert.deepEqual([r.status, r.json?.items?.map((c) => c.name)], [200, ['general']], 'GET /channels → { items: [...] }');
  r = await call(base, 'GET', '/channels/1');
  assert.deepEqual([r.status, r.json?.name], [200, 'general'], 'GET /channels/1 → kênh');
  r = await call(base, 'GET', '/channels/99');
  assert.deepEqual([r.status, r.json], [404, { error: 'channel_not_found' }], 'Kênh không có → 404 channel_not_found');
  r = await call(base, 'GET', '/channels/abc');
  assert.equal(r.status, 400, 'id không phải số nguyên dương → 400');
  assert.equal(r.json?.in, 'params', 'Lỗi id nằm ở params');
});

test('createApp: tin nhắn — 201, 400 từng trường, phân trang cursor bằng before/nextBefore', async () => {
  const { base, store } = await freshApp();
  await call(base, 'POST', '/channels', { name: 'general' });
  await call(base, 'POST', '/channels', { name: 'dev' });
  let r = await call(base, 'POST', '/channels/1/messages', { author: ' An ', text: ' Tin 1 ', id: 999 });
  assert.equal(r.status, 201, 'POST tin hợp lệ → 201');
  assert.deepEqual(r.json, { id: 1, channelId: 1, author: 'An', text: 'Tin 1', createdAt: new Date(T0).toISOString() },
    'Body là tin vừa lưu (đã trim; id do server cấp, không lấy từ client)');
  r = await call(base, 'POST', '/channels/1/messages', { author: '', text: 42 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json?.details?.map((d) => d.field), ['author', 'text'], 'Báo lỗi CẢ HAI trường, không dừng ở lỗi đầu');
  assert.ok(r.json.details.every((d) => typeof d.message === 'string' && d.message.length > 0), 'Mỗi lỗi có message');
  r = await call(base, 'POST', '/channels/9/messages', { author: 'An', text: 'x' });
  assert.deepEqual([r.status, r.json], [404, { error: 'channel_not_found' }], 'Gửi vào kênh không có → 404');
  for (let i = 2; i <= 5; i++) await store.addMessage({ channelId: 1, author: 'Binh', text: `Tin ${i}` });
  await store.addMessage({ channelId: 2, author: 'Chi', text: 'Tin kênh dev' });
  r = await call(base, 'GET', '/channels/1/messages?limit=2');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json?.items?.map((m) => m.text), ['Tin 5', 'Tin 4'], 'Trang 1: 2 tin mới nhất trước');
  assert.equal(r.json?.nextBefore, 4, 'Còn trang sau → nextBefore = id tin cuối trang');
  r = await call(base, 'GET', `/channels/1/messages?limit=2&before=${r.json.nextBefore}`);
  assert.deepEqual(r.json?.items?.map((m) => m.text), ['Tin 3', 'Tin 2'], 'Trang 2: tiếp theo before');
  assert.equal(r.json?.nextBefore, 2);
  r = await call(base, 'GET', `/channels/1/messages?limit=2&before=${r.json.nextBefore}`);
  assert.deepEqual([r.json?.items?.map((m) => m.text), r.json?.nextBefore], [['Tin 1'], null], 'Trang cuối: nextBefore = null');
  r = await call(base, 'GET', '/channels/1/messages?limit=5');
  assert.deepEqual([r.json?.items?.length, r.json?.nextBefore], [5, null], 'Vừa đủ limit, không còn tin → nextBefore null (lấy thừa 1 để biết)');
  r = await call(base, 'GET', '/channels/1/messages');
  assert.equal(r.json?.items?.length, 5, 'Không có limit → mặc định 20');
  r = await call(base, 'GET', '/channels/1/messages?limit=500');
  assert.deepEqual([r.status, r.json?.in, r.json?.details?.[0]?.field], [400, 'query', 'limit'], 'limit > 100 → 400 ở query.limit');
  r = await call(base, 'GET', '/channels/7/messages');
  assert.equal(r.status, 404, 'Đọc tin kênh không có → 404');
});

test('createApp: lỗi của store (async) → 500 internal, server vẫn chạy', async () => {
  const broken = createMemoryStore();
  broken.listChannels = async () => { throw new Error('connection refused 10.0.0.5:5432'); };
  const { base } = await freshApp(broken);
  const origError = console.error;
  console.error = () => {};
  try {
    const r = await call(base, 'GET', '/channels');
    assert.deepEqual([r.status, r.json], [500, { error: 'internal' }], 'Store ném lỗi → 500 { error: "internal" } (errorHandler đặt cuối)');
    assert.doesNotMatch(r.text, /10\.0\.0\.5/, 'Không lộ chi tiết lỗi nội bộ');
  } finally {
    console.error = origError;
  }
  const ok = await call(base, 'GET', '/health');
  assert.equal(ok.status, 200, 'Sau lỗi, server vẫn trả lời request khác');
});
