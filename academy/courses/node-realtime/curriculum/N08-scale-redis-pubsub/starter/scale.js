/**
 * TeamPulse — Bài N08: chạy nhiều instance server chat, đồng bộ tin qua pub/sub.
 *
 * Mỗi instance (node) chỉ giữ kết nối WebSocket CỦA NÓ. Tin chat không gửi thẳng cho client,
 * mà publish lên kênh chung; MỌI node (kể cả node gửi) subscribe kênh đó và chuyển tin cho client của mình.
 *
 *   client An ──ws──▶ node A ──publish──▶ [broker: kênh teampulse:chat] ──▶ node A ──▶ client An
 *                                                                       └─▶ node B ──▶ client Binh
 *
 * Broker là một interface nhỏ, có 2 bản cài đặt:
 *   createMemoryBroker()          — trong cùng tiến trình (test, chạy thử một máy)
 *   createRedisBroker({pub, sub}) — Redis pub/sub thật, nhiều tiến trình/máy
 *
 *   broker.publish(channel, message: string) → Promise<number>      (số subscriber nhận)
 *   broker.subscribe(channel, handler)       → Promise<unsubscribe>  (handler(message: string))
 *
 * Chạy thử 1 máy, 2 node:  npm start                → node A :3008, node B :3009, cùng memory broker
 * Client dòng lệnh:        npm run cli -- "ws://127.0.0.1:3008/ws?name=An"
 * Với Redis thật:          bash:        REDIS_URL=redis://127.0.0.1:6379 npm start
 *                          PowerShell:  $env:REDIS_URL="redis://127.0.0.1:6379"; npm start
 * Đo độ trễ broker:        npm run bench            (thêm REDIS_URL để đo Redis)
 * Chạy test:               npm test
 * Chạy riêng một nhóm test (vd. tên chứa "createMemoryBroker"):
 *   node --test --test-name-pattern="createMemoryBroker" "../../curriculum/N08-scale-redis-pubsub/tests/*.test.js"
 */
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

export const CHANNEL = 'teampulse:chat';
export const OPEN = 1;

/**
 * Broker pub/sub trong bộ nhớ, cùng hành vi với Redis pub/sub ở những điểm quan trọng:
 *
 * - `publish(channel, message)`: `message` phải là CHUỖI; không phải chuỗi → Promise reject `TypeError`.
 *   Resolve bằng SỐ handler đang subscribe `channel` lúc publish (không ai nghe → 0, tin mất luôn).
 * - Handler được gọi BẤT ĐỒNG BỘ bằng `setImmediate` (hoặc `setTimeout(..., 0)`), như tin đi qua mạng —
 *   KHÔNG dùng `queueMicrotask`/`process.nextTick`/`Promise.resolve().then` (chạy ngay khi `await publish` xong, test sẽ fail).
 *   Handler nhận đúng chuỗi đã publish. Mỗi handler của kênh nhận một lần; kênh khác không nhận.
 * - `subscribe(channel, handler)` → Promise resolve bằng hàm `unsubscribe()` (async). Gọi nó thì CHỈ handler đó
 *   thôi nhận; handler khác của cùng kênh vẫn nhận.
 * - Gợi ý: một `EventEmitter` với tên sự kiện = tên kênh.
 *
 * @returns {{publish: (channel: string, message: string) => Promise<number>,
 *            subscribe: (channel: string, handler: (message: string) => void) => Promise<() => Promise<void>>}}
 */
export function createMemoryBroker() {
  // TODO: EventEmitter, publish (kiểm tra kiểu, đếm listener, setImmediate), subscribe trả unsubscribe
  throw new Error('TODO: viết createMemoryBroker');
}

/**
 * Broker dùng Redis thật (thư viện `redis` v5), cùng interface với `createMemoryBroker`.
 *
 * Nhận HAI client đã `connect()`:
 * - `pub` chỉ dùng để `publish`. `sub` chỉ dùng để `subscribe`/`unsubscribe`: một kết nối Redis đã
 *   subscribe sẽ ở "subscriber mode" và bị Redis từ chối mọi lệnh khác, kể cả PUBLISH.
 *   (Tạo `sub` bằng `pub.duplicate()` rồi `await sub.connect()`.)
 * - `publish(channel, message)`: chuỗi → `pub.publish(channel, message)` (trả số subscriber);
 *   không phải chuỗi → reject `TypeError`, không gửi gì lên Redis.
 * - `subscribe(channel, handler)`: `await sub.subscribe(channel, listener)` với `listener(message, channel)` gọi
 *   `handler(message)`. Trả `async () => sub.unsubscribe(channel, listener)` — gỡ ĐÚNG listener đó.
 *
 * @param {{pub: import('redis').RedisClientType, sub: import('redis').RedisClientType}} clients
 * @returns {ReturnType<typeof createMemoryBroker>}
 */
export function createRedisBroker({ pub, sub }) {
  // TODO: hai hàm publish/subscribe bọc pub và sub
  throw new Error('TODO: viết createRedisBroker');
}

/**
 * Một instance server chat. ASYNC: subscribe `CHANNEL` xong mới resolve http.Server (CHƯA listen).
 *
 * - WebSocket ở `/ws?name=<tên>`; thiếu tên (sau trim rỗng) → đóng ngay với code 1008.
 *   Request HTTP thường → 404.
 * - Client gửi `{type: 'chat', text}` (text là chuỗi, sau trim dài 1–500). Sai/JSON hỏng → gửi riêng
 *   `{type: 'error', error: 'bad_message'}`.
 * - Tin hợp lệ: KHÔNG gửi thẳng cho client nào. Publish lên `CHANNEL` chuỗi JSON
 *   `{origin: nodeId, from: <tên>, text: <đã trim>, ts: new Date().toISOString()}`.
 * - Mỗi tin nhận từ `CHANNEL` (kể cả tin do chính node này publish): parse JSON (hỏng → bỏ qua, không sập),
 *   gửi cho MỌI client OPEN của node này `{type: 'chat', from, text, ts, origin, via: nodeId}`.
 * - `server.stats = { published, received, sent }`: số tin đã publish, số tin nhận từ broker,
 *   số lần `ws.send` tin chat cho client.
 * - Khi server đóng (sự kiện `close` của http.Server) → gọi unsubscribe.
 *
 * @param {{broker: ReturnType<typeof createMemoryBroker>, nodeId: string}} options
 * @returns {Promise<http.Server & {stats: {published: number, received: number, sent: number}}>}
 */
export async function createChatNode({ broker, nodeId }) {
  // Khung gợi ý — làm lần lượt Bước 4a → 4d trong bài (xoá dòng throw khi bắt đầu viết):
  //
  // const stats = { published: 0, received: 0, sent: 0 };
  // const server = http.createServer((req, res) => { ... });    // Bước 4a: request HTTP thường → 404
  // server.stats = stats;
  // const wss = new WebSocketServer({ server, path: '/ws' });
  //
  // const unsubscribe = await broker.subscribe(CHANNEL, (message) => {
  //   // Bước 4c: stats.received += 1; JSON.parse trong try (hỏng → return);
  //   //          gửi {type: 'chat', ..., via: nodeId} cho mọi client OPEN, mỗi lần gửi stats.sent += 1
  // });
  // server.on('close', () => { ... });                          // Bước 4d: gọi unsubscribe
  //
  // wss.on('connection', (ws, req) => {                          // Bước 4a: tên từ ?name=, rỗng → ws.close(1008)
  //   ws.on('error', () => {});
  //   ws.on('message', async (raw) => { ... });                  // Bước 4b: sai → bad_message; đúng → publish
  // });
  // return server;
  // TODO: viết theo khung trên
  throw new Error('TODO: viết createChatNode');
}

// ---------- Chạy trực tiếp: npm start (đã viết sẵn) ----------
async function makeBroker() {
  if (!process.env.REDIS_URL) return { broker: createMemoryBroker(), label: 'memory broker (1 tiến trình)', close: async () => {} };
  const { createClient } = await import('redis');
  const pub = createClient({ url: process.env.REDIS_URL });
  const sub = pub.duplicate();
  await pub.connect();
  await sub.connect();
  return { broker: createRedisBroker({ pub, sub }), label: `Redis ${process.env.REDIS_URL}`, close: async () => { await sub.close(); await pub.close(); } };
}

async function main() {
  const { broker, label } = await makeBroker();
  const base = Number(process.env.PORT) || 3008;
  const ids = (process.env.NODES || 'A,B').split(',');
  for (let i = 0; i < ids.length; i += 1) {
    const server = await createChatNode({ broker, nodeId: ids[i] });
    server.listen(base + i, '127.0.0.1', () => console.log(`node ${ids[i]}: ws://127.0.0.1:${base + i}/ws?name=<tên>`));
  }
  console.log(`Broker: ${label}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { makeBroker };
