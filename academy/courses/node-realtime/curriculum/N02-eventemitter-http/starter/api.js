/**
 * TeamPulse — Bài N02: EventEmitter & REST API tin nhắn bằng module http (không framework).
 *
 * API cần có:
 *   GET  /health               → 200 {"ok": true}
 *   GET  /messages?since=<id>  → 200 {"messages": [...]}   (tin có id > since)
 *   POST /messages             → 201 <tin vừa tạo>          body: {"user": "an", "text": "Chào"}
 *
 * Chạy thử:   npm start      (server ở http://127.0.0.1:3000)
 *             curl -i http://127.0.0.1:3000/health
 * Chạy test:  node --test "../../curriculum/N02-eventemitter-http/tests/*.test.js"
 */
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const MAX_TEXT = 500;

/**
 * Tạo lỗi mang mã HTTP (đã viết sẵn). Ví dụ: throw httpError(400, 'Thiếu user')
 * @param {number} status
 * @param {string} message
 */
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Phòng chat lưu tin trong bộ nhớ và phát sự kiện 'message' mỗi khi có tin mới. */
export class ChatRoom extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
    this.nextId = 1;
  }

  /**
   * Thêm một tin mới và trả về tin đó.
   *
   * - `user` và `text` phải là chuỗi, sau khi trim còn ít nhất 1 ký tự;
   *   nếu không → ném `httpError(400, ...)` (lỗi có `status === 400`).
   * - `text` (sau trim) dài quá `MAX_TEXT` ký tự → ném `httpError(400, ...)`.
   * - Tin tạo ra: `{ id, user, text, ts }` — `id` lấy từ `this.nextId` (1, 2, 3...) rồi tăng lên,
   *   `user`/`text` đã trim, `ts` là `new Date().toISOString()`.
   * - Lưu tin vào `this.messages`, rồi phát sự kiện `'message'` với đối số là tin đó.
   * - Dữ liệu không hợp lệ thì KHÔNG lưu, KHÔNG phát sự kiện, KHÔNG tăng id.
   *
   * @param {unknown} user
   * @param {unknown} text
   * @returns {{id: number, user: string, text: string, ts: string}}
   */
  post(user, text) {
    // TODO: kiểm tra typeof + trim, tạo object tin, push, this.emit(...)
    throw new Error('TODO: viết ChatRoom.post');
  }

  /**
   * Trả về MẢNG MỚI gồm các tin có `id > sinceId`, theo thứ tự id tăng dần.
   * Mặc định `sinceId = 0` → mọi tin. Sửa mảng trả về không được ảnh hưởng `this.messages`.
   *
   * @param {number} [sinceId=0]
   */
  history(sinceId = 0) {
    // TODO: duyệt this.messages, giữ tin có id > sinceId
    throw new Error('TODO: viết ChatRoom.history');
  }
}

/**
 * Gửi `data` dạng JSON với mã trạng thái `status` rồi kết thúc response.
 *
 * - Header `Content-Type` đúng là `application/json; charset=utf-8`.
 * - Body là `JSON.stringify(data)`.
 *
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
export function sendJson(res, status, data) {
  // TODO: res.writeHead(...) rồi res.end(...)
  throw new Error('TODO: viết sendJson');
}

/**
 * Đọc toàn bộ body của request và parse JSON. Trả về Promise của object.
 *
 * - `req` là một stream: dữ liệu đến thành nhiều mẩu (Buffer). Gom đủ rồi mới parse.
 * - Tổng số byte vượt `limit` → ném `httpError(413, ...)`.
 * - Body rỗng hoặc JSON hỏng → ném `httpError(400, ...)`.
 * - JSON hợp lệ nhưng không phải object thường (vd. mảng, số, `null`) → ném `httpError(400, ...)`.
 *
 * @param {AsyncIterable<Buffer>} req
 * @param {number} [limit=10000]
 * @returns {Promise<object>}
 */
export async function readJsonBody(req, limit = 10_000) {
  // TODO: for await (const chunk of req) { ... } rồi Buffer.concat(...).toString('utf8')
  throw new Error('TODO: viết readJsonBody');
}

/**
 * Tạo HTTP server (CHƯA listen) phục vụ API tin nhắn của `room`.
 *
 * - `GET /health` → 200 `{ ok: true }`.
 * - `GET /messages` → 200 `{ messages: room.history(since) }`; `since` lấy từ query `?since=`,
 *   thiếu hoặc không phải số → 0.
 * - `POST /messages` → đọc body bằng `readJsonBody`, gọi `room.post(body.user, body.text)`,
 *   trả 201 kèm tin vừa tạo.
 * - Đường dẫn `/messages` với method khác GET/POST → 405 và header `Allow: GET, POST`.
 * - Đường dẫn khác → 404.
 * - Lỗi có `err.status` (400, 413...) → trả đúng mã đó; lỗi khác → 500.
 * - MỌI response lỗi (4xx/5xx) là JSON dạng `{ error: "<mô tả>" }`, dùng `sendJson`.
 * - Query string không tính vào đường dẫn: `/messages?since=2` vẫn là route `/messages`.
 *
 * @param {ChatRoom} room
 * @returns {http.Server}
 */
export function createApp(room) {
  // TODO: return http.createServer(async (req, res) => { ... })
  throw new Error('TODO: viết createApp');
}

// ---------- Chạy trực tiếp: npm start (đã viết sẵn) ----------
function main() {
  const room = new ChatRoom();
  room.on('message', (m) => console.log(`[sự kiện message] #${m.id} ${m.user}: ${m.text}`));
  const server = createApp(room);
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '127.0.0.1', () => {
    console.log(`TeamPulse API chạy ở http://127.0.0.1:${port}  (Ctrl+C để dừng)`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
