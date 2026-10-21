/**
 * TeamPulse — Bài N01: đọc log chat bằng Node.js.
 *
 * File `messages.jsonl` lưu lịch sử chat, MỖI DÒNG là một chuỗi JSON:
 *   {"user": "an", "text": "Chào cả nhóm", "ts": "2026-10-23T08:58:02Z"}
 * File thật luôn có dòng trống, dòng JSON hỏng, dòng thiếu người gửi — code phải bỏ qua chúng.
 *
 * Chạy thử:   npm start            (sau khi thêm scripts.start vào package.json)
 *             hoặc: node chatlog.js
 * Chạy test:  node --test "../../curriculum/N01-node-co-ban/tests/*.test.js"
 *             (hoặc bấm "Chạy test" trên web app)
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/**
 * Đọc MỘT dòng log, trả về object `{ user, text, ts }` hoặc `null`.
 *
 * - Dòng là chuỗi JSON. JSON hỏng → trả `null` (KHÔNG được ném lỗi ra ngoài).
 * - Dòng rỗng hoặc chỉ có khoảng trắng → `null`.
 * - `user` phải là chuỗi, sau khi bỏ khoảng trắng hai đầu (trim) còn ít nhất 1 ký tự; nếu không → `null`.
 * - `text` và `ts` phải là chuỗi; nếu không → `null`.
 * - Kết quả chỉ có đúng 3 khóa `user` (đã trim), `text`, `ts` — bỏ mọi khóa thừa.
 *
 * Ví dụ: parseLine('{"user":" an ","text":"Hi","ts":"2026-10-23T09:00:00Z"}')
 *        → { user: "an", text: "Hi", ts: "2026-10-23T09:00:00Z" }
 *
 * @param {string} line
 * @returns {{user: string, text: string, ts: string} | null}
 */
export function parseLine(line) {
  // TODO: try { JSON.parse(...) } catch { return null }, rồi kiểm tra từng trường bằng typeof
  throw new Error('TODO: viết parseLine');
}

/**
 * Đếm số tin theo người gửi, trả về object thường `{ tên: số_tin }`.
 *
 * - Không sửa mảng đầu vào.
 * - Mảng rỗng → `{}`.
 *
 * Ví dụ: countByUser([{user:"an"}, {user:"binh"}, {user:"an"}]) → { an: 2, binh: 1 }
 *
 * @param {{user: string}[]} messages
 * @returns {Record<string, number>}
 */
export function countByUser(messages) {
  // TODO: tạo object rỗng, duyệt từng tin, tăng bộ đếm
  throw new Error('TODO: viết countByUser');
}

/**
 * Đọc file log (JSON Lines) và trả về Promise của mảng tin hợp lệ.
 *
 * - Đọc bằng `readFile(path, 'utf8')` của `node:fs/promises` (bất đồng bộ, KHÔNG dùng readFileSync).
 * - Tách dòng theo "\n" (dòng có thể kết thúc bằng "\r\n" kiểu Windows — vẫn phải đọc được).
 * - Dùng `parseLine` cho từng dòng, bỏ các dòng trả `null`, giữ nguyên thứ tự trong file.
 * - File không tồn tại (lỗi có `code === 'ENOENT'`) → trả `[]`. Lỗi khác → ném tiếp.
 *
 * @param {string} path
 * @returns {Promise<{user: string, text: string, ts: string}[]>}
 */
export async function loadMessages(path) {
  // TODO: const content = await readFile(path, 'utf8') trong try/catch
  throw new Error('TODO: viết loadMessages');
}

/**
 * Trả về Promise hoàn thành (resolve, giá trị `undefined`) sau ít nhất `ms` mili giây.
 *
 * Ví dụ: await delay(200)  // chờ 0,2 giây mà không chặn chương trình
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
  // TODO: return new Promise((resolve) => ...) với setTimeout
  throw new Error('TODO: viết delay');
}

/**
 * Chờ `promise` nhưng không quá `ms` mili giây.
 *
 * - `promise` xong trước `ms` → resolve đúng giá trị của nó.
 * - `promise` bị reject trước `ms` → reject với ĐÚNG lỗi đó.
 * - Quá `ms` mà chưa xong → reject với `new Error('timeout')` (message đúng là "timeout").
 * - Nên huỷ bộ hẹn giờ (`clearTimeout`) khi promise xong sớm để chương trình không phải chờ thừa.
 *
 * Ví dụ: await withTimeout(delay(10), 100)        → undefined
 *        await withTimeout(delay(500), 50)        → lỗi "timeout"
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms) {
  // TODO: viết theo Bước 6a–6e của bài (ví dụ mẫu cùng khuôn: firstOrDefault). Các phần cần có:
  //   6a. trả về một Promise mới
  //   6b. hết ms → Promise đó thất bại với Error có message 'timeout'
  //   6c. promise gốc xong trước → xong theo nó (cùng giá trị / đúng lỗi đó)
  //   6d. promise gốc xong trước → huỷ hẹn giờ
  throw new Error('TODO: viết withTimeout');
}

// ---------- Chạy trực tiếp: node chatlog.js (đã viết sẵn) ----------
async function main() {
  const file = new URL('./messages.jsonl', import.meta.url);
  const raw = await readFile(file, 'utf8');
  const messages = await loadMessages(file);
  console.log(`Đọc ${raw.trimEnd().split('\n').length} dòng, hợp lệ ${messages.length} tin`);
  console.log('Theo người gửi:', countByUser(messages));

  const t0 = Date.now();
  await Promise.all([delay(300), delay(300), delay(300)]);
  console.log(`3 lần delay(300) song song: ${Date.now() - t0} ms`);

  const t1 = Date.now();
  try {
    await withTimeout(delay(1000), 200);
  } catch (err) {
    console.log(`withTimeout(delay(1000), 200) → lỗi "${err.message}" sau ${Date.now() - t1} ms`);
  }
}

// Chỉ chạy main() khi file được gọi trực tiếp bằng `node chatlog.js`, không chạy khi test import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
