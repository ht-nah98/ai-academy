/**
 * Đo tải chat-server.js bằng runLoadTest() CỦA BẠN (đã viết sẵn). Chạy: npm run load
 * Đổi tải: LOAD_CLIENTS=50 LOAD_MSGS=20 npm run load
 */
import { createChatServer } from './chat-server.js';
import { runLoadTest } from './testkit.js';

const clients = Number(process.env.LOAD_CLIENTS) || 20;
const messagesPerClient = Number(process.env.LOAD_MSGS) || 20;
const server = createChatServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const r = await runLoadTest({ url: `ws://127.0.0.1:${server.address().port}/ws`, clients, messagesPerClient });
console.log(`${r.clients} client × ${messagesPerClient} tin = ${r.sent} tin gửi, mỗi tin tới ${r.clients} client`);
console.log(`Nhận ${r.received}/${r.expected} trong ${r.durationMs.toFixed(0)} ms → ${r.msgsPerSec} tin/giây`);
console.log(`Độ trễ (ms): p50 ${r.latency.p50.toFixed(1)}  p95 ${r.latency.p95.toFixed(1)}  p99 ${r.latency.p99.toFixed(1)}  max ${r.latency.max.toFixed(1)}`);
server.close();
