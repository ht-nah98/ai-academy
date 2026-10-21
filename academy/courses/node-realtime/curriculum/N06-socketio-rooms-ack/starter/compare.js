/**
 * So sánh ws thuần với Socket.IO (đã viết sẵn). Chạy: npm run compare
 *
 * Cùng một việc: 1 client kết nối, gửi 10 tin chat, server trả lại từng tin.
 * Đếm trên chính socket TCP phía server: số request HTTP, tổng byte đọc + ghi, byte của một tin.
 *   A. ws thuần                        — new WebSocket(url)
 *   B. Socket.IO mặc định              — io(url): bắt đầu bằng HTTP long-polling rồi nâng cấp lên WebSocket
 *   C. Socket.IO chỉ WebSocket         — io(url, { transports: ['websocket'] })
 * Cuối cùng: client ws thuần thử nói chuyện với server Socket.IO.
 */
import http from 'node:http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { WebSocket, WebSocketServer } from 'ws';

const N = 10;
const MSG = { room: 'dev', text: 'Build #128 xong, deploy lúc 10h' };

/** HTTP server đếm request và byte trên mọi socket TCP. `attach(server)` gắn ws/Socket.IO trước khi đếm. */
async function countingServer(attach) {
  const server = http.createServer();
  const extra = attach(server);
  const stats = { requests: 0 };
  const sockets = new Set();
  server.on('connection', (s) => sockets.add(s));
  server.prependListener('request', () => { stats.requests += 1; }); // gắn SAU Socket.IO để đếm cả request polling
  server.prependListener('upgrade', () => { stats.requests += 1; });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  stats.total = () => {
    let sum = 0;
    for (const s of sockets) sum += s.bytesRead + s.bytesWritten;
    return sum;
  };
  return { server, stats, port: server.address().port, extra };
}

async function measureWs() {
  const { server, stats, port, extra: wss } = await countingServer((srv) => new WebSocketServer({ server: srv }));
  wss.on('connection', (ws) => ws.on('message', (d) => ws.send(String(d))));
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((r) => ws.once('open', r));
  const afterHandshake = stats.total();
  let frame = '';
  for (let i = 0; i < N; i += 1) {
    ws.send(JSON.stringify({ type: 'chat', ...MSG }));
    frame = String(await new Promise((r) => ws.once('message', r)));
  }
  const result = { requests: stats.requests, handshake: afterHandshake, total: stats.total(), frame };
  ws.close();
  wss.close();
  server.close();
  return result;
}

async function measureSocketIo(clientOptions) {
  const { stats, port, extra: io } = await countingServer((srv) => new Server(srv));
  let frame = '';
  io.on('connection', (socket) => {
    socket.on('chat', (msg, ack) => ack(msg));
  });
  io.engine.on('connection', (raw) => {
    // gói Engine.IO loại "message" đi trên dây dạng '4' + dữ liệu Socket.IO
    raw.on('packet', (p) => { if (p.type === 'message') frame = '4' + p.data; });
  });
  const socket = ioClient(`http://127.0.0.1:${port}`, { reconnection: false, ...clientOptions });
  await new Promise((r) => socket.once('connect', r));
  await new Promise((r) => setTimeout(r, 300)); // chờ nâng cấp polling → websocket (nếu có)
  const afterHandshake = stats.total();
  for (let i = 0; i < N; i += 1) {
    await socket.emitWithAck('chat', MSG);
  }
  const result = { requests: stats.requests, handshake: afterHandshake, total: stats.total(), frame, transport: socket.io.engine.transport.name };
  socket.disconnect();
  io.close();
  return result;
}

const a = await measureWs();
const b = await measureSocketIo({});
const c = await measureSocketIo({ transports: ['websocket'] });

const row = (label, r) => `${label.padEnd(43)} ${String(r.requests).padStart(3)} request  ${String(r.handshake).padStart(5)} byte bắt tay  ${String(r.total).padStart(5)} byte tổng`;
console.log(`${N} tin chat, mỗi tin được server trả lại:`);
console.log(row('A. ws thuần', a));
console.log(row(`B. Socket.IO mặc định (${b.transport === 'websocket' ? 'polling → websocket' : b.transport})`, b));
console.log(row('C. Socket.IO chỉ websocket', c));
console.log('Một tin ws thuần   :', a.frame, `(${Buffer.byteLength(a.frame)} byte payload)`);
console.log('Một tin Socket.IO  :', c.frame || '(không bắt được)', c.frame ? `(${Buffer.byteLength(c.frame)} byte payload)` : '');

// Client ws thuần gọi server Socket.IO
const { port, extra: io } = await countingServer((srv) => new Server(srv));
for (const path of ['/', '/socket.io/?EIO=4&transport=websocket']) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  ws.on('error', (e) => console.log(`ws thuần → ${path}: lỗi "${e.message}"`));
  ws.on('message', (d) => {
    console.log(`ws thuần → ${path}: nhận "${String(d).slice(0, 60)}..." (gói Engine.IO, không phải tin chat)`);
    ws.close();
  });
  await new Promise((r) => ws.once('close', r));
}
io.close();
