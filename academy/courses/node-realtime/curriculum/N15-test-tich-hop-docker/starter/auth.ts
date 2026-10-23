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
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

/**
 * Kiểm mật khẩu với chuỗi đã lưu. KHÔNG BAO GIỜ ném lỗi — chuỗi lưu hỏng thì trả `false`.
 * - Tách `stored` theo `$`: phải đúng 6 phần, phần đầu là `'scrypt'`, N/r/p là số nguyên dương, salt và hash không rỗng.
 * - Băm lại `password` với ĐÚNG salt và N/r/p ĐỌC TỪ CHUỖI (không dùng SCRYPT_PARAMS), độ dài = độ dài hash đã lưu.
 * - So hai Buffer bằng `timingSafeEqual` (khác độ dài → `false`, không gọi timingSafeEqual).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    for (const n of [N, r, p]) {
      if (!Number.isInteger(n) || n <= 0) return false;
    }
    const salt = Buffer.from(parts[4] ?? '', 'base64url');
    const expected = Buffer.from(parts[5] ?? '', 'base64url');
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
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
  const id = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now() + ttlSec * 1000);
  await db.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, expiresAt]);
  return { id, expiresAt };
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
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  const result = await db.query<{ id: string; user_id: number | string; username: string; expires_at: Date }>(
    `SELECT s.id, s.user_id, u.name AS username, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [sessionId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const expiresAt = new Date(row.expires_at);
  if (now() >= expiresAt.getTime()) {
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    return null;
  }
  return { sessionId: row.id, userId: Number(row.user_id), username: row.username, expiresAt };
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
  const attempts = new Map<string, { count: number; firstAt: number }>();
  return {
    hit(key) {
      const t = now();
      const entry = attempts.get(key);
      if (entry === undefined || t - entry.firstAt >= windowMs) {
        attempts.set(key, { count: 1, firstAt: t });
        return { ok: true };
      }
      if (entry.count >= max) {
        return { ok: false, retryAfterSec: Math.ceil((entry.firstAt + windowMs - t) / 1000) };
      }
      entry.count += 1;
      return { ok: true };
    },
    reset(key) {
      attempts.delete(key);
    },
  };
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
 * 8. App REST của N11: `createApp(withBroadcast(createPgStore(db), hub))` (tin POST qua REST tới WebSocket ngay;
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
  const cookieOptions = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' as const };
  const socketsBySession = new Map<string, Set<AuthSocket>>();
  const wss = new WebSocketServer({ noServer: true });
  const hub = attachChat(wss, db);
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin !== undefined && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'bad_origin' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.post('/api/register', async (req, res) => {
    const { username: raw, password } = validate(Credentials, req.body, 'body');
    const username = raw.toLowerCase();
    const passwordHash = await hashPassword(password);
    const result = await db.query<{ id: number | string; name: string }>(
      `INSERT INTO users (name, password_hash) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING RETURNING id, name`,
      [username, passwordHash],
    );
    const row = result.rows[0];
    if (row === undefined) throw new HttpError(409, { error: 'username_taken' });
    res.status(201).json({ user: { id: Number(row.id), username: row.name } });
  });

  app.post('/api/login', async (req, res) => {
    const { username: raw, password } = validate(Credentials, req.body, 'body');
    const username = raw.toLowerCase();
    const allowed = limiter.hit(username);
    if (!allowed.ok) {
      res.set('Retry-After', String(allowed.retryAfterSec)).status(429).json({ error: 'too_many_attempts' });
      return;
    }
    const found = await db.query<{ id: number | string; name: string; password_hash: string | null }>(
      'SELECT id, name, password_hash FROM users WHERE name = $1',
      [username],
    );
    const user = found.rows[0];
    const stored = user?.password_hash ?? null;
    const ok = await verifyPassword(password, stored ?? DUMMY_HASH);
    if (user === undefined || stored === null || !ok) {
      throw new HttpError(401, { error: 'bad_credentials' });
    }
    limiter.reset(username);
    const session = await createSession(db, Number(user.id), { ttlSec: sessionTtlSec, now });
    res.cookie(SESSION_COOKIE, session.id, { ...cookieOptions, maxAge: sessionTtlSec * 1000 });
    res.json({ user: { id: Number(user.id), username: user.name } });
  });

  app.post('/api/logout', async (req, res) => {
    const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (sessionId) {
      await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      for (const ws of socketsBySession.get(sessionId) ?? []) ws.close(4001, 'logged_out');
      socketsBySession.delete(sessionId);
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  });

  app.get('/api/me', async (req, res) => {
    const session = await findSession(db, readCookie(req.headers.cookie, SESSION_COOKIE), { now });
    if (session === null) throw new HttpError(401, { error: 'not_logged_in' });
    res.json({ user: { id: session.userId, username: session.username } });
  });

  app.use(async (req, res, next) => {
    if (req.method === 'GET' && req.path === '/health') {
      next();
      return;
    }
    const session = await findSession(db, readCookie(req.headers.cookie, SESSION_COOKIE), { now });
    if (session === null) throw new HttpError(401, { error: 'not_logged_in' });
    if (req.method === 'POST' && /^\/channels\/[^/]+\/messages\/?$/.test(req.path)) {
      const body: unknown = req.body;
      if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
        (body as Record<string, unknown>).author = session.username;
      }
    }
    next();
  });
  app.use(createApp(withBroadcast(createPgStore(db), hub)));
  app.use(errorHandler);

  const server = http.createServer(app);

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') {
      rejectUpgrade(socket, 404, 'not_found');
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      rejectUpgrade(socket, 403, 'bad_origin');
      return;
    }
    let session: Session | null = null;
    try {
      session = await findSession(db, readCookie(req.headers.cookie, SESSION_COOKIE), { now });
    } catch {
      session = null;
    }
    if (session === null) {
      rejectUpgrade(socket, 401, 'not_logged_in');
      return;
    }
    const { sessionId, username } = session;
    wss.handleUpgrade(req, socket, head, (ws: AuthSocket) => {
      ws.user = username;
      ws.sessionId = sessionId;
      let set = socketsBySession.get(sessionId);
      if (set === undefined) {
        set = new Set();
        socketsBySession.set(sessionId, set);
      }
      const mine = set;
      mine.add(ws);
      ws.on('close', () => mine.delete(ws));
      wss.emit('connection', ws, req);
    });
  });

  server.on('close', () => wss.close());
  return server;
}
