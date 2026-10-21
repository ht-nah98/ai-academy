/**
 * Đo chi phí fan-out qua broker (đã viết sẵn). Chạy: npm run bench   (REDIS_URL=... để đo Redis)
 *
 * Dựng NODES node chat bằng createChatNode() CỦA BẠN, mỗi node CLIENTS client.
 * Mỗi client gửi MSGS tin; đo: tổng số tin client nhận, tin/giây, độ trễ gửi → nhận (trung vị, tối đa),
 * và bộ đếm stats của từng node.
 */
import { WebSocket } from 'ws';
import { createChatNode, makeBroker } from './scale.js';

const NODES = Number(process.env.BENCH_NODES) || 2;
const CLIENTS = Number(process.env.BENCH_CLIENTS) || 5;
const MSGS = Number(process.env.BENCH_MSGS) || 20;

const { broker, label, close } = await makeBroker();
const servers = [];
for (let i = 0; i < NODES; i += 1) {
  const s = await createChatNode({ broker, nodeId: String.fromCharCode(65 + i) });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servers.push(s);
}

const latencies = [];
let received = 0;
const expected = NODES * CLIENTS * NODES * CLIENTS * MSGS; // mỗi tin tới mọi client
const sockets = [];
let done;
const allDone = new Promise((r) => { done = r; });
for (const s of servers) {
  for (let c = 0; c < CLIENTS; c += 1) {
    const name = `u${sockets.length}`;
    const ws = new WebSocket(`ws://127.0.0.1:${s.address().port}/ws?name=${name}`);
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.type !== 'chat') return;
      received += 1;
      if (m.from === name) latencies.push(performance.now() - Number(m.text.split(' ')[1]));
      if (received === expected) done();
    });
    sockets.push(ws);
  }
}
await Promise.all(sockets.map((ws) => new Promise((r) => ws.once('open', r))));

const t0 = performance.now();
for (let k = 0; k < MSGS; k += 1) {
  for (const ws of sockets) ws.send(JSON.stringify({ type: 'chat', text: `t ${performance.now()}` }));
  await new Promise((r) => setImmediate(r));
}
await Promise.race([allDone, new Promise((r) => setTimeout(r, 10000))]);
const secs = (performance.now() - t0) / 1000;

const sorted = [...latencies].sort((a, b) => a - b);
console.log(`Broker: ${label}`);
console.log(`${NODES} node × ${CLIENTS} client, mỗi client gửi ${MSGS} tin → ${NODES * CLIENTS * MSGS} tin gửi, mỗi tin tới ${NODES * CLIENTS} client`);
console.log(`Client nhận ${received}/${expected} tin trong ${secs.toFixed(2)} s → ${Math.round(received / secs)} tin/giây`);
console.log(`Độ trễ gửi → nhận lại tin của chính mình: trung vị ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms, tối đa ${sorted[sorted.length - 1].toFixed(1)} ms`);
for (const s of servers) console.log('stats', JSON.stringify(s.stats));

for (const ws of sockets) ws.terminate();
for (const s of servers) s.close();
await close();
