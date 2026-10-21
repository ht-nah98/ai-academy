// Test tự chấm cho bài N09 — phần testkit.js. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Server listen cổng 0 trên 127.0.0.1; mọi kết nối và server được đóng trong after().
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const mod = await import(pathToFileURL(join(process.cwd(), 'testkit.js')).href);
const { waitForMessage, percentile, runLoadTest } = mod;
const { createChatServer } = await import(new URL('./fixtures/ok.js', import.meta.url).href);

const cleanups = [];
after(() => {
  for (const fn of cleanups.reverse()) {
    try { fn(); } catch { /* dọn tiếp */ }
  }
});

/** Server ws thô: trả về { url, peer() } — peer() là kết nối phía server của client mới nhất. */
async function rawServer() {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((r) => wss.once('listening', r));
  const peers = [];
  wss.on('connection', (ws) => peers.push(ws));
  cleanups.push(() => { for (const p of peers) p.terminate(); wss.close(); });
  const url = `ws://127.0.0.1:${wss.address().port}`;
  async function client() {
    const ws = new WebSocket(url);
    cleanups.push(() => ws.terminate());
    await new Promise((r) => ws.once('open', r));
    while (peers.length === 0 || peers.at(-1).readyState !== 1) await new Promise((r) => setTimeout(r, 5));
    return { ws, peer: peers.at(-1) };
  }
  return { client };
}

// ---------- waitForMessage ----------

test('waitForMessage: resolve tin JSON đầu tiên thoả predicate, bỏ qua tin không phải JSON', async () => {
  const { client } = await rawServer();
  const { ws, peer } = await client();
  const p = waitForMessage(ws, (m) => m.type === 'chat');
  peer.send('không phải json');
  peer.send(JSON.stringify({ type: 'welcome' }));
  peer.send(JSON.stringify({ type: 'chat', text: 'đây rồi' }));
  assert.deepEqual(await p, { type: 'chat', text: 'đây rồi' }, 'Phải trả object của tin đầu tiên thoả predicate');
  const any = waitForMessage(ws);
  peer.send(JSON.stringify({ n: 1 }));
  assert.deepEqual(await any, { n: 1 }, 'predicate mặc định nhận mọi tin JSON');
});

test('waitForMessage: hết giờ → reject "timeout", kết nối đóng → reject "closed"', async () => {
  const { client } = await rawServer();
  const a = await client();
  const t0 = Date.now();
  await assert.rejects(waitForMessage(a.ws, () => true, { timeoutMs: 80 }), (e) => e instanceof Error && e.message.startsWith('timeout'),
    'Không có tin trong timeoutMs → Error có message bắt đầu bằng "timeout"');
  const took = Date.now() - t0;
  assert.ok(took >= 70 && took < 1000, `Phải reject sau khoảng timeoutMs (80 ms), đo được ${took} ms`);
  const b = await client();
  const p = waitForMessage(b.ws, () => true, { timeoutMs: 2000 });
  b.peer.close();
  await assert.rejects(p, (e) => e instanceof Error && e.message.startsWith('closed'),
    'Kết nối đóng trước khi có tin → Error có message bắt đầu bằng "closed"');
});

test('waitForMessage: luôn gỡ listener (không rò khi gọi nhiều lần)', async () => {
  const { client } = await rawServer();
  const { ws, peer } = await client();
  const base = { message: ws.listenerCount('message'), close: ws.listenerCount('close') };
  for (let i = 0; i < 20; i += 1) {
    const p = waitForMessage(ws, (m) => m.i === i);
    peer.send(JSON.stringify({ i }));
    await p;
  }
  for (let i = 0; i < 5; i += 1) {
    await waitForMessage(ws, () => true, { timeoutMs: 10 }).catch(() => {});
  }
  assert.equal(ws.listenerCount('message'), base.message, 'Sau 25 lần gọi, số listener "message" phải về như ban đầu');
  assert.equal(ws.listenerCount('close'), base.close, 'Số listener "close" cũng phải về như ban đầu');
});

// ---------- percentile ----------

test('percentile: nearest-rank, sắp theo số, không sửa mảng gốc', () => {
  const v = [40, 15, 50, 35, 20];
  assert.equal(percentile(v, 30), 20, 'percentile([15,20,35,40,50], 30) → 20 (rank = ceil(1.5) = 2)');
  assert.equal(percentile(v, 40), 20, 'p40 → rank 2 → 20');
  assert.equal(percentile(v, 50), 35, 'p50 → rank 3 → 35');
  assert.equal(percentile(v, 100), 50, 'p100 → lớn nhất');
  assert.equal(percentile(v, 0), 15, 'p0 → rank < 1 thì lấy 1 → nhỏ nhất');
  assert.deepEqual(v, [40, 15, 50, 35, 20], 'Không được sửa mảng truyền vào (sort trên bản sao)');
  assert.equal(percentile([10, 9, 1], 50), 9, 'Sắp theo SỐ: [1, 9, 10] (không phải [1, 10, 9] kiểu chuỗi)');
  assert.equal(percentile([7], 99), 7, 'Một phần tử → chính nó');
  assert.equal(percentile([], 50), null, 'Mảng rỗng → null');
  const hundred = Array.from({ length: 100 }, (_, i) => 100 - i);
  assert.equal(percentile(hundred, 95), 95, '1..100 → p95 = 95');
  assert.equal(percentile(hundred, 99), 99, '1..100 → p99 = 99');
});

// ---------- runLoadTest ----------

test('runLoadTest: 5 client × 10 tin → nhận đủ 250, số liệu hợp lệ, đóng hết kết nối', async () => {
  const server = createChatServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => { server.closeAllConnections?.(); server.close(); });
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const r = await runLoadTest({ url, clients: 5, messagesPerClient: 10 });
  assert.equal(r.clients, 5, 'clients = 5');
  assert.equal(r.sent, 50, 'sent = 5 × 10 = 50');
  assert.equal(r.expected, 250, 'expected = 5 × 5 × 10 = 250 (mỗi tin tới mọi client)');
  assert.equal(r.received, 250, 'Phải nhận đủ 250 tin');
  assert.ok(r.durationMs > 0 && r.durationMs < 5000, `durationMs hợp lý, nhận ${r.durationMs}`);
  assert.equal(r.msgsPerSec, Math.round(r.received / (r.durationMs / 1000)), 'msgsPerSec = round(received / giây)');
  const { p50, p95, p99, max } = r.latency;
  for (const [k, v] of Object.entries({ p50, p95, p99, max })) {
    assert.ok(typeof v === 'number' && v >= 0, `latency.${k} phải là số ≥ 0, nhận ${v}`);
  }
  assert.ok(p50 <= p95 && p95 <= p99 && p99 <= max, `Phải có p50 ≤ p95 ≤ p99 ≤ max, nhận ${JSON.stringify(r.latency)}`);
  await new Promise((res) => setTimeout(res, 100));
  const open = await new Promise((res) => server.getConnections((e, n) => res(n)));
  assert.equal(open, 0, 'runLoadTest phải đóng mọi kết nối trước khi trả kết quả');
});
