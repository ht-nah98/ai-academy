// Test tự chấm cho bài N08. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Không cần Redis: dùng broker trong bộ nhớ và client Redis giả. Server listen cổng 0 trên 127.0.0.1.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

const mod = await import(pathToFileURL(join(process.cwd(), 'scale.js')).href);
const { createMemoryBroker, createRedisBroker, createChatNode, CHANNEL } = mod;

const cleanups = [];
after(() => {
  for (const fn of cleanups.reverse()) {
    try { fn(); } catch { /* dọn tiếp */ }
  }
});

const tick = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- createMemoryBroker ----------

test('createMemoryBroker: publish trả số subscriber, giao tin bất đồng bộ', async () => {
  const b = createMemoryBroker();
  const got = [];
  await b.subscribe('kenh-1', (m) => got.push(['h1', m]));
  await b.subscribe('kenh-1', (m) => got.push(['h2', m]));
  await b.subscribe('kenh-2', (m) => got.push(['khac', m]));
  const n = await b.publish('kenh-1', 'xin chào');
  assert.equal(n, 2, 'kenh-1 có 2 handler → publish resolve 2');
  assert.deepEqual(got, [], 'Handler KHÔNG được gọi đồng bộ trong publish (tin "đi qua mạng")');
  await tick();
  await tick();
  assert.deepEqual(got, [['h1', 'xin chào'], ['h2', 'xin chào']], 'Mỗi handler của kenh-1 nhận đúng chuỗi một lần; kenh-2 không nhận');
  assert.equal(await b.publish('khong-ai-nghe', 'x'), 0, 'Kênh không ai subscribe → 0');
});

test('createMemoryBroker: chỉ nhận chuỗi; unsubscribe gỡ đúng một handler', async () => {
  const b = createMemoryBroker();
  await assert.rejects(b.publish('k', { text: 'object' }), TypeError, 'publish object → reject TypeError (như Redis chỉ chở chuỗi)');
  await assert.rejects(b.publish('k', 42), TypeError, 'publish số → reject TypeError');
  const got = [];
  const off1 = await b.subscribe('k', (m) => got.push(`1:${m}`));
  await b.subscribe('k', (m) => got.push(`2:${m}`));
  assert.equal(typeof off1, 'function', 'subscribe phải resolve bằng hàm unsubscribe');
  await off1();
  assert.equal(await b.publish('k', 'sau'), 1, 'Sau unsubscribe còn 1 handler');
  await tick();
  await tick();
  assert.deepEqual(got, ['2:sau'], 'Chỉ handler đã gỡ thôi nhận; handler còn lại vẫn nhận');
});

// ---------- createRedisBroker ----------

/** Client Redis giả theo API của thư viện `redis` v5. */
function fakeRedis() {
  const listeners = new Map(); // channel → Set(listener)
  const log = [];
  const sub = {
    async subscribe(channel, listener) {
      log.push(['sub.subscribe', channel]);
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(listener);
    },
    async unsubscribe(channel, listener) {
      log.push(['sub.unsubscribe', channel]);
      listeners.get(channel)?.delete(listener);
    },
    async publish() {
      throw new Error("ERR Can't execute 'publish': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context");
    },
  };
  const pub = {
    async publish(channel, message) {
      log.push(['pub.publish', channel, message]);
      const set = listeners.get(channel) ?? new Set();
      setImmediate(() => { for (const l of set) l(message, channel); });
      return set.size;
    },
    async subscribe() { throw new Error('pub chỉ dùng để publish'); },
  };
  return { pub, sub, log, listeners };
}

test('createRedisBroker: publish qua pub, subscribe qua sub, handler nhận message', async () => {
  const r = fakeRedis();
  const b = createRedisBroker({ pub: r.pub, sub: r.sub });
  const got = [];
  await b.subscribe(CHANNEL, (m) => got.push(m));
  assert.deepEqual(r.log[0], ['sub.subscribe', CHANNEL], 'subscribe phải gọi sub.subscribe(channel, listener)');
  const n = await b.publish(CHANNEL, '{"x":1}');
  assert.equal(n, 1, 'publish trả kết quả của pub.publish (số subscriber)');
  assert.deepEqual(r.log[1], ['pub.publish', CHANNEL, '{"x":1}'], 'publish phải gọi pub.publish, KHÔNG dùng sub (subscriber mode)');
  await tick();
  assert.deepEqual(got, ['{"x":1}'], 'handler(message) nhận đúng chuỗi Redis gửi tới');
  await assert.rejects(b.publish(CHANNEL, { x: 1 }), TypeError, 'Không phải chuỗi → TypeError');
  assert.equal(r.log.filter((e) => e[0] === 'pub.publish').length, 1, 'Tin không phải chuỗi không được gửi lên Redis');
});

test('createRedisBroker: unsubscribe gỡ đúng listener đã đăng ký', async () => {
  const r = fakeRedis();
  const b = createRedisBroker({ pub: r.pub, sub: r.sub });
  const got = [];
  const off = await b.subscribe('k', (m) => got.push(`a:${m}`));
  await b.subscribe('k', (m) => got.push(`b:${m}`));
  await off();
  assert.deepEqual(r.log.at(-1), ['sub.unsubscribe', 'k'], 'unsubscribe phải gọi sub.unsubscribe(channel, listener)');
  assert.equal(r.listeners.get('k').size, 1, 'Chỉ gỡ listener của lần subscribe đó, listener khác còn nguyên');
  await b.publish('k', 'hi');
  await tick();
  assert.deepEqual(got, ['b:hi'], 'Handler đã gỡ không nhận nữa');
});

// ---------- createChatNode ----------

async function startNode(broker, nodeId) {
  const server = await createChatNode({ broker, nodeId });
  assert.ok(server instanceof http.Server, 'createChatNode phải resolve http.Server');
  assert.equal(server.listening, false, 'createChatNode chỉ tạo server, KHÔNG tự listen()');
  assert.deepEqual(server.stats, { published: 0, received: 0, sent: 0 }, 'server.stats = { published: 0, received: 0, sent: 0 } lúc đầu');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => { server.closeAllConnections?.(); server.close(); });
  return server;
}

function client(server, name) {
  const q = name === undefined ? '' : `?name=${encodeURIComponent(name)}`;
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws${q}`);
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
    opened: () => new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }),
    next(ms = 2000) {
      if (inbox.length) return Promise.resolve(inbox.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Hết ${ms} ms mà "${name}" không nhận tin nào`)), ms);
        waiters.push((m) => { clearTimeout(t); resolve(m); });
      });
    },
    async nothing(ms = 150) {
      await sleep(ms);
      return inbox.splice(0);
    },
  };
}

test('createChatNode: client ở node A và node B thấy tin của nhau qua broker', async () => {
  const broker = createMemoryBroker();
  const a = await startNode(broker, 'A');
  const b = await startNode(broker, 'B');
  const an = client(a, 'An');
  const binh = client(b, 'Binh');
  await an.opened();
  await binh.opened();
  an.ws.send(JSON.stringify({ type: 'chat', text: '  Deploy lúc 10h ' }));
  const mA = await an.next();
  const mB = await binh.next();
  for (const [who, m, via] of [['An (node A)', mA, 'A'], ['Binh (node B)', mB, 'B']]) {
    assert.equal(m.type, 'chat', `${who} phải nhận {type: "chat"}`);
    assert.equal(m.from, 'An', 'from = tên trong ?name=');
    assert.equal(m.text, 'Deploy lúc 10h', 'text đã trim');
    assert.equal(m.origin, 'A', 'origin = node nhận tin từ người gửi');
    assert.equal(m.via, via, `via = node đang giao tin cho client (${via})`);
    assert.ok(!Number.isNaN(Date.parse(m.ts)), 'ts là ISO string');
  }
  assert.equal(mA.ts, mB.ts, 'Hai node giao cùng một tin (cùng ts)');
  assert.deepEqual(await an.nothing(), [], 'Người gửi nhận đúng MỘT lần (chỉ qua broker, không gửi thẳng thêm)');
  assert.deepEqual(a.stats, { published: 1, received: 1, sent: 1 }, 'Node A: publish 1, nhận 1 từ broker, gửi 1 client');
  assert.deepEqual(b.stats, { published: 0, received: 1, sent: 1 }, 'Node B: publish 0, nhận 1, gửi 1 client');
});

test('createChatNode: tin sai → bad_message, không publish; thiếu tên → đóng 1008', async () => {
  const broker = createMemoryBroker();
  const a = await startNode(broker, 'A');
  const an = client(a, 'An');
  await an.opened();
  for (const bad of ['{hỏng', JSON.stringify({ type: 'chat', text: '   ' }), JSON.stringify({ type: 'chat', text: 5 }),
    JSON.stringify({ type: 'join' }), JSON.stringify({ type: 'chat', text: 'x'.repeat(501) })]) {
    an.ws.send(bad);
    assert.deepEqual(await an.next(), { type: 'error', error: 'bad_message' }, `${bad.slice(0, 30)} → bad_message`);
  }
  assert.equal(a.stats.published, 0, 'Tin sai không được publish');
  const anon = client(a, '  ');
  const code = await new Promise((r) => anon.ws.once('close', (c) => r(c)));
  assert.equal(code, 1008, 'Thiếu tên (?name= rỗng sau trim) → đóng code 1008');
  const r = await fetch(`http://127.0.0.1:${a.address().port}/`, { signal: AbortSignal.timeout(2000) });
  assert.equal(r.status, 404, 'Request HTTP thường → 404');
});

test('createChatNode: tin hỏng trên kênh bị bỏ qua; đóng server thì unsubscribe', async () => {
  const broker = createMemoryBroker();
  const a = await startNode(broker, 'A');
  const b = await startNode(broker, 'B');
  const binh = client(b, 'Binh');
  await binh.opened();
  assert.equal(await broker.publish(CHANNEL, '{hỏng'), 2, 'Cả 2 node phải subscribe CHANNEL');
  await tick();
  assert.equal(b.stats.received, 1, 'Tin hỏng vẫn được đếm là đã nhận');
  assert.equal(b.stats.sent, 0, 'Tin hỏng không được gửi cho client');
  await new Promise((r) => a.close(r));
  await sleep(20);
  assert.equal(await broker.publish(CHANNEL, JSON.stringify({ origin: 'X', from: 'Bot', text: 'ping', ts: new Date().toISOString() })), 1,
    'Node A đã đóng → unsubscribe, kênh chỉ còn node B');
  assert.equal((await binh.next()).text, 'ping', 'Node B vẫn sống sau tin hỏng, nhận tin kế tiếp');
});

test('createChatNode: fan-out 2 node × 3 client — mỗi tin publish 1 lần, gửi 6 lần', async () => {
  const broker = createMemoryBroker();
  const nodes = [await startNode(broker, 'A'), await startNode(broker, 'B')];
  const cs = [];
  for (const n of nodes) for (let i = 0; i < 3; i += 1) cs.push(client(n, `u${cs.length}`));
  await Promise.all(cs.map((c) => c.opened()));
  cs[0].ws.send(JSON.stringify({ type: 'chat', text: 'một' }));
  cs[4].ws.send(JSON.stringify({ type: 'chat', text: 'hai' }));
  for (const c of cs) {
    const texts = [(await c.next()).text, (await c.next()).text].sort();
    assert.deepEqual(texts, ['hai', 'một'], 'Mỗi client trên cả hai node nhận đủ 2 tin');
  }
  const total = nodes.reduce((s, n) => ({ p: s.p + n.stats.published, r: s.r + n.stats.received, s: s.s + n.stats.sent }), { p: 0, r: 0, s: 0 });
  assert.deepEqual(total, { p: 2, r: 4, s: 12 }, '2 tin: publish 2, broker giao 2 × 2 node = 4, ws.send 2 × 6 client = 12');
});
