// Test tự chấm cho bài N00. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Chạy từ thư mục workspace của bài: node --test "../../curriculum/N00-js-cho-nguoi-biet-python/tests/*.test.js"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(join(process.cwd(), 'basics.js')).href);
const {
  cleanName, formatMessage, uniqueUsers, pickMessages, withDefaults, DEFAULTS,
  Inbox, createIdGenerator, parseJsonOr, greetUser,
} = mod;

// ---------- cleanName ----------

test('cleanName: chuỗi có chữ → đã trim', () => {
  assert.equal(cleanName('  an '), 'an', "cleanName('  an ') phải trả 'an' (dùng .trim())");
  assert.equal(cleanName('Bình'), 'Bình', 'Chuỗi không có khoảng trắng thừa giữ nguyên');
});

test('cleanName: rỗng, khoảng trắng, không phải chuỗi → null', () => {
  assert.equal(cleanName(''), null, "Chuỗi rỗng '' phải trả null");
  assert.equal(cleanName('   '), null, 'Chuỗi chỉ có khoảng trắng phải trả null');
  assert.equal(cleanName(null), null, 'null phải trả null');
  assert.equal(cleanName(undefined), null, 'undefined phải trả null');
  assert.equal(cleanName(0), null, 'Số 0 không phải chuỗi → null');
  assert.equal(cleanName(42), null, 'Số 42 không phải chuỗi → null (kiểm tra typeof value === "string")');
  assert.equal(cleanName(['an']), null, 'Mảng không phải chuỗi → null');
});

// ---------- formatMessage ----------

test('formatMessage: đúng dạng [HH:MM] user: text', () => {
  assert.equal(formatMessage({ user: 'an', text: 'Chào', ts: '2026-10-23T09:05:00Z' }), '[09:05] an: Chào',
    'Giờ lấy từ ts ký tự 11–15 (ts.slice(11, 16)), rồi "user: text"');
  assert.equal(formatMessage({ user: 'binh', text: 'Ok', ts: '2026-10-23T17:30:59Z', extra: 1 }), '[17:30] binh: Ok',
    'Khóa thừa bị bỏ qua; không được in giây');
});

test('formatMessage: thiếu ts → [--:--]', () => {
  assert.equal(formatMessage({ user: 'an', text: 'Chào' }), '[--:--] an: Chào',
    'Không có ts thì dùng --:-- (giá trị mặc định khi destructuring: const { ts = ... } = msg)');
});

// ---------- uniqueUsers ----------

test('uniqueUsers: không trùng, theo thứ tự xuất hiện', () => {
  const msgs = [{ user: 'chi' }, { user: 'an' }, { user: 'chi' }, { user: 'binh' }, { user: 'an' }];
  assert.deepEqual(uniqueUsers(msgs), ['chi', 'an', 'binh'], 'Giữ thứ tự lần đầu gặp, bỏ tên trùng');
});

test('uniqueUsers: mảng rỗng → [] và không sửa đầu vào', () => {
  assert.deepEqual(uniqueUsers([]), [], 'Mảng rỗng phải trả []');
  const msgs = [{ user: 'an' }, { user: 'an' }];
  const before = structuredClone(msgs);
  uniqueUsers(msgs);
  assert.deepEqual(msgs, before, 'Không được sửa mảng đầu vào');
});

// ---------- pickMessages ----------

test('pickMessages: giữ tin mà callback trả truthy, mảng mới', () => {
  const msgs = [{ user: 'an', text: 'a' }, { user: 'binh', text: 'b' }, { user: 'an', text: 'c' }];
  const got = pickMessages(msgs, (m) => m.user === 'an');
  assert.deepEqual(got.map((m) => m.text), ['a', 'c'], 'Chỉ giữ tin mà keep(tin) trả true, đúng thứ tự');
  assert.notEqual(got, msgs, 'Phải trả MẢNG MỚI, không trả lại chính mảng đầu vào');
  assert.equal(msgs.length, 3, 'Không được sửa mảng đầu vào');
  assert.deepEqual(pickMessages(msgs, (m) => m.text.length), msgs, 'Giá trị truthy (vd. số 1) cũng tính là giữ');
});

test('pickMessages: gọi callback đúng một lần mỗi tin', () => {
  const seen = [];
  pickMessages([{ id: 1 }, { id: 2 }, { id: 3 }], (m) => { seen.push(m.id); return false; });
  assert.deepEqual(seen, [1, 2, 3], 'keep phải được gọi đúng một lần cho mỗi tin, theo thứ tự');
});

// ---------- withDefaults ----------

test('withDefaults: ghép với mặc định, khóa của options thắng', () => {
  assert.deepEqual(withDefaults({ port: 8080 }), { host: '127.0.0.1', port: 8080, path: '/ws' },
    'port lấy từ options, host và path lấy từ DEFAULTS');
  assert.deepEqual(withDefaults({ debug: true }), { host: '127.0.0.1', port: 3000, path: '/ws', debug: true },
    'Khóa thêm trong options cũng được giữ');
  assert.deepEqual(withDefaults(), DEFAULTS, 'Gọi không đối số → bản sao của DEFAULTS');
});

test('withDefaults: object mới, không sửa đầu vào', () => {
  const opts = { port: 1 };
  const got = withDefaults(opts);
  assert.notEqual(got, opts, 'Phải trả object MỚI');
  assert.notEqual(withDefaults(), DEFAULTS, 'Không trả lại chính DEFAULTS (người gọi sửa sẽ hỏng mặc định)');
  assert.deepEqual(opts, { port: 1 }, 'Không được sửa options');
  assert.deepEqual(DEFAULTS, { host: '127.0.0.1', port: 3000, path: '/ws' }, 'Không được sửa DEFAULTS');
});

// ---------- Inbox ----------

test('Inbox: constructor lưu owner, items rỗng', () => {
  const inbox = new Inbox('an');
  assert.equal(inbox.owner, 'an', 'new Inbox("an").owner phải là "an" (this.owner = owner)');
  assert.deepEqual(inbox.items, [], 'this.items bắt đầu là mảng rỗng');
});

test('Inbox: add trả số tin, unreadCount là getter', () => {
  const inbox = new Inbox('an');
  assert.equal(inbox.add('Chào'), 1, 'add lần đầu trả 1');
  assert.equal(inbox.add('Họp'), 2, 'add lần hai trả 2');
  assert.deepEqual(inbox.items[0], { text: 'Chào', read: false }, 'Mỗi tin là { text, read: false }');
  const desc = Object.getOwnPropertyDescriptor(Inbox.prototype, 'unreadCount');
  assert.ok(desc && typeof desc.get === 'function', 'unreadCount phải là getter: get unreadCount() { ... }');
  assert.equal(inbox.unreadCount, 2, 'Hai tin mới → unreadCount 2');
});

test('Inbox: markAllRead, mỗi hộp thư riêng', () => {
  const a = new Inbox('an');
  const b = new Inbox('binh');
  a.add('1');
  a.add('2');
  b.add('x');
  a.markAllRead();
  assert.equal(a.unreadCount, 0, 'Sau markAllRead không còn tin chưa đọc');
  assert.ok(a.items.every((m) => m.read === true), 'Mọi tin phải có read === true');
  assert.equal(b.unreadCount, 1, 'Hộp thư của binh không bị ảnh hưởng — dữ liệu nằm trên this, không dùng biến chung');
  a.add('3');
  assert.equal(a.unreadCount, 1, 'Tin mới sau markAllRead lại là chưa đọc');
});

// ---------- createIdGenerator ----------

test('createIdGenerator: id tăng dần theo prefix', () => {
  const next = createIdGenerator('an');
  assert.equal(typeof next, 'function', 'createIdGenerator phải trả về một HÀM');
  assert.equal(next(), 'an-1', 'Lần gọi đầu → "an-1"');
  assert.equal(next(), 'an-2', 'Lần gọi hai → "an-2"');
  assert.equal(next(), 'an-3', 'Lần gọi ba → "an-3"');
});

test('createIdGenerator: mỗi bộ sinh có bộ đếm riêng, prefix mặc định', () => {
  const a = createIdGenerator('a');
  const b = createIdGenerator('b');
  a();
  a();
  assert.equal(b(), 'b-1', 'Bộ sinh b bắt đầu từ 1, không dùng chung bộ đếm với a — đặt `let count` BÊN TRONG createIdGenerator');
  assert.equal(a(), 'a-3', 'Bộ sinh a vẫn đếm tiếp');
  assert.equal(createIdGenerator()(), 'msg-1', 'prefix mặc định là "msg"');
});

// ---------- parseJsonOr ----------

test('parseJsonOr: JSON hợp lệ → giá trị', () => {
  assert.deepEqual(parseJsonOr('{"a":1,"b":[2]}'), { a: 1, b: [2] }, 'Object JSON phải parse ra object');
  assert.deepEqual(parseJsonOr('[1,2]', 'x'), [1, 2], 'Mảng JSON hợp lệ trả mảng, không trả fallback');
  assert.equal(parseJsonOr('null', 'x'), null, '"null" là JSON hợp lệ → null, không phải fallback');
});

test('parseJsonOr: JSON hỏng → fallback, không ném lỗi', () => {
  let got;
  assert.doesNotThrow(() => { got = parseJsonOr('{hỏng', { ok: false }); },
    'JSON hỏng không được làm hàm ném lỗi — bọc JSON.parse trong try/catch');
  assert.deepEqual(got, { ok: false }, 'JSON hỏng phải trả fallback');
  assert.equal(parseJsonOr(''), null, 'Chuỗi rỗng → fallback mặc định null');
});

// ---------- greetUser ----------

test('greetUser: trả Promise của lời chào, gọi getUser với id', async () => {
  const calls = [];
  const getUser = async (id) => { calls.push(id); return { name: 'An' }; };
  const p = greetUser(getUser, 7);
  assert.ok(p instanceof Promise, 'greetUser phải là hàm async (trả về Promise)');
  assert.equal(await p, 'Xin chào, An!', 'Kết quả phải là "Xin chào, An!" — nhớ await getUser(id)');
  assert.deepEqual(calls, [7], 'getUser phải được gọi đúng một lần với id');
});

test('greetUser: getUser lỗi → chào khách', async () => {
  const getUser = () => Promise.reject(new Error('không tìm thấy'));
  assert.equal(await greetUser(getUser, 1), 'Xin chào, khách!',
    'getUser bị reject → bắt bằng try/catch quanh await, trả "Xin chào, khách!"');
});
