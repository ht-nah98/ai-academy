/**
 * TeamPulse — Bài N00: JavaScript cho người đã biết Python.
 *
 * 9 hàm nhỏ, mỗi hàm luyện một nhóm cú pháp JavaScript mà mọi bài sau đều dùng.
 * Các hàm độc lập với nhau: làm theo thứ tự của bài học, hoặc hàm nào trước cũng được.
 *
 * Chạy thử:   npm start   (hoặc: node basics.js) — in kết quả từng hàm, hàm chưa viết in "TODO"
 * Chạy test:  npm test    (hoặc bấm "Chạy test" trên web app)
 * Chỉ chạy test của một hàm (vd. cleanName):
 *   node --test --test-name-pattern="cleanName" "../../curriculum/N00-js-cho-nguoi-biet-python/tests/*.test.js"
 *
 * Cách đọc JSDoc (khối chú thích trên mỗi hàm):
 *   @param {string} text          tham số `text` là chuỗi
 *   @param {number} [ms=100]      tham số tùy chọn, mặc định 100
 *   @returns {string | null}      trả về chuỗi HOẶC null
 *   {{user: string}[]}            mảng các object có khóa `user` là chuỗi
 *   Promise<string>               Promise (phiếu hẹn) mà khi xong cho ra một chuỗi
 */
import { pathToFileURL } from 'node:url';

// ---------- 1. Giá trị, so sánh, truthy/falsy ----------

/**
 * Làm sạch tên người dùng.
 *
 * - `value` là chuỗi, sau khi bỏ khoảng trắng hai đầu (`trim`) còn ít nhất 1 ký tự → trả chuỗi đã trim.
 * - Mọi trường hợp khác → `null`: chuỗi rỗng, chuỗi chỉ có khoảng trắng, `null`, `undefined`,
 *   số (kể cả `0`), mảng, object...
 *
 * Ví dụ: cleanName('  an ') → 'an'      cleanName('   ') → null      cleanName(42) → null
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function cleanName(value) {
  // TODO: kiểm tra typeof value === 'string', rồi trim, rồi xét chuỗi rỗng
  throw new Error('TODO: viết cleanName');
}

// ---------- 2. Template literal, destructuring ----------

/**
 * Định dạng một tin chat thành một dòng chữ: `[HH:MM] user: text`.
 *
 * - `msg` là object `{ user, text, ts }`; `ts` là chuỗi thời gian ISO như '2026-10-23T09:05:00Z'.
 * - `HH:MM` là 5 ký tự ở vị trí 11 đến 15 của `ts` (giống `ts[11:16]` trong Python).
 * - Thiếu `ts` (không có khóa này) → dùng `--:--` thay cho giờ.
 * - Khóa thừa trong `msg` bị bỏ qua.
 *
 * Ví dụ: formatMessage({ user: 'an', text: 'Chào', ts: '2026-10-23T09:05:00Z' }) → '[09:05] an: Chào'
 *        formatMessage({ user: 'an', text: 'Chào' })                              → '[--:--] an: Chào'
 *
 * @param {{user: string, text: string, ts?: string}} msg
 * @returns {string}
 */
export function formatMessage(msg) {
  // TODO: const { user, text, ts } = msg; rồi trả về một template literal `...${...}...`
  throw new Error('TODO: viết formatMessage');
}

// ---------- 3. Mảng, object, for...of ----------

/**
 * Danh sách người gửi KHÔNG trùng, theo thứ tự xuất hiện lần đầu.
 *
 * - `messages` là mảng object có khóa `user`.
 * - Trả về MẢNG MỚI các chuỗi; mảng rỗng → `[]`. Không sửa mảng đầu vào.
 *
 * Ví dụ: uniqueUsers([{ user: 'an' }, { user: 'binh' }, { user: 'an' }]) → ['an', 'binh']
 *
 * @param {{user: string}[]} messages
 * @returns {string[]}
 */
export function uniqueUsers(messages) {
  // TODO: tạo mảng rỗng, duyệt for (const m of messages), chỉ push tên chưa có
  throw new Error('TODO: viết uniqueUsers');
}

// ---------- 4. Hàm là giá trị: callback ----------

/**
 * Chọn các tin mà hàm `keep` (một callback) đồng ý giữ.
 *
 * - Gọi `keep(tin)` đúng MỘT lần cho mỗi tin, theo thứ tự.
 * - Giữ tin khi `keep(tin)` trả giá trị truthy. Trả về MẢNG MỚI, giữ thứ tự, không sửa đầu vào.
 *
 * Ví dụ: pickMessages(msgs, (m) => m.user === 'an') → chỉ các tin của an
 *
 * @param {object[]} messages
 * @param {(msg: object) => unknown} keep
 * @returns {object[]}
 */
export function pickMessages(messages, keep) {
  // TODO: duyệt messages, gọi keep(m), giữ m nếu kết quả truthy
  throw new Error('TODO: viết pickMessages');
}

// ---------- 5. Spread, giá trị mặc định ----------

/** Cấu hình mặc định của server (đã viết sẵn). */
export const DEFAULTS = { host: '127.0.0.1', port: 3000, path: '/ws' };

/**
 * Ghép cấu hình người dùng với `DEFAULTS`.
 *
 * - Trả về OBJECT MỚI có mọi khóa của `DEFAULTS`; khóa nào có trong `options` thì lấy giá trị của `options`.
 * - Khóa thêm trong `options` (vd. `debug`) cũng được giữ.
 * - Gọi không đối số `withDefaults()` → bản sao của `DEFAULTS`.
 * - Không sửa `options`, không sửa `DEFAULTS`.
 *
 * Ví dụ: withDefaults({ port: 8080 }) → { host: '127.0.0.1', port: 8080, path: '/ws' }
 *
 * @param {object} [options={}]
 * @returns {{host: string, port: number, path: string}}
 */
export function withDefaults(options = {}) {
  // TODO: tạo object mới bằng spread (...) từ DEFAULTS và options — khóa viết sau đè khóa viết trước
  throw new Error('TODO: viết withDefaults');
}

// ---------- 6. class, this, getter ----------

/** Hộp thư của một người: lưu tin, đếm tin chưa đọc. */
export class Inbox {
  /**
   * - Lưu `owner` vào `this.owner`.
   * - `this.items` bắt đầu là mảng rỗng.
   *
   * @param {string} owner
   */
  constructor(owner) {
    // TODO: this.owner = ...; this.items = ...
    throw new Error('TODO: viết Inbox.constructor');
  }

  /**
   * Thêm tin `{ text, read: false }` vào cuối `this.items`, trả về SỐ TIN hiện có trong hộp.
   *
   * Ví dụ: inbox.add('a') → 1, inbox.add('b') → 2
   *
   * @param {string} text
   * @returns {number}
   */
  add(text) {
    // TODO: this.items.push(...) rồi return ...
    throw new Error('TODO: viết Inbox.add');
  }

  /** Đánh dấu mọi tin là đã đọc (`read = true`). Không trả về gì. */
  markAllRead() {
    // TODO: duyệt this.items, gán read = true
    throw new Error('TODO: viết Inbox.markAllRead');
  }

  /**
   * Số tin chưa đọc. Là GETTER: đọc bằng `inbox.unreadCount` (không có dấu ngoặc).
   * @returns {number}
   */
  get unreadCount() {
    // TODO: đếm các tin có read === false
    throw new Error('TODO: viết Inbox.unreadCount');
  }
}

// ---------- 7. Closure: hàm nhớ biến của nơi tạo ra nó ----------

/**
 * Tạo một hàm sinh id. Mỗi lần gọi hàm được trả về → id kế tiếp: `<prefix>-1`, `<prefix>-2`, ...
 *
 * - Mỗi lần gọi `createIdGenerator` tạo một bộ đếm RIÊNG, bắt đầu từ 1.
 * - `prefix` mặc định là `'msg'`.
 *
 * Ví dụ: const next = createIdGenerator('an');  next() → 'an-1'   next() → 'an-2'
 *        createIdGenerator()() → 'msg-1'
 *
 * @param {string} [prefix='msg']
 * @returns {() => string}
 */
export function createIdGenerator(prefix = 'msg') {
  // TODO: let count = 0; return () => { ... }  — hàm bên trong nhớ được count
  throw new Error('TODO: viết createIdGenerator');
}

// ---------- 8. try/catch, JSON ----------

/**
 * Parse chuỗi JSON; chuỗi hỏng thì trả `fallback` thay vì ném lỗi.
 *
 * - JSON hợp lệ → giá trị parse được (kể cả `null`, số, mảng: `'null'` → `null`).
 * - JSON hỏng hoặc chuỗi rỗng → `fallback` (mặc định `null`). KHÔNG được ném lỗi ra ngoài.
 *
 * Ví dụ: parseJsonOr('{"a":1}') → { a: 1 }      parseJsonOr('{hỏng', {}) → {}
 *
 * @param {string} text
 * @param {unknown} [fallback=null]
 * @returns {unknown}
 */
export function parseJsonOr(text, fallback = null) {
  // TODO: try { return JSON.parse(text) } catch { ... }
  throw new Error('TODO: viết parseJsonOr');
}

// ---------- 9. Promise: await (và .then) ----------

/**
 * Chào một người dùng, tên lấy từ `getUser(id)` — một hàm trả Promise của `{ name }`.
 *
 * - Hàm `async`: luôn trả về Promise.
 * - Gọi `getUser(id)` đúng một lần; xong → `'Xin chào, <name>!'`.
 * - `getUser` bị reject (lỗi) → `'Xin chào, khách!'` (không ném lỗi ra ngoài).
 *
 * Ví dụ: await greetUser(async (id) => ({ name: 'An' }), 7) → 'Xin chào, An!'
 *
 * @param {(id: number) => Promise<{name: string}>} getUser
 * @param {number} id
 * @returns {Promise<string>}
 */
export async function greetUser(getUser, id) {
  // TODO: try { const user = await getUser(id); return ... } catch { return ... }
  throw new Error('TODO: viết greetUser');
}

// ---------- Chạy trực tiếp: node basics.js (đã viết sẵn) ----------
async function main() {
  const checks = [
    ['cleanName("  an ")', () => cleanName('  an ')],
    ['formatMessage(...)', () => formatMessage({ user: 'an', text: 'Deploy lúc 10h', ts: '2026-10-23T09:05:00Z' })],
    ['uniqueUsers(...)', () => uniqueUsers([{ user: 'an' }, { user: 'binh' }, { user: 'an' }])],
    ['pickMessages(..., m => m.user === "an")', () => pickMessages([{ user: 'an', text: 'a' }, { user: 'binh', text: 'b' }], (m) => m.user === 'an')],
    ['withDefaults({ port: 8080 })', () => withDefaults({ port: 8080 })],
    ['new Inbox("an"): add 2 tin', () => {
      const inbox = new Inbox('an');
      inbox.add('Chào');
      inbox.add('Họp lúc 10h');
      return `${inbox.owner} có ${inbox.unreadCount} tin chưa đọc`;
    }],
    ['createIdGenerator("an") gọi 2 lần', () => {
      const next = createIdGenerator('an');
      return [next(), next()];
    }],
    ['parseJsonOr("{hỏng", {})', () => parseJsonOr('{hỏng', {})],
    ['greetUser(...)', () => greetUser(async () => ({ name: 'An' }), 1)],
  ];
  for (const [label, run] of checks) {
    try {
      const value = await run();
      console.log(label.padEnd(42), '→', value);
    } catch (err) {
      console.log(label.padEnd(42), '→', err.message);
    }
  }
}

// Chỉ chạy main() khi gọi trực tiếp `node basics.js`, không chạy khi test import file này.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
