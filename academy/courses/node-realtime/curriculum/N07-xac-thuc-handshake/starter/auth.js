/**
 * TeamPulse — Bài N07: xác thực ngay ở bước handshake WebSocket.
 *
 * Token tự ký bằng HMAC-SHA256 (node:crypto, không thêm thư viện):
 *     token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, phần trước dấu chấm))
 *     payload = { sub: 'an', rooms: ['general', 'dev'], exp: <giây Unix> }
 *
 * Kết nối WebSocket chỉ được nâng cấp (101) khi Origin được phép và token hợp lệ;
 * sai thì trả 401/403 bằng HTTP thường rồi đóng socket — chưa tạo kết nối WebSocket nào.
 *
 *   Client → server                          Server → client
 *   {type:"chat", room:"dev", text:"..."}    {type:"chat", room, from, text}     (mọi người có quyền ở room)
 *                                            {type:"error", error:"forbidden"}    (không có quyền ở room)
 *                                            {type:"error", error:"token_expired"} rồi đóng code 4001
 *
 * Chạy thử:   npm start   → server ws://127.0.0.1:3007/ws, in token mẫu
 *             npm run demo → chạy các kịch bản: không token, sai Origin, sai room, token hết hạn
 * Chạy test:  node --test "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

export const OPEN = 1;

/**
 * Ký token. `payload` là object (vd. `{ sub: 'an', rooms: ['general'] }`).
 *
 * - Thêm trường `exp = Math.floor(now() / 1000) + ttlSec` (giây Unix) vào BẢN SAO của payload.
 * - `body = Buffer.from(JSON.stringify(payloadCóExp)).toString('base64url')`
 * - `sig  = createHmac('sha256', secret).update(body).digest('base64url')`
 * - Trả `body + '.' + sig`.
 *
 * @param {object} payload
 * @param {string} secret
 * @param {{ttlSec?: number, now?: () => number}} [options]  now() trả mili giây như Date.now
 * @returns {string}
 */
export function signToken(payload, secret, { ttlSec = 3600, now = Date.now } = {}) {
  // TODO: thêm exp, base64url phần JSON, ký HMAC, nối bằng dấu chấm
  throw new Error('TODO: viết signToken');
}

/**
 * Kiểm tra token. KHÔNG BAO GIỜ ném lỗi.
 *
 * Trả `{ ok: true, user }` (user = payload đã giải mã, gồm cả `exp`) hoặc `{ ok: false, error }`:
 * - `'malformed'`     — không phải chuỗi; không có đúng 2 phần ngăn bởi `.`; một trong hai phần rỗng;
 *                      hoặc (sau khi chữ ký đúng) body không `JSON.parse` được, hay parse ra thứ không phải
 *                      object thường (mảng, `null`, số, chuỗi...).
 * - `'bad_signature'` — chữ ký không khớp. So sánh bằng `timingSafeEqual` (độ dài khác nhau → coi là sai luôn).
 * - `'expired'`       — `exp` không phải số, hoặc `now() >= exp × 1000`.
 * Thứ tự kiểm tra: tách 2 phần → chữ ký → giải mã body → hạn dùng.
 *
 * @param {unknown} token
 * @param {string} secret
 * @param {{now?: () => number}} [options]
 * @returns {{ok: true, user: {sub: string, rooms: string[], exp: number}} | {ok: false, error: string}}
 */
export function verifyToken(token, secret, { now = Date.now } = {}) {
  // TODO: split('.'), tính lại chữ ký, timingSafeEqual, JSON.parse trong try/catch, kiểm tra exp
  throw new Error('TODO: viết verifyToken');
}

/**
 * Quyết định có cho request nâng cấp WebSocket đi tiếp không. KHÔNG ném lỗi.
 *
 * `req` có `req.headers` (khóa chữ thường như của Node). Theo thứ tự:
 * 1. Origin: nếu có header `origin` mà KHÔNG nằm trong `allowedOrigins` → `{ ok: false, status: 403, error: 'bad_origin' }`.
 *    Không có header `origin` (client không phải trình duyệt) → cho qua bước này.
 * 2. Lấy token: header `authorization: Bearer <token>` trước; không có thì cookie `tp_token=<token>`
 *    trong header `cookie` (dạng `a=1; tp_token=...; b=2`). Không có token → `{ ok: false, status: 401, error: 'no_token' }`.
 *    KHÔNG đọc token từ query string (`?token=`): URL hay bị ghi vào log.
 * 3. `verifyToken(token, secret, { now })` sai → `{ ok: false, status: 401, error: <mã lỗi của verifyToken> }`.
 * 4. Hợp lệ → `{ ok: true, user }`.
 *
 * @param {{headers: Record<string, string | undefined>}} req
 * @param {{secret: string, allowedOrigins: string[], now?: () => number}} options
 * @returns {{ok: true, user: object} | {ok: false, status: 401 | 403, error: string}}
 */
export function authenticateUpgrade(req, { secret, allowedOrigins, now = Date.now }) {
  // TODO: kiểm tra origin, tìm token ở authorization rồi cookie, gọi verifyToken
  throw new Error('TODO: viết authenticateUpgrade');
}

/**
 * HTTP server (CHƯA listen) có WebSocket ở đường dẫn `/ws`, xác thực trước khi nâng cấp.
 *
 * - Request HTTP thường → 404.
 * - Sự kiện `upgrade` của server: đường dẫn khác `/ws` → trả `HTTP/1.1 404 Not Found` rồi đóng socket.
 *   Gọi `authenticateUpgrade`; sai → ghi thẳng ra socket một response HTTP
 *   `HTTP/1.1 <status> <Unauthorized|Forbidden>\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"error":"<mã>"}`
 *   bằng `socket.end(response)` — gửi hết rồi mới đóng (đừng `write` rồi `destroy()` ngay: có thể mất response). Đúng → `wss.handleUpgrade(...)` (wss tạo với `noServer: true`), gắn `ws.user = user`.
 * - Tin từ client: `{type: 'chat', room, text}` (JSON hỏng / sai dạng → `{type:'error', error:'bad_message'}`).
 *   1. Token hết hạn giữa chừng (`now() >= ws.user.exp × 1000`) → gửi `{type:'error', error:'token_expired'}`
 *      rồi `ws.close(4001, 'token_expired')`. Kiểm tra mỗi khi nhận tin.
 *   2. `room` không nằm trong `ws.user.rooms` → `{type:'error', error:'forbidden'}`, không gửi cho ai.
 *   3. Hợp lệ → gửi `{type:'chat', room, from: ws.user.sub, text}` cho MỌI kết nối OPEN có quyền ở `room`
 *      (gồm người gửi).
 *
 * @param {{secret: string, allowedOrigins: string[], now?: () => number}} options
 * @returns {http.Server}
 */
export function createAuthServer({ secret, allowedOrigins, now = Date.now }) {
  // TODO: http.createServer, new WebSocketServer({ noServer: true }), server.on('upgrade', ...)
  throw new Error('TODO: viết createAuthServer');
}

// ---------- Chạy trực tiếp: npm start (đã viết sẵn) ----------
function main() {
  const port = Number(process.env.PORT) || 3007;
  const secret = process.env.TP_SECRET || 'doi-secret-nay-o-production';
  const allowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const server = createAuthServer({ secret, allowedOrigins });
  server.listen(port, '127.0.0.1', () => {
    const an = signToken({ sub: 'an', rooms: ['general', 'dev'] }, secret, { ttlSec: 3600 });
    const binh = signToken({ sub: 'binh', rooms: ['general'] }, secret, { ttlSec: 60 });
    console.log(`TeamPulse auth: ws://127.0.0.1:${port}/ws`);
    console.log(`Token An   (general, dev; 1 giờ):  ${an}`);
    console.log(`Token Binh (general; 60 giây):     ${binh}`);
    console.log('Kịch bản thử tự động (401, 403, forbidden, hết hạn): npm run demo');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
