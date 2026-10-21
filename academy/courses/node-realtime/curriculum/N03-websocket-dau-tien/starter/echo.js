/**
 * TeamPulse — Bài N03: WebSocket đầu tiên.
 *
 * Phần 1 — polling: client HTTP hỏi server liên tục "có tin mới không?" (để đo cái giá của nó).
 * Phần 2 — handshake: tự tính Sec-WebSocket-Accept để thấy WebSocket bắt đầu từ một request HTTP.
 * Phần 3 — echo server: dùng thư viện `ws` (đã cài ở thư mục khóa học), phục vụ public/index.html.
 *
 * Chạy thử:   npm start         → mở http://127.0.0.1:3001 , DevTools → Network → WS
 *             npm run measure   → đo polling vs WebSocket (cần startPolling chạy được)
 * Chạy test:  node --test "../../curriculum/N03-websocket-dau-tien/tests/*.test.js"
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

/** Chuỗi cố định trong chuẩn RFC 6455, mọi server WebSocket đều dùng đúng chuỗi này. */
export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---------- Phần 1: polling ----------

/**
 * Bắt đầu polling: hỏi `url` liên tục để lấy tin mới. Trả về NGAY `{ stop, stats }` (không async).
 *
 * - Mỗi lượt gọi `fetch(url + '?since=' + lastId)`; lần đầu `lastId = 0`.
 *   Server trả JSON `{ messages: [{ id, ... }, ...] }` (giống API bài N02).
 * - Với mỗi tin nhận được: gọi `onMessage(tin)` theo thứ tự, rồi cập nhật `lastId = tin.id`.
 * - `stats` là object được cập nhật dần:
 *     `requests` — số request đã gửi xong (có response hoặc lỗi),
 *     `empty`    — số response có 0 tin,
 *     `received` — tổng số tin đã nhận,
 *     `errors`   — số lần fetch lỗi (server tắt, JSON hỏng...). Lỗi KHÔNG làm dừng polling.
 * - Lượt đầu chạy ngay. Lượt kế tiếp bắt đầu `intervalMs` mili giây SAU KHI lượt trước xong
 *   (dùng setTimeout sau mỗi lượt, không dùng setInterval → không bao giờ có 2 request chồng nhau).
 * - `stop()`: không gửi thêm request nào nữa (huỷ timer đang chờ).
 *
 * @param {{url: string, intervalMs: number, onMessage: (msg: object) => void}} options
 * @returns {{stop: () => void, stats: {requests: number, empty: number, received: number, errors: number}}}
 */
export function startPolling({ url, intervalMs, onMessage }) {
  // TODO: viết theo Bước 2a–2e của bài. Các phần cần có:
  //   2a. trả về NGAY { stop, stats } — stats có 4 bộ đếm bằng 0
  //   2b. một lượt hỏi: url?since=<id cuối>, onMessage từng tin, nhớ id cuối, cập nhật bộ đếm; lượt đầu chạy ngay
  //   2c. lượt xong mới hẹn lượt sau (intervalMs)
  //   2d. stop(): không gửi thêm request nào
  //   2e. lượt lỗi: đếm errors, không ném ra ngoài, vẫn hẹn lượt sau
  throw new Error('TODO: viết startPolling');
}

// ---------- Phần 2: handshake ----------

/**
 * Tính giá trị header `Sec-WebSocket-Accept` từ `Sec-WebSocket-Key` mà client gửi.
 *
 * Công thức (RFC 6455): base64( SHA-1( key + WS_GUID ) ).
 * Ví dụ trong chuẩn: computeAccept('dGhlIHNhbXBsZSBub25jZQ==') → 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
 *
 * @param {string} key
 * @returns {string}
 */
export function computeAccept(key) {
  // TODO: createHash('sha1').update(...).digest(...)
  throw new Error('TODO: viết computeAccept');
}

/**
 * Quyết định server trả lời request "xin nâng cấp lên WebSocket" thế nào.
 *
 * `headers` là object header của request, tên header viết thường (giống `req.headers` của Node).
 *
 * - Hợp lệ khi đủ 4 điều kiện:
 *     `upgrade` là "websocket" (không phân biệt hoa thường),
 *     `connection` có chứa token "upgrade" (không phân biệt hoa thường; có thể là "keep-alive, Upgrade"),
 *     `sec-websocket-version` là "13",
 *     `sec-websocket-key` là chuỗi base64 giải mã ra đúng 16 byte.
 *   → trả `{ status: 101, headers: { Upgrade: 'websocket', Connection: 'Upgrade',
 *                                    'Sec-WebSocket-Accept': computeAccept(key) } }`
 * - Có `upgrade`/`connection`/`key` hợp lệ nhưng `sec-websocket-version` khác "13"
 *   → `{ status: 426, headers: { 'Sec-WebSocket-Version': '13' } }` (báo bản server hỗ trợ).
 * - Mọi trường hợp sai khác → `{ status: 400, headers: {} }`.
 *
 * @param {Record<string, string | undefined>} headers
 * @returns {{status: number, headers: Record<string, string>}}
 */
export function handshakeResponse(headers) {
  // TODO: đọc từng header, kiểm tra theo thứ tự, trả object
  throw new Error('TODO: viết handshakeResponse');
}

// ---------- Phần 3: kết nối WebSocket ----------

/**
 * Tên trạng thái của một kết nối WebSocket theo `ws.readyState`:
 * 0 → 'CONNECTING', 1 → 'OPEN', 2 → 'CLOSING', 3 → 'CLOSED', số khác → 'UNKNOWN'.
 *
 * @param {{readyState: number}} ws
 * @returns {string}
 */
export function readyStateName(ws) {
  // TODO
  throw new Error('TODO: viết readyStateName');
}

/**
 * Tạo HTTP server (CHƯA listen) kèm WebSocket echo ở đường dẫn `/ws`.
 *
 * HTTP:
 * - `GET /` → 200, `Content-Type: text/html; charset=utf-8`, nội dung file `public/index.html`
 *   (đọc theo vị trí file này: `new URL('./public/index.html', import.meta.url)`).
 * - Đường dẫn khác → 404.
 *
 * WebSocket (dùng `new WebSocketServer({ server, path: '/ws' })` của thư viện `ws`):
 * - Kết nối tới đường dẫn khác `/ws` bị từ chối (thư viện `ws` tự làm khi có `path`).
 * - Ngay khi có kết nối mới: gửi tin text `welcome`.
 * - Nhận tin TEXT → gửi lại tin text `echo: <nội dung>` (vd. "xin chào" → "echo: xin chào").
 * - Nhận tin BINARY → gửi lại đúng các byte đó, dạng binary (`ws.send(data, { binary: true })`).
 * - Lắng nghe sự kiện `error` của từng kết nối (ghi log), để lỗi một client không làm sập server.
 *
 * @returns {http.Server}
 */
export function createEchoServer() {
  // TODO: viết theo Bước 6a–6e của bài (ví dụ mẫu cùng khuôn: preview.js). Khung xương:
  //   const server = http.createServer(async (req, res) => {
  //     /* GET / → đọc public/index.html, 200 text/html; còn lại → 404 */
  //   });
  //   /* 6b: gắn WebSocketServer vào server, chỉ nhận đường dẫn /ws */
  //   /* 6c: mỗi kết nối: nghe 'error', gửi 'welcome' */
  //   /* 6d: mỗi tin: text → 'echo: ...', binary → trả đúng byte, vẫn binary */
  //   return server;           // KHÔNG listen ở đây
  throw new Error('TODO: viết createEchoServer');
}

// ---------- Chạy trực tiếp: npm start (đã viết sẵn) ----------
function main() {
  const port = Number(process.env.PORT) || 3001;
  const server = createEchoServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Echo server: http://127.0.0.1:${port}  (WebSocket ở ws://127.0.0.1:${port}/ws)`);
  });
  server.on('upgrade', (req) => {
    console.log(`[upgrade] ${req.method} ${req.url}  Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`);
    console.log(`          handshakeResponse →`, handshakeResponse(req.headers));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
