/**
 * TeamPulse — Bài N14: đăng nhập bằng mật khẩu, phiên (session) lưu trong PostgreSQL, và dùng CHÍNH phiên đó
 * cho REST (app N11) lẫn handshake WebSocket (chat N13). Đây là app TeamPulse đầy đủ của P3.
 *
 *   POST /api/register {username, password}  → 201 {user}        | 400 validation_failed | 409 username_taken
 *   POST /api/login    {username, password}  → 200 {user} + Set-Cookie tp_session=...; HttpOnly; Secure; SameSite=Lax
 *                                             | 400 validation_failed | 401 bad_credentials | 429 too_many_attempts
 *   POST /api/logout                          → 204, xoá phiên, đóng mọi WebSocket của phiên (4001 logged_out)
 *   GET  /api/me                              → 200 {user} | 401 not_logged_in
 *   GET  /health                              → 200 {ok: true} (không cần đăng nhập)
 *   Mọi route REST của N11 (/channels...)     → như N11, nhưng chưa đăng nhập → 401 not_logged_in;
 *                                               POST tin: author = username của phiên
 *   GET  /ws (Upgrade)                        → 101 nếu cookie tp_session hợp lệ và Origin được phép; 401/403/404 nếu không.
 *                                               Sau đó là giao thức chat của N13 (hello → synced, chat → ack), tên lấy từ phiên.
 *   Request ghi (không phải GET/HEAD) có Origin lạ → 403 bad_origin.
 *
 * Chạy thử:   npm start     → http://127.0.0.1:3114 (PGlite ./.pgdata, hoặc Postgres thật nếu có DATABASE_URL)
 *             npm run demo  → kịch bản: đăng ký, sai mật khẩu, khóa tạm, đăng nhập, REST, WebSocket, đăng xuất
 * Kiểm kiểu:  npm run typecheck
 * Chạy test:  npm test
 * Chạy riêng một nhóm test (vd. tên chứa "verifyPassword"):
 *   node --test --test-name-pattern="verifyPassword" "../../curriculum/N14-dang-nhap-session-jwt/tests/*.test.js"
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import express from 'express';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { createApp, errorHandler, HttpError, validate } from './app.ts';
import { attachChat, withBroadcast, type ChatSocket } from './chat-store.ts';
import type { Db } from './db.ts';
import { createPgStore } from './store.ts';

export const SESSION_COOKIE = 'tp_session';
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
export const KEY_LEN = 64;

/** (Đã viết sẵn) Mã băm hợp lệ của một mật khẩu không ai dùng — để so khi KHÔNG tìm thấy user (chống đo thời gian). */
export const DUMMY_HASH = 'scrypt$16384$8$1$Qf-nqLaMdUxayCsdbFwe6g$6ISNjV12ePCUiUFEHKA9JosPIcKrNfP1xELkfCkw7EGYri6Ix7nkHC2vPTGczyVZkxgBxuufebKdSNQ39MSj3Q';

/** (Đã viết sẵn) scrypt dạng Promise: không chặn event loop trong lúc băm (~20–50 ms). */
export function scryptAsync(password: string, salt: Buffer, keyLen: number, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLen, { ...params, maxmem: 256 * params.N * params.r }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** (Đã viết sẵn) Đọc một cookie từ header `cookie` dạng `a=1; tp_session=...; b=2` (cắt ở dấu `=` đầu tiên). */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const piece of header.split(';')) {
    const eq = piece.indexOf('=');
    if (eq === -1) continue;
    if (piece.slice(0, eq).trim() === name) return piece.slice(eq + 1).trim();
  }
  return null;
}

/** (Đã viết sẵn) Từ chối request nâng cấp bằng HTTP thường rồi đóng socket TCP — như N07. */
export function rejectUpgrade(socket: Duplex, status: 401 | 403 | 404, error: string) {
  const reason = { 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' }[status];
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify({ error })}`);
}

/** (Đã viết sẵn) Dữ liệu đăng ký/đăng nhập. Kiểm bằng `validate(Credentials, req.body, 'body')` của N11. */
export const Credentials = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,32}$/, 'chỉ gồm A-Z, a-z, 0-9, _, dài 3–32'),
  password: z.string().min(8).max(200),
});

/**
 * Băm mật khẩu để LƯU. Trả chuỗi `scrypt$N$r$p$<salt>$<hash>`:
 * - `salt`: 16 byte NGẪU NHIÊN, mới mỗi lần gọi → cùng mật khẩu băm hai lần ra hai chuỗi khác nhau.
 * - `hash`: kết quả `scryptAsync` (có sẵn) với salt đó, độ dài `KEY_LEN` (64 byte) và tham số `SCRYPT_PARAMS`.
 * - salt và hash viết bằng base64url; N, r, p là số trong `SCRYPT_PARAMS` (16384, 8, 1).
 * Ghi tham số vào chuỗi để sau này tăng N mà mã băm cũ vẫn kiểm được.
 */
export async function hashPassword(password: string): Promise<string> {
  // TODO: tạo salt mới, băm bằng scryptAsync, ghép thành chuỗi 6 phần theo docstring
  throw new Error('TODO: viết hashPassword');
}

/**
 * Kiểm mật khẩu với chuỗi đã lưu. KHÔNG BAO GIỜ ném lỗi — chuỗi lưu hỏng thì trả `false`.
 * - Tách `stored` theo `$`: phải đúng 6 phần, phần đầu là `'scrypt'`, N/r/p là số nguyên dương, salt và hash không rỗng.
 * - Băm lại `password` với ĐÚNG salt và N/r/p ĐỌC TỪ CHUỖI (không dùng SCRYPT_PARAMS), độ dài = độ dài hash đã lưu.
 * - So hai Buffer bằng `timingSafeEqual` (khác độ dài → `false`, không gọi timingSafeEqual).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // TODO: tách và kiểm từng phần; băm lại với tham số đọc từ chuỗi; so an toàn; mọi lỗi → false
  throw new Error('TODO: viết verifyPassword');
}

export interface Session {
  sessionId: string;
  userId: number;
  username: string;
  expiresAt: Date;
}

/**
 * Tạo phiên đăng nhập cho `userId`, lưu một dòng vào bảng `sessions` (migrations/004_auth.sql).
 * - `id`: 32 byte ngẫu nhiên từ `node:crypto`, viết base64url (43 ký tự, không đoán được). Không dùng Math.random.
 * - `expiresAt`: thời điểm `now()` cộng `ttlSec` GIÂY (Date); `ttlSec` mặc định 7 ngày.
 * - Trả `{ id, expiresAt }`.
 */
export async function createSession(
  db: Db,
  userId: number,
  { ttlSec = 7 * 24 * 3600, now = Date.now }: { ttlSec?: number; now?: () => number } = {},
): Promise<{ id: string; expiresAt: Date }> {
  // TODO: tạo id ngẫu nhiên, tính hạn từ now() và ttlSec, lưu vào bảng sessions, trả { id, expiresAt }
  throw new Error('TODO: viết createSession');
}

/**
 * Tìm phiên còn hạn theo id (giá trị cookie). KHÔNG ném lỗi với đầu vào lạ.
 * - `sessionId` không phải chuỗi hoặc rỗng → `null` (không cần hỏi DB).
 * - Lấy phiên kèm tên người dùng (`users.name`). Không có dòng → `null`.
 * - Hết hạn theo đồng hồ `now()` được truyền vào (`now() >= expires_at`; không dùng now() của SQL) → XOÁ dòng đó rồi trả `null`.
 * - Còn hạn → `{ sessionId, userId, username, expiresAt }`: `userId` là number (đổi bằng `Number(...)` — `pg`
 *   trả kiểu bigint là chuỗi), `expiresAt` là `Date`.
 */
export async function findSession(db: Db, sessionId: unknown, { now = Date.now }: { now?: () => number } = {}): Promise<Session | null> {
  // TODO: kiểm kiểu đầu vào; đọc phiên kèm tên người dùng; hết hạn → xoá rồi null; còn hạn → Session
  throw new Error('TODO: viết findSession');
}

export interface LoginLimiter {
  /** Ghi nhận MỘT lần thử đăng nhập của `key` và cho biết lần thử này có được phép không. */
  hit(key: string): { ok: true } | { ok: false; retryAfterSec: number };
  /** Xoá đếm của `key` (gọi khi đăng nhập đúng). */
  reset(key: string): void;
}

/**
 * Giới hạn số lần THỬ đăng nhập, lưu trong bộ nhớ (Map), theo "cửa sổ cố định" tính từ lần thử ĐẦU TIÊN:
 * - `hit(key)` vừa kiểm vừa đếm trong MỘT bước, không có `await` ở giữa (nên request song song không lách được):
 *   - Cửa sổ của key đã qua (`now() - firstAt >= windowMs`) hoặc chưa có → bắt đầu cửa sổ mới tại `now()`.
 *   - Trong cửa sổ, đã có `max` lần thử được phép → `{ ok: false, retryAfterSec }` và KHÔNG đếm thêm,
 *     `retryAfterSec = Math.ceil((firstAt + windowMs - now()) / 1000)`.
 *   - Còn lại → đếm thêm 1 lần, trả `{ ok: true }`.
 * - `reset(key)`: xoá đếm của key.
 * Mặc định `max = 5`, `windowMs = 15 phút`. Mỗi key đếm riêng.
 */
export function createLoginLimiter(
  { max = 5, windowMs = 15 * 60_000, now = Date.now }: { max?: number; windowMs?: number; now?: () => number } = {},
): LoginLimiter {
  // TODO: một Map<key, {count, firstAt}> trong closure; trả object { hit, reset }
  throw new Error('TODO: viết createLoginLimiter');
}

/** Kết nối WebSocket đã đăng nhập: `user` (của N13) = username của phiên, kèm id phiên để logout đóng được. */
interface AuthSocket extends ChatSocket {
  sessionId?: string;
}

export interface AuthServerOptions {
  db: Db;
  allowedOrigins: string[];
  now?: () => number;
  limiter?: LoginLimiter;
  sessionTtlSec?: number;
}

/**
 * HTTP server (CHƯA listen) của TeamPulse: REST N11 + chat WebSocket N13 + đăng nhập, dùng CHUNG một phiên.
 *
 * Express (theo thứ tự middleware):
 * 1. Chống CSRF: request KHÔNG phải GET/HEAD có header `origin` không nằm trong `allowedOrigins`
 *    → 403 `{error:'bad_origin'}`, không làm gì thêm. Không có `origin` (curl, app mobile) → cho qua.
 * 2. Đọc body JSON (giới hạn 16kb như N11).
 * 3. `POST /api/register`: kiểm body bằng `validate(Credentials, req.body, 'body')` của N11 (sai → 400
 *    `validation_failed` kèm `details`). Username đổi về chữ thường. Lưu tên (cột `users.name`) + mã băm
 *    (`password_hash`, từ `hashPassword`) trong MỘT câu INSERT chống trùng theo tên; tên đã có (kể cả người dùng
 *    cũ từ N13 chưa có mật khẩu) → 409 `{error:'username_taken'}`. KHÔNG lưu mật khẩu gốc.
 *    → 201 `{user: {id, username}}`, `id` là number.
 * 4. `POST /api/login`: kiểm body như trên. key = username chữ thường.
 *    - `limiter.hit(key)` bị chặn → 429 `{error:'too_many_attempts'}` + header `Retry-After: <retryAfterSec>`,
 *      KHÔNG kiểm mật khẩu. Gọi `hit` TRƯỚC mọi `await` trong route (mỗi lần thử được đếm ngay).
 *    - Không có user, hoặc user chưa có mật khẩu (`password_hash` NULL) → vẫn chạy `verifyPassword(password, DUMMY_HASH)`.
 *      Sai user HAY sai mật khẩu → cùng 401 `{error:'bad_credentials'}`.
 *    - Đúng → `limiter.reset(key)`, `createSession(db, userId, {ttlSec: sessionTtlSec, now})`, đặt cookie
 *      `tp_session=<id>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<sessionTtlSec>` → 200 `{user: {id, username}}`.
 *      Response không chứa password_hash.
 * 5. `POST /api/logout`: có cookie → xoá dòng session, đóng mọi WebSocket mở bằng phiên đó với code 4001,
 *    reason `'logged_out'`. Luôn xoá cookie (cùng Path/HttpOnly/Secure/SameSite như khi đặt) → 204.
 * 6. `GET /api/me`: `findSession` theo cookie → 200 `{user: {id, username}}`, không có → 401 `{error:'not_logged_in'}`.
 * 7. Mọi đường dẫn còn lại TRỪ `GET /health`: phải có phiên còn hạn, không có → 401 `{error:'not_logged_in'}`.
 *    `POST /channels/:id/messages`: `author` trong body bị thay bằng username của phiên (không tin client).
 * 8. App REST của N11 nhận store Postgres đã bọc `withBroadcast` bằng hub của N13 (tin POST qua REST tới WebSocket ngay;
 *    đường dẫn lạ → 404 `not_found` của N11).
 * 9. `errorHandler` của N11 ở CUỐI: lỗi `validate` → 400, JSON hỏng → 400 `bad_json`, lỗi khác → 500 `internal`.
 *
 * WebSocket (sự kiện `upgrade` của server, `WebSocketServer({ noServer: true })` — như N07):
 * - `hub = attachChat(wss, db)` (N13) gắn giao thức chat cho mọi kết nối của `wss`.
 * - Đường dẫn khác `/ws` → `rejectUpgrade(socket, 404, 'not_found')`.
 * - Có `origin` không nằm trong `allowedOrigins` → 403 `bad_origin` (kể cả cookie đúng).
 * - Không có phiên còn hạn theo cookie `tp_session` (hoặc DB lỗi) → 401 `not_logged_in`.
 * - Hợp lệ → nâng cấp; gán `ws.user = username của phiên` và id phiên TRƯỚC khi phát sự kiện `connection` (để N13
 *   lấy tên từ phiên, bỏ qua `user` client tự khai trong hello); nhớ kết nối theo id phiên để logout đóng được.
 * Mặc định: `now = Date.now`, `limiter = createLoginLimiter({ now })`, `sessionTtlSec = 7 ngày`.
 */
export function createAuthServer({
  db,
  allowedOrigins,
  now = Date.now,
  limiter = createLoginLimiter({ now }),
  sessionTtlSec = 7 * 24 * 3600,
}: AuthServerOptions): http.Server {
  // Khung gợi ý — làm lần lượt Bước 6a → 7b trong bài (xoá dòng throw khi bắt đầu viết):
  //
  // - Chuẩn bị: bộ thuộc tính cookie dùng chung cho lúc đặt và lúc xoá; một Map id phiên → các WebSocket của phiên;
  //   WebSocketServer kiểu noServer và hub chat của N13; một app Express.
  // - Bước 6a: middleware chặn Origin lạ cho request ghi; đọc body JSON.
  // - Bước 6b: route đăng ký.
  // - Bước 6c: route đăng nhập (giới hạn lần thử → tra user → kiểm mật khẩu → tạo phiên → cookie).
  // - Bước 6d: route /api/me và đăng xuất.
  // - Bước 6e: middleware bắt đăng nhập cho phần còn lại (trừ GET /health) + ghi đè author; gắn app N11; errorHandler cuối.
  // - Bước 7a: http server từ app; sự kiện upgrade: đường dẫn → Origin → phiên; sai thì rejectUpgrade.
  // - Bước 7b: nâng cấp, gắn tên và id phiên lên kết nối, nhớ kết nối theo phiên, rồi phát sự kiện connection.
  // - Đóng server thì đóng luôn WebSocketServer; trả server (chưa listen).
  throw new Error('TODO: viết createAuthServer');
}
