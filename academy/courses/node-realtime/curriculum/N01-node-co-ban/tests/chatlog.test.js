// Test tự chấm cho bài N01. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Chạy từ thư mục workspace của bài: node --test "../../curriculum/N01-node-co-ban/tests/*.test.js"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(join(process.cwd(), 'chatlog.js')).href);
const { parseLine, countByUser, loadMessages, delay, withTimeout } = mod;

// ---------- parseLine ----------

test('parseLine: dòng hợp lệ → object 3 khóa, user đã trim', () => {
  const got = parseLine('{"user": " an ", "text": "Hi", "ts": "2026-10-23T09:00:00Z", "extra": 1}');
  assert.deepEqual(got, { user: 'an', text: 'Hi', ts: '2026-10-23T09:00:00Z' },
    'Phải trả { user, text, ts } — user đã .trim(), bỏ khóa thừa như "extra"');
});

test('parseLine: JSON hỏng → null, không ném lỗi', () => {
  let got;
  assert.doesNotThrow(() => { got = parseLine('{"user": "an", "text": '); },
    'JSON hỏng không được làm hàm ném lỗi — bọc JSON.parse trong try/catch');
  assert.equal(got, null, 'JSON hỏng phải trả null');
});

test('parseLine: dòng rỗng / chỉ có khoảng trắng → null', () => {
  assert.equal(parseLine(''), null, 'Dòng rỗng phải trả null');
  assert.equal(parseLine('   '), null, 'Dòng chỉ có khoảng trắng phải trả null');
});

test('parseLine: thiếu hoặc sai kiểu trường → null', () => {
  assert.equal(parseLine('{"user": "", "text": "x", "ts": "t"}'), null, 'user rỗng → null');
  assert.equal(parseLine('{"user": "   ", "text": "x", "ts": "t"}'), null, 'user chỉ có khoảng trắng → null');
  assert.equal(parseLine('{"text": "x", "ts": "t"}'), null, 'thiếu user → null');
  assert.equal(parseLine('{"user": 7, "text": "x", "ts": "t"}'), null, 'user là số → null');
  assert.equal(parseLine('{"user": "an", "ts": "t"}'), null, 'thiếu text → null');
  assert.equal(parseLine('{"user": "an", "text": "x"}'), null, 'thiếu ts → null');
  assert.equal(parseLine('null'), null, 'JSON "null" hợp lệ nhưng không phải tin nhắn → null');
  assert.equal(parseLine('[1, 2]'), null, 'Mảng JSON không phải tin nhắn → null');
});

// ---------- countByUser ----------

test('countByUser: đếm đúng theo người gửi', () => {
  const msgs = [{ user: 'an' }, { user: 'binh' }, { user: 'an' }];
  assert.deepEqual(countByUser(msgs), { an: 2, binh: 1 }, 'an gửi 2 tin, binh gửi 1 tin');
});

test('countByUser: mảng rỗng → {} và không sửa đầu vào', () => {
  assert.deepEqual(countByUser([]), {}, 'Mảng rỗng phải trả object rỗng {}');
  const msgs = [{ user: 'an', text: 'a' }];
  const before = structuredClone(msgs);
  countByUser(msgs);
  assert.deepEqual(msgs, before, 'Không được sửa mảng đầu vào');
});

// ---------- loadMessages ----------

test('loadMessages: đọc file, bỏ dòng hỏng, giữ thứ tự, chịu được \\r\\n', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'n01-'));
  try {
    const file = join(dir, 'log.jsonl');
    await writeFile(file, [
      '{"user":"an","text":"1","ts":"t1"}',
      '',
      '{hỏng',
      '{"user":"binh","text":"2","ts":"t2"}',
      '{"user":"an","text":"3","ts":"t3"}',
    ].join('\r\n') + '\r\n');
    const result = loadMessages(file);
    assert.ok(result instanceof Promise, 'loadMessages phải là hàm async (trả về Promise)');
    const msgs = await result;
    assert.deepEqual(msgs.map((m) => m.text), ['1', '2', '3'],
      'Phải bỏ dòng rỗng và dòng JSON hỏng, giữ thứ tự; nhớ bỏ "\\r" cuối dòng kiểu Windows');
    assert.deepEqual(msgs[1], { user: 'binh', text: '2', ts: 't2' }, 'Mỗi phần tử là kết quả của parseLine');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadMessages: file không tồn tại → []', async () => {
  const msgs = await loadMessages(join(tmpdir(), 'khong-co-file-nay-n01.jsonl'));
  assert.deepEqual(msgs, [], 'File không tồn tại (ENOENT) phải trả [] thay vì ném lỗi');
});

test('loadMessages: đọc đúng file messages.jsonl mẫu', async () => {
  const msgs = await loadMessages(join(process.cwd(), 'messages.jsonl'));
  assert.equal(msgs.length, 9, 'messages.jsonl có 12 dòng, chỉ 9 dòng là tin hợp lệ');
  assert.deepEqual(countByUser(msgs), { an: 4, binh: 2, chi: 2, dung: 1 }, 'Đếm theo người gửi trên file mẫu');
});

// ---------- delay ----------

test('delay: trả Promise, resolve sau ít nhất ms', async () => {
  const t0 = Date.now();
  const p = delay(50);
  assert.ok(p instanceof Promise, 'delay phải trả về Promise');
  const value = await p;
  const elapsed = Date.now() - t0;
  assert.equal(value, undefined, 'delay resolve với giá trị undefined');
  assert.ok(elapsed >= 45, `delay(50) phải chờ ít nhất ~50 ms, đo được ${elapsed} ms`);
  assert.ok(elapsed < 1000, `delay(50) chờ quá lâu: ${elapsed} ms`);
});

test('delay: nhiều delay chạy song song, không chặn nhau', async () => {
  const t0 = Date.now();
  await Promise.all([delay(100), delay(100), delay(100)]);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 250, `3 delay(100) song song phải xong sau ~100 ms, đo được ${elapsed} ms — có đang dùng vòng lặp bận chờ không?`);
});

// ---------- withTimeout ----------

test('withTimeout: xong sớm → trả đúng giá trị', async () => {
  const value = await withTimeout(delay(10).then(() => 42), 500);
  assert.equal(value, 42, 'Promise xong trước hạn → withTimeout trả đúng giá trị của nó');
});

test('withTimeout: quá hạn → lỗi "timeout"', async () => {
  const t0 = Date.now();
  await assert.rejects(withTimeout(delay(400), 30), (err) => {
    assert.ok(err instanceof Error, 'Phải reject bằng một Error');
    assert.equal(err.message, 'timeout', 'message của lỗi phải đúng là "timeout"');
    return true;
  });
  assert.ok(Date.now() - t0 < 300, 'Phải báo timeout ngay khi hết 30 ms, không chờ promise gốc');
});

test('withTimeout: promise lỗi → ném đúng lỗi đó', async () => {
  const boom = new Error('hỏng');
  const failing = Promise.reject(boom);
  failing.catch(() => {}); // chặn cảnh báo unhandledRejection khi withTimeout chưa viết
  await assert.rejects(withTimeout(failing, 500), (err) => {
    assert.equal(err, boom, 'Phải reject với ĐÚNG lỗi của promise gốc, không bọc lại');
    return true;
  });
});

// ---------- package.json ----------

test('package.json: type module và scripts.start chạy chatlog.js', async () => {
  const pkg = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module', 'package.json phải có "type": "module" để dùng import/export');
  assert.ok(pkg.scripts && typeof pkg.scripts.start === 'string',
    'Thêm "scripts": { "start": "node chatlog.js" } vào package.json để chạy được `npm start`');
  assert.match(pkg.scripts.start, /node\s+chatlog\.js/, 'scripts.start phải là lệnh "node chatlog.js"');
});
