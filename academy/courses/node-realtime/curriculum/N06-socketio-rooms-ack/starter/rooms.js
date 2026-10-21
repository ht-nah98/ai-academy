/**
 * TeamPulse — Bài N06: phòng chat nhiều room bằng Socket.IO, có ack.
 *
 * Socket.IO dùng SỰ KIỆN có tên thay cho tin JSON {type}. Mỗi sự kiện client gửi có thể kèm
 * callback cuối cùng (ack) để server trả lời đúng tin đó.
 *
 *   Client → server (kèm ack)                    Server → client
 *   emit('join',  'dev', ack)                    'joined' {room, name}            (người khác trong room)
 *   emit('leave', 'dev', ack)                    'left'   {room, name}            (người còn lại trong room)
 *   emit('chat',  {room, text}, ack)             'chat'   {id, room, from, text, ts} (mọi người trong room, gồm người gửi)
 *
 *   ack trả về: {ok: true, ...} hoặc {ok: false, error: 'invalid_room' | 'not_in_room' | 'invalid_text'}
 *
 * Tên người dùng gửi lúc kết nối: io(url, { auth: { name: 'An' } }).
 *
 * Chạy thử:   npm start         → mở http://127.0.0.1:3006 ở 2 tab
 * So sánh:    npm run compare   → byte và request: ws thuần vs Socket.IO
 * Chạy test:  node --test "../../curriculum/N06-socketio-rooms-ack/tests/*.test.js"
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';

export const MAX_NAME = 20;
export const MAX_TEXT = 500;

/**
 * Chuẩn hoá tên room. Trả chuỗi đã chuẩn hoá, hoặc `null` nếu không hợp lệ.
 *
 * - Không phải chuỗi → `null`.
 * - Trim hai đầu, đổi sang chữ thường.
 * - Sau đó phải dài 1–30 ký tự và chỉ gồm `a-z`, `0-9`, `-`; sai → `null`.
 *
 * Ví dụ: normalizeRoom('  Dev ') → 'dev';  normalizeRoom('team-1') → 'team-1'
 *        normalizeRoom('phòng 1') → null;   normalizeRoom(42) → null
 *
 * @param {unknown} room
 * @returns {string | null}
 */
export function normalizeRoom(room) {
  // TODO: kiểm tra kiểu, trim + toLowerCase, rồi kiểm tra độ dài và từng ký tự
  throw new Error('TODO: viết normalizeRoom');
}

/**
 * Tạo HTTP server (CHƯA listen) + Socket.IO server gắn vào nó. Trả `{ server, io }`.
 *
 * HTTP: `GET /` → 200, `text/html; charset=utf-8`, nội dung `public/index.html`; đường dẫn khác → 404.
 * (Socket.IO tự phục vụ `/socket.io/...`, gồm cả file client `/socket.io/socket.io.js`.)
 *
 * Middleware `io.use(...)` chạy TRƯỚC khi kết nối được chấp nhận:
 * - `socket.handshake.auth.name` phải là chuỗi, sau trim dài 1–`MAX_NAME` → lưu vào `socket.data.name`.
 * - Sai → `next(new Error('invalid_name'))` (client nhận sự kiện `connect_error` với message đó).
 *
 * Sự kiện từ client (`ack` là callback cuối; client có thể không gửi ack → bỏ qua, không ném lỗi):
 * - `join(room, ack)`: `normalizeRoom` sai → ack `{ok: false, error: 'invalid_room'}`.
 *     Hợp lệ → `socket.join(r)`; ack `{ok: true, room: r, members}` với `members` = số socket trong room
 *     SAU khi vào; gửi những người KHÁC trong room `'joined'` `{room: r, name}`.
 *     Đã ở trong room rồi → vẫn ack `{ok: true, room: r, members}`, KHÔNG gửi `joined` lần nữa.
 * - `leave(room, ack)`: chưa ở trong room (hoặc room sai) → `{ok: false, error: 'not_in_room'}`;
 *     có → rời room, ack `{ok: true, room: r}`, gửi những người còn lại `'left'` `{room: r, name}`.
 * - `chat({room, text}, ack)`: room sai hoặc chưa ở trong room → `not_in_room`;
 *     `text` không phải chuỗi hoặc sau trim dài 0 / quá `MAX_TEXT` → `invalid_text`;
 *     hợp lệ → `msg = {id, room: r, from: name, text: <đã trim>, ts: new Date().toISOString()}`,
 *     `id` là số tăng dần 1, 2, 3... trên toàn server; gửi `'chat'` msg cho MỌI NGƯỜI trong room (gồm người gửi),
 *     ack `{ok: true, id}`.
 * - Ngắt kết nối: ở sự kiện `disconnecting` (lúc `socket.rooms` còn đủ), với mỗi room đã join
 *   (bỏ qua room riêng có tên bằng `socket.id`) gửi những người còn lại `'left'` `{room, name}`.
 *
 * @returns {{server: http.Server, io: import('socket.io').Server}}
 */
export function createRoomServer() {
  // TODO: http.createServer(...), new Server(server), io.use(...), io.on('connection', ...)
  throw new Error('TODO: viết createRoomServer');
}

/**
 * Gửi một sự kiện có ack, chờ tối đa `timeoutMs`; không có ack thì GỬI LẠI, tối đa `retries` lần nữa.
 *
 * - `socket` là client Socket.IO (`socket.io-client`) đã kết nối.
 * - Lần gửi thứ k (k = 1, 2, ...): chờ ack trong `timeoutMs`. Có ack → resolve `{ response, attempts: k }`.
 * - Hết `1 + retries` lần mà không có ack → reject `Error` có message `'ack_timeout'`.
 * - Gợi ý: `socket.timeout(ms).emitWithAck(event, payload)` trả Promise, reject khi hết giờ.
 *
 * Ví dụ: server bỏ qua lần đầu, trả lời lần hai → { response: {...}, attempts: 2 }
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {string} event
 * @param {unknown} payload
 * @param {{timeoutMs?: number, retries?: number}} [options]
 * @returns {Promise<{response: unknown, attempts: number}>}
 */
export async function sendWithRetry(socket, event, payload, { timeoutMs = 2000, retries = 2 } = {}) {
  // TODO: vòng lặp tối đa 1 + retries lần, try/catch quanh lần chờ ack
  throw new Error('TODO: viết sendWithRetry');
}

// ---------- Chạy trực tiếp: npm start (đã viết sẵn) ----------
function main() {
  const port = Number(process.env.PORT) || 3006;
  const { server } = createRoomServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`TeamPulse rooms (Socket.IO): http://127.0.0.1:${port}  — mở 2 tab, vào cùng room để chat`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
