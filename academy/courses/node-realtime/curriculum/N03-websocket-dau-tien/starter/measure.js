/**
 * Đo polling vs WebSocket (đã viết sẵn). Chạy: npm run measure
 *
 * Dựng một server nhỏ trong cùng tiến trình: cứ khoảng 2 giây có 1 tin mới, tổng 10 tin trong 20 giây.
 * - Client A: startPolling() CỦA BẠN, hỏi GET /messages?since=... mỗi POLL_MS mili giây.
 * - Client B: WebSocket, server đẩy tin ngay khi có.
 * In ra: số request, số response rỗng, độ trễ trung bình/tối đa, tổng byte đi qua mạng.
 */
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { startPolling } from './echo.js';

const POLL_MS = Number(process.env.POLL_MS) || 1000;
const TOTAL = 10;
const SPACING = 2000;

const messages = [];
const httpSockets = new Set();
const server = http.createServer((req, res) => {
  httpSockets.add(req.socket);
  const since = Number(new URL(req.url, 'http://x').searchParams.get('since')) || 0;
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ messages: messages.filter((m) => m.id > since) }));
});
const wss = new WebSocketServer({ server, path: '/ws' });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const pollDelays = [];
const wsDelays = [];
const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
ws.on('message', (data) => {
  const m = JSON.parse(data);
  wsDelays.push(Date.now() - m.sentAt);
});
await new Promise((resolve) => ws.once('open', resolve));

const poller = startPolling({
  url: `${base}/messages`,
  intervalMs: POLL_MS,
  onMessage: (m) => pollDelays.push(Date.now() - m.sentAt),
});

console.log(`Đang đo ${(TOTAL * SPACING) / 1000} giây: ${TOTAL} tin, polling mỗi ${POLL_MS} ms...`);
for (let i = 1; i <= TOTAL; i++) {
  await new Promise((r) => setTimeout(r, SPACING - 300 + Math.random() * 600));
  const m = { id: i, text: `tin ${i}`, sentAt: Date.now() };
  messages.push(m);
  for (const c of wss.clients) c.send(JSON.stringify(m));
}
await new Promise((r) => setTimeout(r, POLL_MS + 200));
poller.stop();

const [wsSock] = [...wss.clients].map((c) => c._socket);
const wsBytes = wsSock.bytesRead + wsSock.bytesWritten;
let httpBytes = 0;
for (const s of httpSockets) httpBytes += s.bytesRead + s.bytesWritten;
ws.close();
server.closeAllConnections();
server.close();

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : NaN);
const s = poller.stats;
console.log('');
console.log(`Polling ${POLL_MS} ms : ${s.requests} request, ${s.empty} rỗng (${Math.round((100 * s.empty) / s.requests)}%), ` +
  `nhận ${s.received}/${TOTAL}, trễ TB ${avg(pollDelays)} ms, tối đa ${Math.max(...pollDelays)} ms, ${httpBytes} byte`);
console.log(`WebSocket      : 1 kết nối, nhận ${wsDelays.length}/${TOTAL}, trễ TB ${avg(wsDelays)} ms, ` +
  `tối đa ${Math.max(...wsDelays)} ms, ${wsBytes} byte (gồm cả handshake)`);
process.exit(0);
