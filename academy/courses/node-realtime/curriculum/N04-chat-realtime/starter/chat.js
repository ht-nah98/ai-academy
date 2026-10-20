/**
 * TeamPulse — Bài N04: chat realtime nhiều người qua WebSocket.
 *
 * Giao thức: mọi tin là MỘT chuỗi JSON có trường `type`.
 *
 *   Client → server                         Server → client
 *   {type:"join", name:"An"}                {type:"welcome", name, users}      (chỉ người vừa vào)
 *   {type:"chat", text:"Chào cả nhà"}       {type:"joined",  name, users}      (những người khác)
 *                                           {type:"left",    name, users}      (những người còn lại)
 *                                           {type:"chat",    from, text, ts}   (mọi người, gồm người gửi)
 *                                           {type:"error",   error}            (chỉ người gửi sai)
 *
 * Chạy thử:   npm start   → mở http://127.0.0.1:3002 ở 2 tab, đặt 2 tên khác nhau và chat
 * Chạy test:  node --test "../../curriculum/N04-chat-realtime/tests/*.test.js"
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

export const MAX_NAME = 20;
export const MAX_TEXT = 500;
export const OPEN = 1; // giá trị readyState khi kết nối đang mở (như WebSocket.OPEN)

/**
 * Đọc và kiểm tra MỘT tin client gửi lên. KHÔNG BAO GIỜ ném lỗi.
 *
 * `raw` là chuỗi hoặc Buffer (thư viện `ws` đưa Buffer) — đổi sang chuỗi bằng `String(raw)`.
 *
 * Trả về `{ ok: true, msg }` với `msg` đã chuẩn hoá (đã trim, chỉ giữ các khóa nêu dưới), hoặc
 * `{ ok: false, error }` với `error` là một trong các mã:
 * - `'invalid_json'`  — không parse được, hoặc JSON không phải object thường (mảng, số, null...).
 * - `'unknown_type'`  — `type` không phải `'join'` hay `'chat'`.
 * - `'invalid_name'`  — `join` mà `name` không phải chuỗi, hoặc sau trim dài 0 hay quá `MAX_NAME` ký tự.
 * - `'invalid_text'`  — `chat` mà `text` không phải chuỗi, hoặc sau trim dài 0 hay quá `MAX_TEXT` ký tự.
 *
 * Ví dụ: parseClientMessage('{"type":"join","name":"  An "}') → { ok: true, msg: { type: 'join', name: 'An' } }
 *        parseClientMessage('{"type":"chat","text":"Hi","x":1}') → { ok: true, msg: { type: 'chat', text: 'Hi' } }
 *        parseClientMessage('{hỏng') → { ok: false, error: 'invalid_json' }
 *
 * @param {string | Buffer} raw
 * @returns {{ok: true, msg: {type: 'join', name: string} | {type: 'chat', text: string}} | {ok: false, error: string}}
 */
export function parseClientMessage(raw) {
  // TODO: try/catch JSON.parse, kiểm tra object, rồi kiểm tra theo từng type
  throw new Error('TODO: viết parseClientMessage');
}

/**
 * Gửi `payload` (object) tới nhiều client. Trả về SỐ client đã gửi.
 *
 * - `clients` là một iterable (Set, Array, `wss.clients`...) gồm các object có `readyState` và `send(text)`.
 * - Chỉ gửi cho client có `readyState === OPEN`; bỏ qua client đang CONNECTING/CLOSING/CLOSED.
 * - Bỏ qua client `except` (nếu có) — dùng để "gửi cho mọi người trừ người này".
 * - `JSON.stringify(payload)` MỘT lần, gửi cùng chuỗi đó cho mọi client.
 *
 * @param {Iterable<{readyState: number, send: (data: string) => void}>} clients
 * @param {object} payload
 * @param {object | null} [except=null]
 * @returns {number}
 */
export function broadcast(clients, payload, except = null) {
  // TODO: duyệt clients, kiểm tra readyState và except, gọi send, đếm
  throw new Error('TODO: viết broadcast');
}

/**
 * Tạo HTTP server (CHƯA listen) cho phòng chat. WebSocket ở đường dẫn `/ws`.
 *
 * HTTP: `GET /` → 200, `text/html; charset=utf-8`, nội dung `public/index.html`; đường dẫn khác → 404.
 *
 * Mỗi kết nối WebSocket bắt đầu ở trạng thái "chưa join". Với mỗi tin nhận được, dùng `parseClientMessage`:
 * - Tin sai → gửi riêng người đó `{ type: 'error', error: <mã lỗi> }`. KHÔNG đóng kết nối, server không sập.
 * - `join`:
 *     đã join rồi → `{ type: 'error', error: 'already_joined' }`;
 *     tên đã có người dùng (so KHÔNG phân biệt hoa thường: "an" trùng "An") → `{ type: 'error', error: 'name_taken' }`;
 *     hợp lệ → ghi nhận tên, gửi người đó `{ type: 'welcome', name, users }`,
 *              gửi MỌI NGƯỜI KHÁC đã join `{ type: 'joined', name, users }`.
 * - `chat`:
 *     chưa join → `{ type: 'error', error: 'not_joined' }`;
 *     đã join → gửi MỌI NGƯỜI đã join, kể cả người gửi, `{ type: 'chat', from: <tên>, text, ts }`
 *               với `ts = new Date().toISOString()`.
 * - Kết nối đóng (sự kiện `close`): nếu người đó đã join → xoá khỏi phòng, gửi những người còn lại
 *   `{ type: 'left', name, users }`. Chưa join thì không gửi gì.
 * - `users` luôn là mảng tên của những người ĐANG trong phòng, sắp xếp A→Z (`.sort()`).
 * - Chỉ client đã join mới nhận `chat` / `joined` / `left`. Dùng `broadcast` để gửi nhiều người.
 * - Lắng nghe `error` trên từng kết nối để một client lỗi không làm sập server.
 *
 * @returns {http.Server}
 */
export function createChatServer() {
  // TODO: http.createServer(...) + new WebSocketServer({ server, path: '/ws' })
  //       + một Map ws → tên để biết ai đã join
  throw new Error('TODO: viết createChatServer');
}

// ---------- Chạy trực tiếp: npm start (đã viết sẵn) ----------
function main() {
  const port = Number(process.env.PORT) || 3002;
  const server = createChatServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`TeamPulse chat: http://127.0.0.1:${port}  — mở 2 tab để chat với chính mình`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
