// Test tự chấm cho bài N12. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Mỗi test dùng một PGlite mới trong bộ nhớ (Postgres thật chạy bằng WASM) — không cần cài Postgres, không gọi mạng.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const load = (file) => import(pathToFileURL(join(process.cwd(), file)).href);
const { migrate } = await load('migrate.ts');
const { createPgStore, searchMessages, withTransaction, createChannelWithWelcome } = await load('store.ts');
const MIGRATIONS = join(process.cwd(), 'migrations');

const cleanups = [];
after(async () => { for (const fn of cleanups.reverse()) { try { await fn(); } catch { /* dọn tiếp */ } } });

function newDb() {
  const db = new PGlite();
  cleanups.push(() => db.close());
  return db;
}
async function migratedDb() {
  const db = newDb();
  await migrate(db, MIGRATIONS);
  return db;
}
function tempDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'n12-mig-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}
async function codeOf(promise) {
  try { await promise; } catch (err) { return err.code ?? err.message; }
  return 'không lỗi';
}
const count = async (db, table) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

// ---------- migrate ----------

test('migrate: áp file .sql theo thứ tự tên, ghi schema_migrations, chạy lại không làm gì', async () => {
  const dir = tempDir({
    '002_b.sql': 'INSERT INTO fruits (name) VALUES (\'cam\');\n',
    '001_a.sql': '-- tạo bảng\nCREATE TABLE fruits (\n  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  name text NOT NULL\n);\nINSERT INTO fruits (name) VALUES (\'táo\');\n',
    '010_c.sql': 'ALTER TABLE fruits ADD COLUMN kg integer NOT NULL DEFAULT 0;\n',
    'README.md': 'không phải migration',
  });
  const db = newDb();
  assert.deepEqual(await migrate(db, dir), ['001_a.sql', '002_b.sql', '010_c.sql'], 'Trả tên các file vừa áp, theo thứ tự tên; bỏ qua file không phải .sql');
  assert.deepEqual((await db.query('SELECT name, kg FROM fruits ORDER BY id')).rows, [{ name: 'táo', kg: 0 }, { name: 'cam', kg: 0 }],
    'Các câu lệnh trong từng file đã chạy đúng thứ tự 001 → 002 → 010');
  const versions = (await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
  assert.deepEqual(versions, ['001_a.sql', '002_b.sql', '010_c.sql'], 'schema_migrations.version = tên file');
  assert.deepEqual(await migrate(db, dir), [], 'Chạy lần 2 → [] (idempotent)');
  assert.equal(await count(db, 'fruits'), 2, 'Chạy lần 2 không chèn lại dữ liệu');
  writeFileSync(join(dir, '011_d.sql'), 'INSERT INTO fruits (name) VALUES (\'lê\');\n');
  assert.deepEqual(await migrate(db, dir), ['011_d.sql'], 'Thêm file mới → chỉ áp file đó');
});

test('migrate: file lỗi → ROLLBACK cả file, không ghi version, ném lỗi; file trước vẫn giữ', async () => {
  const dir = tempDir({
    '001_ok.sql': 'CREATE TABLE notes (id integer PRIMARY KEY, body text NOT NULL);\n',
    '002_bad.sql': 'INSERT INTO notes VALUES (1, \'một\');\nINSERT INTO notes VALUES (1, \'trùng khóa\');\n',
    '003_later.sql': 'INSERT INTO notes VALUES (3, \'ba\');\n',
  });
  const db = newDb();
  const code = await codeOf(migrate(db, dir));
  assert.equal(code, '23505', 'migrate phải ném lại lỗi của câu SQL hỏng (ở đây: trùng khóa chính, code 23505)');
  const versions = (await db.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version);
  assert.deepEqual(versions, ['001_ok.sql'], 'Chỉ file thành công được ghi; file lỗi và file sau đó thì không');
  assert.equal(await count(db, 'notes'), 0, 'Câu INSERT đầu tiên của file lỗi cũng bị ROLLBACK (cả file là một transaction)');
  const status = (await db.query('SELECT 1 AS ok')).rows[0].ok;
  assert.equal(status, 1, 'Sau lỗi, kết nối vẫn dùng được (đã ROLLBACK, không kẹt trong transaction hỏng)');
});

// ---------- 001_init.sql ----------

test('001_init.sql: bảng users/channels/messages với khóa, UNIQUE, CHECK, khóa ngoại, index', async () => {
  const db = await migratedDb();
  const cols = async (t) => (await db.query(
    'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [t])).rows;
  const names = async (t) => (await cols(t)).map((c) => c.column_name);
  assert.deepEqual(await names('users'), ['id', 'name', 'created_at'], 'users: id, name, created_at');
  assert.deepEqual((await names('channels')).slice(0, 3), ['id', 'name', 'created_at'], 'channels: id, name, created_at (+ topic từ 002)');
  assert.deepEqual(await names('messages'), ['id', 'channel_id', 'user_id', 'text', 'created_at'], 'messages: id, channel_id, user_id, text, created_at');
  for (const c of await cols('messages')) {
    assert.equal(c.is_nullable, 'NO', `messages.${c.column_name} phải NOT NULL`);
    if (c.column_name.endsWith('id')) assert.equal(c.data_type, 'integer', `messages.${c.column_name} kiểu integer`);
  }
  assert.equal((await cols('users')).find((c) => c.column_name === 'created_at').data_type, 'timestamp with time zone', 'created_at kiểu timestamptz');

  const u = (await db.query("INSERT INTO users (name) VALUES ('An') RETURNING id, created_at")).rows[0];
  assert.equal(typeof u.id, 'number', 'id tự sinh (GENERATED ... AS IDENTITY)');
  assert.ok(u.created_at instanceof Date, 'created_at mặc định now()');
  assert.equal(await codeOf(db.query("INSERT INTO users (name) VALUES ('An')")), '23505', 'users.name UNIQUE');
  assert.equal(await codeOf(db.query("INSERT INTO users (name) VALUES ('')")), '23514', 'users.name dài 1–32 (CHECK)');
  assert.equal(await codeOf(db.query(`INSERT INTO users (name) VALUES ('${'x'.repeat(33)}')`)), '23514', 'users.name dài 1–32 (CHECK)');
  const ch = (await db.query("INSERT INTO channels (name) VALUES ('general') RETURNING id")).rows[0];
  assert.equal(await codeOf(db.query("INSERT INTO channels (name) VALUES ('general')")), '23505', 'channels.name UNIQUE');
  assert.equal(await codeOf(db.query("INSERT INTO channels (name) VALUES ('Phòng Họp')")), '23514', 'channels.name khớp ^[a-z0-9-]{2,32}$ (CHECK)');
  await db.query('INSERT INTO messages (channel_id, user_id, text) VALUES ($1, $2, $3)', [ch.id, u.id, 'Chào']);
  assert.equal(await codeOf(db.query('INSERT INTO messages (channel_id, user_id, text) VALUES ($1, $2, $3)', [999, u.id, 'x'])), '23503',
    'messages.channel_id là khóa ngoại tới channels');
  assert.equal(await codeOf(db.query('INSERT INTO messages (channel_id, user_id, text) VALUES ($1, $2, $3)', [ch.id, 999, 'x'])), '23503',
    'messages.user_id là khóa ngoại tới users');
  assert.equal(await codeOf(db.query('INSERT INTO messages (channel_id, user_id, text) VALUES ($1, $2, $3)', [ch.id, u.id, ''])), '23514',
    'messages.text dài 1–2000 (CHECK)');
  assert.equal(await codeOf(db.query('INSERT INTO messages (channel_id, user_id, text) VALUES ($1, $2, $3)', [ch.id, u.id, 'x'.repeat(2001)])), '23514',
    'messages.text dài 1–2000 (CHECK)');
  await db.query('DELETE FROM channels WHERE id = $1', [ch.id]);
  assert.equal(await count(db, 'messages'), 0, 'Xoá kênh → tin của kênh bị xoá theo (ON DELETE CASCADE)');
  const idx = (await db.query("SELECT indexdef FROM pg_indexes WHERE tablename = 'messages'")).rows.map((r) => r.indexdef);
  assert.ok(idx.some((d) => /\(channel_id, id( DESC)?\)/.test(d)), `Cần index trên messages (channel_id, id) cho phân trang theo kênh — đang có: ${idx.join(' | ')}`);
});

// ---------- createPgStore ----------

test('createPgStore: kênh — tạo, trùng → null, đọc, danh sách theo id', async () => {
  const store = createPgStore(await migratedDb());
  const general = await store.createChannel('general');
  assert.equal(typeof general?.id, 'number', 'createChannel trả kênh có id');
  assert.equal(general.name, 'general');
  assert.match(general.createdAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, 'createdAt là chuỗi ISO (Date.toISOString())');
  assert.deepEqual(Object.keys(general).sort(), ['createdAt', 'id', 'name'], 'Kênh chỉ có id, name, createdAt (camelCase)');
  assert.equal(await store.createChannel('general'), null, 'Tên trùng → null, không ném lỗi');
  const dev = await store.createChannel('dev');
  assert.deepEqual((await store.listChannels()).map((c) => c.name), ['general', 'dev'], 'listChannels theo id tăng dần');
  assert.deepEqual(await store.getChannel(dev.id), dev, 'getChannel(id) trả đúng kênh');
  assert.equal(await store.getChannel(999), undefined, 'Không có → undefined');
});

test('createPgStore: tin nhắn — tạo người gửi khi cần, mới nhất trước, before, limit', async () => {
  const db = await migratedDb();
  const store = createPgStore(db);
  const a = await store.createChannel('general');
  const b = await store.createChannel('dev');
  const m1 = await store.addMessage({ channelId: a.id, author: 'An', text: 'Tin 1' });
  assert.deepEqual(Object.keys(m1).sort(), ['author', 'channelId', 'createdAt', 'id', 'text'], 'Message: id, channelId, author, text, createdAt');
  assert.deepEqual([m1.channelId, m1.author, m1.text], [a.id, 'An', 'Tin 1'], 'addMessage trả tin vừa lưu, author là tên');
  await store.addMessage({ channelId: a.id, author: 'Binh', text: 'Tin 2' });
  await store.addMessage({ channelId: b.id, author: 'An', text: 'Tin kênh dev' });
  await store.addMessage({ channelId: a.id, author: 'An', text: 'Tin 3' });
  assert.equal(await count(db, 'users'), 2, 'Người gửi đã có (An) thì dùng lại, không tạo trùng');
  let page = await store.listMessages(a.id, { limit: 2 });
  assert.deepEqual(page.map((m) => `${m.author}:${m.text}`), ['An:Tin 3', 'Binh:Tin 2'], 'Mới nhất trước, chỉ tin của kênh, tối đa limit');
  page = await store.listMessages(a.id, { limit: 10, before: page[1].id });
  assert.deepEqual(page.map((m) => m.text), ['Tin 1'], 'before: chỉ tin có id < before');
  assert.deepEqual(await store.listMessages(999, { limit: 5 }), [], 'Kênh không có tin → []');
  assert.equal(await codeOf(store.addMessage({ channelId: 999, author: 'An', text: 'x' })), '23503', 'Kênh không tồn tại → lỗi khóa ngoại (23503) ném ra');
});

// ---------- searchMessages ----------

test('searchMessages: không phân biệt hoa thường, chỉ trong kênh, chống SQL injection, % là ký tự thường', async () => {
  const db = await migratedDb();
  const store = createPgStore(db);
  const general = await store.createChannel('general');
  const hr = await store.createChannel('hr');
  await store.addMessage({ channelId: general.id, author: 'An', text: 'Deploy lúc 10h' });
  await store.addMessage({ channelId: general.id, author: 'Binh', text: 'ok, DEPLOY xong rồi' });
  await store.addMessage({ channelId: general.id, author: 'An', text: 'Giảm giá 50% cho đội' });
  await store.addMessage({ channelId: general.id, author: "O'Brien", text: "It's done" });
  await store.addMessage({ channelId: hr.id, author: 'Chi', text: 'Bảng lương deploy (mật)' });
  assert.deepEqual((await searchMessages(db, general.id, 'deploy')).map((m) => m.text), ['ok, DEPLOY xong rồi', 'Deploy lúc 10h'],
    'Tìm không phân biệt hoa thường, mới nhất trước, chỉ trong kênh general');
  assert.deepEqual((await searchMessages(db, general.id, "it's")).map((m) => m.author), ["O'Brien"], 'Dấu nháy đơn trong q vẫn tìm đúng');
  for (const attack of ["%' OR 1=1 --", "' OR '1'='1", "x'; DROP TABLE messages; --"]) {
    assert.deepEqual(await searchMessages(db, general.id, attack), [], `q = ${attack} phải là chữ thường, không thành SQL`);
  }
  assert.equal(await count(db, 'messages'), 5, 'Bảng messages còn nguyên');
  assert.deepEqual((await searchMessages(db, general.id, '50%')).map((m) => m.text), ['Giảm giá 50% cho đội'], '"50%" chỉ ra tin có chữ 50%');
  assert.deepEqual(await searchMessages(db, general.id, '%'), (await searchMessages(db, general.id, '50%')),
    '"%" là ký tự thường, không phải "mọi thứ"');
  assert.deepEqual(await searchMessages(db, general.id, '_'), [], '"_" là ký tự thường');
  assert.deepEqual(await searchMessages(db, general.id, '   '), [], 'q rỗng → []');
});

// ---------- withTransaction ----------

function fakePool() {
  const log = [];
  let releases = 0;
  const client = {
    async query(sql) { log.push(`client: ${sql}`); return { rows: [] }; },
    release() { releases++; },
  };
  return {
    log, get releases() { return releases; },
    async query(sql) { log.push(`pool: ${sql}`); return { rows: [] }; },
    async connect() { log.push('connect'); return client; },
  };
}

test('withTransaction: BEGIN → fn → COMMIT trên MỘT kết nối; lỗi → ROLLBACK + ném lại; luôn release', async () => {
  const pool = fakePool();
  const value = await withTransaction(pool, async (tx) => { await tx.query('INSERT 1'); await tx.query('INSERT 2'); return 42; });
  assert.equal(value, 42, 'Trả giá trị fn trả về');
  assert.deepEqual(pool.log, ['connect', 'client: BEGIN', 'client: INSERT 1', 'client: INSERT 2', 'client: COMMIT'],
    'Với pool: mượn MỘT client (acquire), mọi câu đi qua client đó, không câu nào đi thẳng pool');
  assert.equal(pool.releases, 1, 'release() đúng một lần');
  const pool2 = fakePool();
  const boom = new Error('lỗi giữa chừng');
  await assert.rejects(withTransaction(pool2, async (tx) => { await tx.query('INSERT 1'); throw boom; }), (e) => e === boom,
    'Ném lại ĐÚNG lỗi của fn');
  assert.deepEqual(pool2.log, ['connect', 'client: BEGIN', 'client: INSERT 1', 'client: ROLLBACK'], 'Lỗi → ROLLBACK, không COMMIT');
  assert.equal(pool2.releases, 1, 'Lỗi vẫn release() đúng một lần');

  const db = await migratedDb();
  await assert.rejects(withTransaction(db, async (tx) => {
    await tx.query("INSERT INTO channels (name) VALUES ('tam-thoi')");
    throw new Error('huỷ');
  }));
  assert.equal(await count(db, 'channels'), 0, 'PGlite: INSERT trong transaction bị huỷ không còn');
  await withTransaction(db, (tx) => tx.query("INSERT INTO channels (name) VALUES ('giu-lai')"));
  assert.equal(await count(db, 'channels'), 1, 'PGlite: transaction thành công được COMMIT');
});

// ---------- createChannelWithWelcome ----------

test('createChannelWithWelcome: kênh + tin chào cùng có hoặc cùng không', async () => {
  const db = await migratedDb();
  const store = createPgStore(db);
  const r = await createChannelWithWelcome(db, { name: 'ops', owner: 'An' });
  assert.equal(r?.channel?.name, 'ops', 'Trả { channel, message }');
  assert.equal(r.message.text, 'An đã tạo kênh #ops', 'Tin chào: "<owner> đã tạo kênh #<name>"');
  assert.deepEqual([r.message.channelId, r.message.author], [r.channel.id, 'An'], 'Tin chào nằm trong kênh mới, người gửi là owner');
  assert.deepEqual((await store.listMessages(r.channel.id, { limit: 5 })).map((m) => m.text), ['An đã tạo kênh #ops'], 'Tin chào đã lưu');
  assert.equal(await createChannelWithWelcome(db, { name: 'ops', owner: 'Binh' }), null, 'Tên trùng → null');
  assert.equal(await count(db, 'messages'), 1, 'Tên trùng → không thêm tin chào nào');
  const flaky = {
    query(sql, params) {
      if (/insert\s+into\s+messages/i.test(sql)) return Promise.reject(new Error('mất kết nối tới DB'));
      return db.query(sql, params);
    },
  };
  await assert.rejects(createChannelWithWelcome(flaky, { name: 'qa', owner: 'Chi' }), /mất kết nối/, 'Lỗi giữa chừng → ném ra ngoài');
  assert.equal((await store.listChannels()).some((c) => c.name === 'qa'), false, 'Không còn kênh "qa" mồ côi thiếu tin chào (đã ROLLBACK)');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE name = 'Chi'")).rows[0].n, 0, 'Người dùng tạo trong transaction hỏng cũng không còn');
  const ok = await createChannelWithWelcome(db, { name: 'qa', owner: 'Chi' });
  assert.equal(ok?.channel.name, 'qa', 'Sau lỗi, DB vẫn dùng bình thường');
});
