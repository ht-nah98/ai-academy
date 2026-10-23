// Test tự chấm cho bài N15 — resetDb và startTestApp trong testkit.ts (app TeamPulse của N11–N14: server.ts).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { WebSocket } from 'ws';

const kit = await import(pathToFileURL(join(process.cwd(), 'testkit.ts')).href);
const { prepareDb } = await import(pathToFileURL(join(process.cwd(), 'server.ts')).href);

const db = new PGlite();
before(async () => {
  await prepareDb(db);
});
after(async () => {
  await db.close();
});

/** t giả: gom các hàm dọn dẹp để test tự gọi và kiểm tra. */
function fakeT() {
  const fns = [];
  return { after: (fn) => { fns.push(fn); }, cleanup: async () => { for (const fn of fns.reverse()) await fn(); }, fns };
}

/** Rác giống một test trước để lại: kênh lạ, người dùng, tin, phiên. */
async function dirty() {
  await db.query("INSERT INTO channels (name) VALUES ('tam-thoi') ON CONFLICT DO NOTHING");
  const u = await db.query("INSERT INTO users (name) VALUES ('rac_cu') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id");
  const userId = u.rows[0].id;
  const ch = await db.query('SELECT id FROM channels ORDER BY id LIMIT 1');
  for (let i = 0; i < 3; i += 1) {
    await db.query('INSERT INTO messages (channel_id, user_id, text) VALUES ($1, $2, $3)', [ch.rows[0].id, userId, `tin cũ ${i}`]);
  }
  await db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [`s-${Date.now()}`, userId]);
}

/** Đăng ký + đăng nhập không qua testkit (bài chấm không dựa vào helper của học viên). */
async function login(baseUrl, username) {
  const body = JSON.stringify({ username, password: 'mat-khau-cham-bai' });
  const headers = { 'content-type': 'application/json' };
  await fetch(`${baseUrl}/api/register`, { method: 'POST', headers, body });
  const res = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers, body });
  assert.equal(res.status, 200, `đăng nhập ${username} trên app của startTestApp phải 200`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

describe('resetDb', () => {
  test('resetDb: xoá tin, phiên, người dùng, kênh lạ; nạp lại đúng fixture; id đếm lại từ 1', async () => {
    await dirty();
    await kit.resetDb(db);
    for (const table of ['messages', 'sessions', 'users']) {
      const r = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
      assert.equal(r.rows[0].n, 0, `Sau resetDb bảng ${table} phải trống`);
    }
    const chans = await db.query('SELECT id, name FROM channels ORDER BY id');
    assert.deepEqual(chans.rows, [{ id: 1, name: 'general' }, { id: 2, name: 'random' }],
      'Sau resetDb channels phải đúng FIXTURE_CHANNELS: general id 1, random id 2 (RESTART IDENTITY)');
    const user = await db.query("INSERT INTO users (name) VALUES ('moi_tinh') RETURNING id");
    assert.equal(user.rows[0].id, 1, 'Người dùng đầu tiên sau resetDb phải có id 1 (RESTART IDENTITY)');
    const msg = await db.query("INSERT INTO messages (channel_id, user_id, text) VALUES (2, 1, 'x') RETURNING id");
    assert.equal(msg.rows[0].id, 1, 'Tin đầu tiên sau resetDb phải có id 1 (RESTART IDENTITY)');
  });

  test('resetDb: không đụng schema_migrations', async () => {
    const before = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    await kit.resetDb(db);
    const afterRows = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(afterRows.rows, before.rows, 'resetDb không được xoá/sửa schema_migrations');
    assert.deepEqual(afterRows.rows.map((r) => r.version),
      ['001_init.sql', '002_channel_topic.sql', '003_message_sync.sql', '004_auth.sql'], 'schema_migrations vẫn ghi đủ 001→004');
  });
});

describe('startTestApp', () => {
  test('startTestApp: app thật ở cổng ngẫu nhiên 127.0.0.1, DB đã reset', async () => {
    await dirty();
    const t = fakeT();
    try {
      const res = await kit.startTestApp(t, db);
      assert.ok(res && typeof res === 'object', 'startTestApp phải trả object { baseUrl, wsUrl, app }');
      assert.match(String(res.baseUrl), /^http:\/\/127\.0\.0\.1:\d+$/, 'baseUrl dạng http://127.0.0.1:<cổng>');
      const port = Number(res.baseUrl.split(':').pop());
      assert.ok(port > 0, 'cổng thật (khác 0) — đọc từ app.port (hoặc server.address()) sau khi startServer xong');
      assert.equal(res.wsUrl, `ws://127.0.0.1:${port}/ws`, 'wsUrl dạng ws://127.0.0.1:<cổng>/ws');
      assert.equal(typeof res.app?.close, 'function', 'app là kết quả của startServer (có close())');
      const cookie = await login(res.baseUrl, 'cham_bai');
      const me = await (await fetch(`${res.baseUrl}/api/me`, { headers: { cookie } })).json();
      assert.equal(me.user?.id, 1, 'DB phải được resetDb TRƯỚC khi dựng app: người dùng đầu tiên có id 1');
      const chans = await (await fetch(`${res.baseUrl}/channels`, { headers: { cookie } })).json();
      assert.deepEqual(chans.items.map((c) => c.name), ['general', 'random'], 'GET /channels phải đúng fixture (general, random)');
      const msgs = await (await fetch(`${res.baseUrl}/channels/1/messages`, { headers: { cookie } })).json();
      assert.deepEqual(msgs.items, [], 'Không còn "tin cũ" của lần trước');
    } finally {
      await t.cleanup();
    }
  });

  test('startTestApp: t.after đóng app — cổng hết nhận kết nối, client WS bị cắt', async () => {
    const t = fakeT();
    const { baseUrl, wsUrl } = await kit.startTestApp(t, db);
    assert.ok(t.fns.length >= 1, 'startTestApp phải đăng ký dọn dẹp bằng t.after(...)');
    const cookie = await login(baseUrl, 'cham_bai');
    const ws = new WebSocket(wsUrl, { headers: { cookie } });
    ws.on('error', () => {});
    await once(ws, 'open');
    const closed = once(ws, 'close');
    await t.cleanup();
    const timer = setTimeout(() => ws.terminate(), 2000);
    await closed;
    clearTimeout(timer);
    await assert.rejects(fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) }), 'Sau t.after, server phải ngừng nghe (fetch bị từ chối)');
  });

  test('startTestApp: hai lần liên tiếp độc lập — tin và phiên của lần trước không còn', async () => {
    const t1 = fakeT();
    const a = await kit.startTestApp(t1, db);
    const oldCookie = await login(a.baseUrl, 'cham_bai');
    await fetch(`${a.baseUrl}/channels/1/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: oldCookie }, body: JSON.stringify({ text: 'lần 1' }),
    });
    await t1.cleanup();
    const t2 = fakeT();
    try {
      const b = await kit.startTestApp(t2, db);
      const stale = await fetch(`${b.baseUrl}/api/me`, { headers: { cookie: oldCookie } });
      assert.equal(stale.status, 401, 'Phiên của lần dựng trước phải mất (bảng sessions đã reset)');
      const cookie = await login(b.baseUrl, 'cham_bai');
      const list = await (await fetch(`${b.baseUrl}/channels/1/messages`, { headers: { cookie } })).json();
      assert.deepEqual(list.items, [], 'Lần dựng thứ hai không được thấy tin của lần thứ nhất');
    } finally {
      await t2.cleanup();
    }
  });
});
