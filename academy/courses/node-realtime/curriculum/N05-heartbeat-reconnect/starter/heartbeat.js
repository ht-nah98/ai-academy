/**
 * TeamPulse — Bài N05: heartbeat ping/pong và tự kết nối lại.
 *
 * Server: cứ `intervalMs` gửi ping cho mọi kết nối; kết nối nào không trả pong kịp
 *         trước lượt kế tiếp thì bị coi là chết và bị terminate().
 * Client: mất kết nối thì tự kết nối lại, chờ theo backoff mũ có jitter;
 *         tin gửi trong lúc mất mạng được xếp hàng và gửi bù khi kết nối lại.
 *
 * Chạy thử (2 terminal):  npm start          → server ws://127.0.0.1:3005, heartbeat 5 giây
 *                         npm run client     → client gửi 1 tin/giây; Ctrl+C server rồi npm start lại
 * Chạy test:              node --test "../../curriculum/N05-heartbeat-reconnect/tests/*.test.js"
 */
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

export const OPEN = 1; // readyState khi kết nối đang mở (WebSocket.OPEN)
export const CLOSED = 3; // readyState khi kết nối đã đóng (WebSocket.CLOSED)

/**
 * Bật heartbeat cho một `WebSocketServer` (hoặc object có cùng hình dạng: `clients` là Set,
 * phát sự kiện `connection`).
 *
 * - Mỗi kết nối MỚI (sự kiện `connection` của `wss`): đặt `ws.isAlive = true` và lắng nghe
 *   `ws.on('pong', ...)` để đặt lại `ws.isAlive = true` mỗi khi nhận pong.
 * - `sweep()` — một lượt kiểm tra, duyệt `wss.clients`:
 *     `ws.isAlive === false` (lượt trước đã ping mà chưa thấy pong) → `ws.terminate()`, gọi `onDead(ws)`;
 *     ngược lại → đặt `ws.isAlive = false` rồi `ws.ping()`.
 *   Trả về SỐ kết nối đã terminate trong lượt này.
 * - `setInterval(sweep, intervalMs)` chạy `sweep` định kỳ.
 * - `stop()` dừng interval và gỡ listener `connection` đã gắn vào `wss`.
 *
 * Kết nối chết được phát hiện sau tối đa 2 × `intervalMs`.
 *
 * @param {import('ws').WebSocketServer} wss
 * @param {{intervalMs?: number, onDead?: (ws: object) => void}} [options]
 * @returns {{sweep: () => number, stop: () => void}}
 */
export function startHeartbeat(wss, { intervalMs = 30000, onDead = () => {} } = {}) {
  // TODO: listener 'connection' (isAlive + 'pong'), hàm sweep, setInterval, stop
  throw new Error('TODO: viết startHeartbeat');
}

/**
 * Thời gian chờ (ms, số nguyên) trước lần kết nối lại thứ `attempt` (đếm từ 0).
 *
 * - `cap = Math.min(maxMs, baseMs × 2^attempt)` — tăng gấp đôi mỗi lần, không vượt `maxMs`.
 * - Jitter "một nửa": kết quả = `Math.round(cap / 2 + random() × cap / 2)`, tức nằm trong [cap/2, cap].
 * - `random` mặc định `Math.random`; test truyền hàm cố định để kết quả xác định.
 *
 * Ví dụ: backoffDelay(0, { random: () => 0 }) → 250;  backoffDelay(3, { random: () => 1 }) → 4000
 *        backoffDelay(20, { random: () => 1 }) → 30000
 *
 * @param {number} attempt
 * @param {{baseMs?: number, maxMs?: number, random?: () => number}} [options]
 * @returns {number}
 */
export function backoffDelay(attempt, { baseMs = 500, maxMs = 30000, random = Math.random } = {}) {
  // TODO: tính cap rồi cộng jitter
  throw new Error('TODO: viết backoffDelay');
}

/**
 * Client WebSocket tự kết nối lại. Kết nối ngay khi được tạo.
 *
 * - Kết nối mở (`open`): đặt lại số lần thử về 0, gửi bù MỌI tin trong hàng đợi theo đúng thứ tự,
 *   rồi gọi `onOpen()`.
 * - Nhận tin (`message`): gọi `onMessage(String(data))`.
 * - Kết nối đóng (`close`) mà KHÔNG phải do gọi `close()`: tính `delay = backoffDelay(attempt, {baseMs, maxMs, random})`,
 *   gọi `onRetry({ attempt, delay })`, tăng `attempt` thêm 1, rồi `setTimeout` kết nối lại sau `delay` ms.
 *   (Kết nối thất bại ngay từ đầu cũng phát `close`, nên cũng được thử lại.)
 * - Sự kiện `error` của từng kết nối phải được lắng nghe (bỏ qua được — `close` luôn đến sau).
 * - `send(obj)`: `JSON.stringify(obj)`; kết nối đang OPEN → gửi ngay, trả `'sent'`;
 *   không thì đưa vào hàng đợi, trả `'queued'`. Hàng đợi đầy (`maxQueue`) → bỏ tin CŨ NHẤT.
 * - `close()`: dừng hẳn — huỷ lần kết nối lại đang chờ, đóng kết nối hiện tại, không thử lại nữa.
 * - `readyState`: readyState của kết nối hiện tại; `queued`: số tin đang chờ trong hàng đợi.
 *
 * @param {string} url
 * @param {{baseMs?: number, maxMs?: number, random?: () => number, maxQueue?: number,
 *          onOpen?: () => void, onMessage?: (text: string) => void,
 *          onRetry?: (info: {attempt: number, delay: number}) => void}} [options]
 * @returns {{send: (obj: unknown) => 'sent' | 'queued', close: () => void, readonly readyState: number, readonly queued: number}}
 */
export function createReconnectingClient(url, {
  baseMs = 500, maxMs = 30000, random = Math.random, maxQueue = 100,
  onOpen = () => {}, onMessage = () => {}, onRetry = () => {},
} = {}) {
  // TODO: hàm connect() tạo new WebSocket(url) và gắn open/message/close/error;
  //       biến attempt, hàng đợi, timer chờ, cờ đã-đóng
  throw new Error('TODO: viết createReconnectingClient');
}

// ---------- Chạy trực tiếp (đã viết sẵn) ----------
const PORT = Number(process.env.PORT) || 3005;
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;

function runServer() {
  const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
  let nextId = 1;
  wss.on('connection', (ws) => {
    ws.id = nextId++;
    console.log(`${at()} server: kết nối #${ws.id} mở (${wss.clients.size} đang mở)`);
    ws.on('message', (data) => {
      console.log(`${at()} server: #${ws.id} gửi ${data}`);
      ws.send(JSON.stringify({ type: 'ack', got: String(data) }));
    });
    ws.on('close', (code) => console.log(`${at()} server: kết nối #${ws.id} đóng, code ${code}`));
    ws.on('error', () => {});
  });
  startHeartbeat(wss, {
    intervalMs: 5000,
    onDead: (ws) => console.log(`${at()} server: #${ws.id} không trả pong → terminate`),
  });
  console.log(`Server heartbeat 5 s: ws://127.0.0.1:${PORT}`);
}

function runClient() {
  let n = 0;
  const client = createReconnectingClient(`ws://127.0.0.1:${PORT}`, {
    onOpen: () => console.log(`${at()} client: đã kết nối`),
    onMessage: (text) => console.log(`${at()} client: nhận ${text}`),
    onRetry: ({ attempt, delay }) => console.log(`${at()} client: mất kết nối, thử lại lần ${attempt + 1} sau ${delay} ms`),
  });
  setInterval(() => {
    n += 1;
    const r = client.send({ type: 'chat', n });
    if (r === 'queued') console.log(`${at()} client: tin ${n} vào hàng đợi (${client.queued} tin)`);
  }, 1000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'client') runClient();
  else runServer();
}
