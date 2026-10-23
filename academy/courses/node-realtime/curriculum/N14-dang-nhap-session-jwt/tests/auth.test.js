// Test tự chấm cho bài N14. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// PostgreSQL trong tiến trình (PGlite) với migration 001→004; đồng hồ giả (now); server listen cổng 0 trên 127.0.0.1, đóng trong after().
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { WebSocket } from 'ws';

const load = (file) => import(pathToFileURL(join(process.cwd(), file)).href);
const { hashPassword, verifyPassword, createSession, findSession, createLoginLimiter, createAuthServer } = await load('auth.ts');
const { migrate } = await load('migrate.ts');
const { createPgStore } = await load('store.ts');

const db = new PGlite();
const T0 = Date.UTC(2026, 9, 23, 8, 0, 0);
const ORIGIN = 'http://127.0.0.1:3114';
const PASSWORD = 'mat-khau-dai-123';
const cleanups = [];
before(async () => {
  await migrate(db, join(process.cwd(), 'migrations'));
});
after(async () => {
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* dọn tiếp */ }
  }
  await db.close();
});

let seq = 0;
async function insertUser(name = `u${++seq}`, passwordHash = 'x') {
  const r = await db.query('INSERT INTO users (name, password_hash) VALUES ($1, $2) RETURNING id', [name, passwordHash]);
  return Number(r.rows[0].id);
}

// ---------- hashPassword / verifyPassword ----------

test('hashPassword: scrypt$N$r$p$salt$hash, salt ngẫu nhiên, không chứa mật khẩu gốc', async () => {
  const h1 = await hashPassword(PASSWORD);
  const h2 = await hashPassword(PASSWORD);
  assert.equal(typeof h1, 'string', 'hashPassword trả Promise<string>');
  const parts = h1.split('$');
  assert.equal(parts.length, 6, `Dạng "scrypt$N$r$p$<salt>$<hash>" (6 phần), nhận: ${h1.slice(0, 40)}`);
  assert.deepEqual(parts.slice(0, 4), ['scrypt', '16384', '8', '1'], 'Phần đầu: scrypt, N=16384, r=8, p=1');
  assert.equal(Buffer.from(parts[4], 'base64url').length, 16, 'salt là 16 byte (base64url)');
  assert.equal(Buffer.from(parts[5], 'base64url').length, 64, 'hash là 64 byte (base64url)');
  const expected = scryptSync(PASSWORD, Buffer.from(parts[4], 'base64url'), 64, { N: 16384, r: 8, p: 1 }).toString('base64url');
  assert.equal(parts[5], expected, 'hash = scrypt(password, salt, 64, {N, r, p})');
  assert.notEqual(h1, h2, 'Cùng mật khẩu băm hai lần phải ra hai chuỗi khác nhau (salt mới mỗi lần)');
  assert.ok(!h1.includes(PASSWORD), 'Chuỗi lưu không được chứa mật khẩu gốc');
});

test('verifyPassword: đúng → true, sai → false, đọc N/r/p từ chuỗi đã lưu, chuỗi hỏng → false không ném lỗi', async () => {
  const stored = await hashPassword(PASSWORD);
  assert.equal(await verifyPassword(PASSWORD, stored), true, 'Đúng mật khẩu → true');
  assert.equal(await verifyPassword('mat-khau-dai-124', stored), false, 'Sai một ký tự → false');
  const salt = randomBytes(16);
  const old = `scrypt$1024$8$1$${salt.toString('base64url')}$${scryptSync('cu-tu-2024', salt, 32, { N: 1024, r: 8, p: 1 }).toString('base64url')}`;
  assert.equal(await verifyPassword('cu-tu-2024', old), true, 'Mã băm cũ N=1024, hash 32 byte → phải băm lại bằng N và độ dài ĐỌC TỪ CHUỖI');
  for (const bad of ['', 'abc', 'bcrypt$1$2$3$4$5', 'scrypt$16384$8$1$$', 'scrypt$x$8$1$AAAA$BBBB', stored.split('$').slice(0, 5).join('$')]) {
    let r;
    await assert.doesNotReject(async () => { r = await verifyPassword(PASSWORD, bad); }, `verifyPassword(…, ${JSON.stringify(bad.slice(0, 20))}) không được ném lỗi`);
    assert.equal(r, false, `Chuỗi lưu hỏng ${JSON.stringify(bad.slice(0, 20))} → false`);
  }
});

// ---------- createSession / findSession ----------

test('createSession: id ngẫu nhiên 32 byte base64url, lưu vào bảng sessions với expires_at', async () => {
  const uid = await insertUser();
  const s1 = await createSession(db, uid, { ttlSec: 60, now: () => T0 });
  const s2 = await createSession(db, uid, { ttlSec: 60, now: () => T0 });
  assert.match(s1.id, /^[A-Za-z0-9_-]{43}$/, `id = 32 byte ngẫu nhiên viết base64url (43 ký tự), nhận: ${s1.id}`);
  assert.notEqual(s1.id, s2.id, 'Mỗi phiên một id khác nhau');
  assert.equal(s1.expiresAt.getTime(), T0 + 60_000, 'expiresAt = now() + ttlSec × 1000');
  const row = (await db.query('SELECT user_id, expires_at FROM sessions WHERE id = $1', [s1.id])).rows[0];
  assert.ok(row, 'Phiên phải được lưu vào bảng sessions');
  assert.equal(Number(row.user_id), uid, 'sessions.user_id đúng user');
  assert.equal(new Date(row.expires_at).getTime(), T0 + 60_000, 'sessions.expires_at đúng');
  const d = await createSession(db, uid, { now: () => T0 });
  assert.equal(d.expiresAt.getTime(), T0 + 7 * 24 * 3600 * 1000, 'ttlSec mặc định 7 ngày');
});

test('findSession: còn hạn → user (userId là number); hết hạn → null và xoá dòng; id lạ → null', async () => {
  const uid = await insertUser('tim_phien');
  const s = await createSession(db, uid, { ttlSec: 60, now: () => T0 });
  assert.deepEqual(await findSession(db, s.id, { now: () => T0 + 59_000 }),
    { sessionId: s.id, userId: uid, username: 'tim_phien', expiresAt: new Date(T0 + 60_000) }, 'Còn hạn → { sessionId, userId, username, expiresAt }');
  for (const bad of [undefined, null, 42, '', 'khong-co-phien-nay']) {
    assert.equal(await findSession(db, bad, { now: () => T0 }), null, `findSession(${JSON.stringify(bad)}) → null`);
  }
  assert.equal(await findSession(db, s.id, { now: () => T0 + 60_000 }), null, 'now() đúng bằng expires_at → hết hạn → null');
  const left = (await db.query('SELECT count(*)::int AS n FROM sessions WHERE id = $1', [s.id])).rows[0].n;
  assert.equal(left, 0, 'Phiên hết hạn phải bị xoá khỏi bảng');
});

// ---------- createLoginLimiter ----------

test('createLoginLimiter: hit đếm mỗi lần thử, quá max → chặn có retryAfterSec; hết cửa sổ → mở; reset; key độc lập', () => {
  const clock = { t: T0 };
  const lim = createLoginLimiter({ max: 3, windowMs: 60_000, now: () => clock.t });
  assert.deepEqual(lim.hit('an'), { ok: true }, 'Lần thử 1/3 → ok');
  clock.t += 10_000;
  assert.deepEqual(lim.hit('an'), { ok: true }, 'Lần thử 2/3 → ok');
  assert.deepEqual(lim.hit('an'), { ok: true }, 'Lần thử 3/3 → ok');
  assert.deepEqual(lim.hit('an'), { ok: false, retryAfterSec: 50 }, 'Lần thử 4 → chặn; cửa sổ tính từ lần thử ĐẦU (T0), còn 50 giây');
  assert.deepEqual(lim.hit('binh'), { ok: true }, 'Key khác không bị ảnh hưởng');
  clock.t = T0 + 59_500;
  assert.deepEqual(lim.hit('an'), { ok: false, retryAfterSec: 1 }, 'Còn 0,5 giây → retryAfterSec làm tròn LÊN = 1; lần bị chặn không kéo dài cửa sổ');
  clock.t = T0 + 60_000;
  assert.deepEqual(lim.hit('an'), { ok: true }, 'Hết cửa sổ (now - lần thử đầu ≥ windowMs) → cửa sổ mới, lần thử 1');
  lim.hit('an');
  lim.hit('an');
  assert.equal(lim.hit('an').ok, false, 'Cửa sổ mới, quá 3 lần → chặn lại');
  lim.reset('an');
  assert.deepEqual(lim.hit('an'), { ok: true }, 'reset → xoá đếm');
  const def = createLoginLimiter({ now: () => clock.t });
  for (let i = 1; i <= 5; i++) assert.equal(def.hit('x').ok, true, `Mặc định max = 5: lần thử ${i} vẫn ok`);
  assert.deepEqual(def.hit('x'), { ok: false, retryAfterSec: 900 }, 'Mặc định windowMs = 15 phút → 900 giây');
});

// ---------- createAuthServer: REST ----------

async function startAuth(clock, extra = {}) {
  const server = createAuthServer({ db, allowedOrigins: [ORIGIN], now: () => clock.t, ...extra });
  assert.ok(server instanceof http.Server, 'createAuthServer phải trả về http.Server');
  assert.equal(server.listening, false, 'createAuthServer chỉ tạo server, KHÔNG tự listen()');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }));
  const port = server.address().port;
  const call = async (method, path, { body, cookie, origin, raw } = {}) => {
    const headers = {};
    if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(3000),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return { port, call };
}

async function loginCookie(call, username) {
  await call('POST', '/api/register', { body: { username, password: PASSWORD } });
  const r = await call('POST', '/api/login', { body: { username, password: PASSWORD } });
  assert.equal(r.status, 200, `Đăng nhập ${username} phải thành công, nhận ${r.status} ${JSON.stringify(r.json)}`);
  return (r.headers.get('set-cookie') ?? '').split(';')[0];
}

test('createAuthServer: register → 201, trùng → 409, sai dạng → 400 validation_failed (như N11); chỉ lưu mã băm', async () => {
  const { call } = await startAuth({ t: T0 });
  const r = await call('POST', '/api/register', { body: { username: 'Dang_Ky', password: PASSWORD } });
  assert.equal(r.status, 201, `Đăng ký hợp lệ → 201, nhận ${r.status} ${JSON.stringify(r.json)}`);
  assert.deepEqual(r.json, { user: { id: r.json.user.id, username: 'dang_ky' } }, 'Body {user: {id, username}}, username đổi về chữ thường');
  assert.equal(typeof r.json.user.id, 'number', 'user.id là number');
  const dup = await call('POST', '/api/register', { body: { username: 'dang_ky', password: 'khac-hoan-toan' } });
  assert.deepEqual([dup.status, dup.json], [409, { error: 'username_taken' }], 'Username đã có (không phân biệt hoa thường) → 409 username_taken');
  await insertUser('nguoi_cu_n13', null);
  const legacy = await call('POST', '/api/register', { body: { username: 'nguoi_cu_n13', password: PASSWORD } });
  assert.equal(legacy.status, 409, 'Tên đã có trong users (người gửi tin ở N13, chưa có mật khẩu) → cũng 409');
  for (const body of [{ username: 'ab', password: PASSWORD }, { username: 'ok_name', password: 'ngan' }, { username: 'co dau cach', password: PASSWORD }, {}]) {
    const bad = await call('POST', '/api/register', { body });
    assert.equal(bad.status, 400, `${JSON.stringify(body)} → 400`);
    assert.equal(bad.json.error, 'validation_failed', `${JSON.stringify(body)} → { error: "validation_failed", ... } như N11`);
    assert.ok(Array.isArray(bad.json.details) && bad.json.details.length > 0, 'Lỗi 400 có details (mảng {field, message}) như N11');
  }
  const broken = await call('POST', '/api/register', { raw: '{"username": "x"' });
  assert.deepEqual([broken.status, broken.json], [400, { error: 'bad_json' }], 'Body JSON hỏng → 400 bad_json (errorHandler của N11)');
  const row = (await db.query('SELECT password_hash FROM users WHERE name = $1', ['dang_ky'])).rows[0];
  assert.ok(row.password_hash.startsWith('scrypt$'), 'users.password_hash là chuỗi từ hashPassword');
  assert.equal(await verifyPassword(PASSWORD, row.password_hash), true, 'Mã băm lưu trong DB kiểm được bằng verifyPassword');
});

test('createAuthServer: login đúng → cookie HttpOnly; Secure; SameSite=Lax; sai user hay sai mật khẩu → cùng 401', async () => {
  const { call } = await startAuth({ t: T0 });
  await call('POST', '/api/register', { body: { username: 'dang_nhap', password: PASSWORD } });
  await insertUser('chua_co_mk', null);
  const wrongPw = await call('POST', '/api/login', { body: { username: 'dang_nhap', password: 'sai-mat-khau' } });
  const noUser = await call('POST', '/api/login', { body: { username: 'khong_ton_tai', password: 'sai-mat-khau' } });
  const noHash = await call('POST', '/api/login', { body: { username: 'chua_co_mk', password: 'sai-mat-khau' } });
  assert.deepEqual([wrongPw.status, wrongPw.json], [401, { error: 'bad_credentials' }], 'Sai mật khẩu → 401 bad_credentials');
  assert.deepEqual([noUser.status, noUser.json], [401, { error: 'bad_credentials' }], 'User không tồn tại → Y HỆT sai mật khẩu (không lộ user nào có thật)');
  assert.deepEqual([noHash.status, noHash.json], [401, { error: 'bad_credentials' }], 'User chưa có mật khẩu (password_hash NULL) → cũng 401 bad_credentials');
  assert.equal(wrongPw.headers.get('set-cookie'), null, 'Đăng nhập sai không đặt cookie');
  const ok = await call('POST', '/api/login', { body: { username: 'Dang_Nhap', password: PASSWORD } });
  assert.equal(ok.status, 200, `Đăng nhập đúng → 200, nhận ${ok.status} ${JSON.stringify(ok.json)}`);
  assert.deepEqual(ok.json, { user: { id: ok.json.user.id, username: 'dang_nhap' } }, 'Body {user: {id, username}}');
  assert.equal(typeof ok.json.user.id, 'number', 'user.id là number');
  assert.ok(!JSON.stringify(ok.json).includes('scrypt'), 'Response không được chứa password_hash');
  const sc = ok.headers.get('set-cookie') ?? '';
  assert.match(sc, /^tp_session=[A-Za-z0-9_-]{43};/, `Set-Cookie bắt đầu bằng tp_session=<id phiên>, nhận: ${sc}`);
  for (const [attr, label] of [[/;\s*HttpOnly/i, 'HttpOnly'], [/;\s*Secure/i, 'Secure'], [/;\s*SameSite=Lax/i, 'SameSite=Lax'],
    [/;\s*Path=\//i, 'Path=/'], [/;\s*Max-Age=604800/i, 'Max-Age=604800 (7 ngày)']]) {
    assert.match(sc, attr, `Cookie phải có ${label}, nhận: ${sc}`);
  }
  const sid = sc.match(/^tp_session=([^;]+)/)[1];
  assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE id = $1', [sid])).rows[0].n, 1, 'Phiên được lưu trong bảng sessions');
  const bad = await call('POST', '/api/login', { body: { username: 'dang_nhap' } });
  assert.deepEqual([bad.status, bad.json.error], [400, 'validation_failed'], 'Thiếu password → 400 validation_failed');
});

test('createAuthServer: /api/me theo cookie; logout xoá phiên → cookie cũ hết dùng được', async () => {
  const { call } = await startAuth({ t: T0 });
  const cookie = await loginCookie(call, 'dang_xuat');
  const me = await call('GET', '/api/me', { cookie: `theme=dark; ${cookie}` });
  assert.equal(me.status, 200, 'Có cookie phiên → 200');
  assert.deepEqual(me.json, { user: { id: me.json.user.id, username: 'dang_xuat' } }, 'Body {user: {id, username}}');
  const anon = await call('GET', '/api/me');
  assert.deepEqual([anon.status, anon.json], [401, { error: 'not_logged_in' }], 'Không cookie → 401 not_logged_in');
  const out = await call('POST', '/api/logout', { cookie });
  assert.equal(out.status, 204, 'logout → 204');
  const cleared = out.headers.get('set-cookie') ?? '';
  assert.match(cleared, /^tp_session=;/, `logout xoá cookie (tp_session rỗng), nhận: ${cleared}`);
  assert.match(cleared, /Expires=Thu, 01 Jan 1970|Max-Age=0/i, 'Cookie xoá phải hết hạn ngay (res.clearCookie)');
  for (const [attr, label] of [[/;\s*HttpOnly/i, 'HttpOnly'], [/;\s*Secure/i, 'Secure'], [/;\s*SameSite=Lax/i, 'SameSite=Lax'], [/;\s*Path=\//i, 'Path=/']]) {
    assert.match(cleared, attr, `Cookie xoá phải cùng thuộc tính khi đặt (${label}), nhận: ${cleared}`);
  }
  const afterOut = await call('GET', '/api/me', { cookie });
  assert.deepEqual([afterOut.status, afterOut.json], [401, { error: 'not_logged_in' }], 'Sau logout, cookie cũ → 401 (phiên đã xoá trong DB)');
});

test('createAuthServer: quá 5 lần thử → 429 + Retry-After kể cả đúng mật khẩu; 15 phút sau đăng nhập được', async () => {
  const clock = { t: T0 };
  const { call } = await startAuth(clock);
  await call('POST', '/api/register', { body: { username: 'bi_doan', password: PASSWORD } });
  for (let i = 1; i <= 5; i++) {
    const r = await call('POST', '/api/login', { body: { username: 'bi_doan', password: `doan-lan-${i}` } });
    assert.equal(r.status, 401, `Lần sai thứ ${i} → 401`);
  }
  const blocked = await call('POST', '/api/login', { body: { username: 'BI_DOAN', password: PASSWORD } });
  assert.deepEqual([blocked.status, blocked.json], [429, { error: 'too_many_attempts' }], 'Lần 6, dù đúng mật khẩu → 429 too_many_attempts');
  assert.equal(blocked.headers.get('retry-after'), '900', 'Header Retry-After: 900 (giây)');
  assert.equal(blocked.headers.get('set-cookie'), null, 'Bị chặn thì không đặt cookie');
  clock.t += 15 * 60_000;
  const ok = await call('POST', '/api/login', { body: { username: 'bi_doan', password: PASSWORD } });
  assert.equal(ok.status, 200, '15 phút sau → đăng nhập được');
  const again = await call('POST', '/api/login', { body: { username: 'bi_doan', password: 'sai-lan-nua' } });
  assert.equal(again.status, 401, 'Đăng nhập đúng → reset đếm: lần sai kế tiếp chỉ là 401');
});

test('createAuthServer: 10 lần đoán gửi SONG SONG → chỉ tối đa 5 lần được kiểm mật khẩu, còn lại 429', async () => {
  const { call } = await startAuth({ t: T0 });
  await call('POST', '/api/register', { body: { username: 'song_song', password: PASSWORD } });
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    call('POST', '/api/login', { body: { username: 'song_song', password: `doan-song-song-${i}` } })));
  const by = {};
  for (const r of results) by[r.status] = (by[r.status] ?? 0) + 1;
  assert.ok((by[429] ?? 0) >= 5, `Bắn 10 request cùng lúc phải có ít nhất 5 lần 429, nhận ${JSON.stringify(by)} — đếm lần thử TRƯỚC khi await kiểm mật khẩu (limiter.hit)`);
  assert.ok((by[401] ?? 0) <= 5, `Tối đa 5 lần được kiểm mật khẩu (401), nhận ${JSON.stringify(by)}`);
  const real = await call('POST', '/api/login', { body: { username: 'song_song', password: PASSWORD } });
  assert.equal(real.status, 429, 'Sau loạt đoán, kể cả đúng mật khẩu vẫn 429 tới hết cửa sổ');
});

test('createAuthServer: POST có Origin lạ → 403 bad_origin (CSRF); không có Origin → cho qua', async () => {
  const { call } = await startAuth({ t: T0 });
  const evil = await call('POST', '/api/register', { body: { username: 'csrf_test', password: PASSWORD }, origin: 'https://evil.example' });
  assert.deepEqual([evil.status, evil.json], [403, { error: 'bad_origin' }], 'POST từ trang lạ → 403 bad_origin');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE name = 'csrf_test'")).rows[0].n, 0, 'Request bị chặn không được ghi gì');
  const good = await call('POST', '/api/register', { body: { username: 'csrf_test', password: PASSWORD }, origin: ORIGIN });
  assert.equal(good.status, 201, 'Origin trong allowedOrigins → bình thường');
  const login = await call('POST', '/api/login', { body: { username: 'csrf_test', password: PASSWORD } });
  assert.equal(login.status, 200, 'Không có Origin (curl, app mobile) → cho qua');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const evilOut = await call('POST', '/api/logout', { cookie, origin: 'https://evil.example' });
  assert.equal(evilOut.status, 403, 'Trang lạ không đăng xuất hộ được');
  assert.equal((await call('GET', '/api/me', { cookie, origin: 'https://evil.example' })).status, 200, 'GET không bị chặn theo Origin');
  const evilChannel = await call('POST', '/channels', { body: { name: 'kenh-csrf' }, cookie, origin: 'https://evil.example' });
  assert.equal(evilChannel.status, 403, 'Route REST của N11 cũng được chặn Origin lạ');
});

test('createAuthServer: REST của N11 cần đăng nhập; author tin lấy từ phiên; /health không cần', async () => {
  const { call } = await startAuth({ t: T0 });
  assert.deepEqual([(await call('GET', '/health')).status], [200], 'GET /health không cần đăng nhập');
  const anon = await call('GET', '/channels');
  assert.deepEqual([anon.status, anon.json], [401, { error: 'not_logged_in' }], 'Chưa đăng nhập → GET /channels 401 not_logged_in');
  const anonPost = await call('POST', '/channels', { body: { name: 'kenh-an-danh' } });
  assert.equal(anonPost.status, 401, 'Chưa đăng nhập → không tạo kênh được');
  const cookie = await loginCookie(call, 'rest_an');
  const ch = await call('POST', '/channels', { body: { name: `rest-${++seq}` }, cookie });
  assert.equal(ch.status, 201, `Đã đăng nhập → POST /channels 201 như N11, nhận ${ch.status} ${JSON.stringify(ch.json)}`);
  const m = await call('POST', `/channels/${ch.json.id}/messages`, { body: { author: 'giam_doc', text: 'Tăng lương!' }, cookie });
  assert.equal(m.status, 201, 'POST tin → 201');
  assert.equal(m.json.author, 'rest_an', 'author lấy từ phiên, KHÔNG từ body client gửi');
  const list = await call('GET', `/channels/${ch.json.id}/messages?limit=10`, { cookie });
  assert.deepEqual(list.json, { items: [m.json], nextBefore: null }, 'GET lịch sử đúng dạng N11 { items, nextBefore }');
  const bad = await call('GET', `/channels/${ch.json.id}/messages?limit=500`, { cookie });
  assert.equal(bad.json.error, 'validation_failed', 'Lỗi kiểm tra vẫn dạng N11');
  assert.equal((await call('GET', '/khong-co', { cookie })).status, 404, 'Đã đăng nhập, đường dẫn lạ → 404');
});

// ---------- createAuthServer: WebSocket ----------

function rawUpgrade(port, path, extraHeaders = '') {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    const t = setTimeout(() => { sock.destroy(); reject(new Error('Hết 2 giây mà server không trả lời request nâng cấp')); }, 2000);
    sock.on('data', (d) => { data += d; });
    sock.on('close', () => { clearTimeout(t); resolve(data); });
    sock.on('error', () => {});
    sock.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n`
      + `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${extraHeaders}\r\n`);
  });
}

function connect(port, headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
  cleanups.push(() => ws.terminate());
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    const w = waiters.shift();
    if (w) w(m); else inbox.push(m);
  });
  ws.on('error', () => {});
  const c = {
    ws,
    opened: new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }),
    send: (obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
    next(ms = 2000) {
      if (inbox.length) return Promise.resolve(inbox.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Hết ${ms} ms mà server không gửi tin nào`)), ms);
        waiters.push((m) => { clearTimeout(t); resolve(m); });
      });
    },
    async hello(channelId, user) {
      await c.opened;
      c.send({ type: 'hello', channelId, user, lastSeenId: 0 });
      const got = [];
      for (let m = await c.next(); m.type !== 'synced'; m = await c.next()) {
        assert.notEqual(m.type, 'error', `hello phải tới synced, server báo lỗi: ${JSON.stringify(m)}`);
        got.push(m);
      }
      return got;
    },
  };
  return c;
}

test('createAuthServer: WebSocket không phiên → 401, Origin lạ → 403, sai đường → 404 (trước 101)', async () => {
  const clock = { t: T0 };
  const { port, call } = await startAuth(clock, { sessionTtlSec: 60 });
  const cookie = await loginCookie(call, 'ws_tu_choi');
  const none = await rawUpgrade(port, '/ws');
  assert.match(none, /^HTTP\/1\.1 401 /, `Không cookie → "HTTP/1.1 401 ...", nhận: ${none.slice(0, 40)}`);
  assert.match(none, /\{"error":"not_logged_in"\}/, 'Body {"error":"not_logged_in"}');
  assert.match(await rawUpgrade(port, '/ws', 'Cookie: tp_session=gia-mao\r\n'), /^HTTP\/1\.1 401 /, 'Cookie phiên giả → 401');
  const evil = await rawUpgrade(port, '/ws', `Cookie: ${cookie}\r\nOrigin: https://evil.example\r\n`);
  assert.match(evil, /^HTTP\/1\.1 403 /, 'Cookie đúng nhưng Origin lạ → 403 (chống CSWSH)');
  assert.match(evil, /bad_origin/, 'Body có bad_origin');
  assert.match(await rawUpgrade(port, '/khac', `Cookie: ${cookie}\r\n`), /^HTTP\/1\.1 404 /, 'Đường dẫn khác /ws → 404');
  clock.t += 60_000;
  assert.match(await rawUpgrade(port, '/ws', `Cookie: ${cookie}\r\nOrigin: ${ORIGIN}\r\n`), /^HTTP\/1\.1 401 /, 'Phiên hết hạn → 401');
});

test('createAuthServer: WebSocket bằng cookie phiên → chat N13, author lấy từ phiên; REST tới WebSocket; logout → đóng 4001', async () => {
  const { port, call } = await startAuth({ t: T0 });
  const an = await loginCookie(call, 'ws_an');
  const binh = await loginCookie(call, 'ws_binh');
  const ch = (await createPgStore(db).createChannel(`ws-${++seq}`)).id;
  const a = connect(port, { cookie: `lang=vi; ${an}`, origin: ORIGIN });
  const b = connect(port, { cookie: binh });
  assert.deepEqual(await a.hello(ch, 'giam_doc'), [], 'hello → synced (giao thức N13)');
  await b.hello(ch);
  a.send({ type: 'chat', clientMsgId: 'ws-an-1', text: 'Tăng lương!' });
  const first = await a.next();
  const second = await a.next();
  const ack = first.type === 'ack' ? first : second;
  const echo = first.type === 'ack' ? second : first;
  assert.deepEqual({ ...ack, id: 0 }, { type: 'ack', clientMsgId: 'ws-an-1', id: 0, duplicate: false }, 'chat → ack (N13)');
  assert.equal(echo.author, 'ws_an', 'author lấy từ PHIÊN, không từ user client tự khai trong hello');
  assert.deepEqual(await b.next(), echo, 'Kết nối khác cùng kênh nhận tin');
  const rest = await call('POST', `/channels/${ch}/messages`, { body: { author: 'x', text: 'qua REST' }, cookie: binh });
  assert.equal(rest.status, 201, 'POST tin qua REST bằng cookie → 201');
  assert.equal((await a.next()).text, 'qua REST', 'Tin REST tới WebSocket ngay');
  const closed = new Promise((r) => a.ws.once('close', (code, reason) => r([code, String(reason)])));
  const out = await call('POST', '/api/logout', { cookie: an });
  assert.equal(out.status, 204, 'logout → 204');
  assert.deepEqual(await closed, [4001, 'logged_out'], 'logout đóng ngay WebSocket của phiên đó với code 4001 "logged_out"');
  await b.next(); // bản tin REST của chính Binh
  b.send({ type: 'chat', clientMsgId: 'ws-binh-1', text: 'còn mình mình' });
  const bAck = await b.next();
  assert.equal(bAck.type === 'ack' || bAck.type === 'message', true, 'Kết nối của phiên khác vẫn mở và chat được');
});
