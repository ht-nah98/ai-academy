/**
 * TeamPulse — Bài N09: bộ công cụ test & đo cho ứng dụng realtime.
 *
 * Dùng ở: chat.test.js (test bạn tự viết cho chat-server.js) và load.js (đo tải).
 *
 * Chạy test chấm bài:    npm test
 * Chạy riêng một nhóm:   node --test --test-name-pattern="waitForMessage" "../../curriculum/N09-test-debug-realtime/tests/*.test.js"
 * Chạy test của bạn:     npm run test:mine
 * Đo tải:                npm run load        (LOAD_CLIENTS, LOAD_MSGS để đổi số client / số tin)
 */
import { WebSocket } from 'ws';

/**
 * Chờ tin JSON đầu tiên trên `ws` thoả `predicate`. Thay cho `sleep(...)` rồi hy vọng tin đã tới.
 *
 * - Mỗi tin nhận được: `JSON.parse(String(data))`; tin không phải JSON thì bỏ qua (không reject).
 * - Tin đầu tiên mà `predicate(msg)` trả true → resolve `msg`.
 * - Hết `timeoutMs` mà chưa có → reject `Error` có message bắt đầu bằng `'timeout'`.
 * - Kết nối đóng trước khi có tin phù hợp → reject `Error` có message bắt đầu bằng `'closed'`.
 * - Dù resolve hay reject: GỠ listener `message`/`close` đã gắn và `clearTimeout` — không để rò listener.
 *   (Sau khi xong, `ws.listenerCount('message')` phải trở về như trước khi gọi.)
 * - CHỈ thấy tin đến SAU khi gọi hàm: hãy gọi `waitForMessage` TRƯỚC hành động làm tin đó được gửi.
 *
 * @param {import('ws').WebSocket} ws
 * @param {(msg: any) => boolean} [predicate]
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<any>}
 */
export function waitForMessage(ws, predicate = () => true, { timeoutMs = 2000 } = {}) {
  // Khung gợi ý (Bước 2 trong bài) — giống withTimeout ở N01, thêm lọc predicate và gỡ listener:
  //
  // return new Promise((resolve, reject) => {
  //   let timer = null;
  //   function cleanup() { ... }        // clearTimeout(timer); ws.off('message', onMessage); ws.off('close', onClose)
  //   function onMessage(data) { ... }  // JSON.parse trong try (hỏng → return); predicate sai → return; đúng → cleanup(), resolve(msg)
  //   function onClose() { ... }        // cleanup(), reject(new Error('closed: ...'))
  //   timer = setTimeout(() => { ... }, timeoutMs);   // cleanup(), reject(new Error('timeout: ...'))
  //   ws.on('message', onMessage);
  //   ws.on('close', onClose);
  // });
  // TODO: viết theo khung trên
  throw new Error('TODO: viết waitForMessage');
}

/**
 * Phân vị theo "nearest-rank": giá trị nhỏ nhất mà ít nhất p% số mẫu ≤ nó.
 *
 * - `values` rỗng → `null`.
 * - Sắp xếp BẢN SAO tăng dần THEO SỐ (không sửa mảng truyền vào).
 * - `rank = Math.ceil(p / 100 × n)`; nếu rank < 1 thì lấy 1. Kết quả = phần tử thứ `rank` (đếm từ 1).
 *
 * Ví dụ: percentile([15, 20, 35, 40, 50], 30) → 20;  percentile([3, 1, 2], 50) → 2;  percentile([10, 9, 1], 100) → 10
 *
 * @param {number[]} values
 * @param {number} p  0–100
 * @returns {number | null}
 */
export function percentile(values, p) {
  // TODO: sắp xếp bản sao, tính rank, trả phần tử
  throw new Error('TODO: viết percentile');
}

/**
 * Đo tải một server chat (giao thức của chat-server.js).
 *
 * 1. Mở `clients` kết nối tới `${url}?name=load<i>` (i = 0, 1, ...); chờ TẤT CẢ mở xong.
 * 2. Ghi `t0 = performance.now()`. Mỗi client gửi `messagesPerClient` tin `{type: 'chat', text: 'load', sentAt: performance.now()}`.
 * 3. Mỗi tin `{type: 'chat'}` client nhận được tính vào `received`. Tin của CHÍNH client đó (from === tên của nó)
 *    → độ trễ = `performance.now() - msg.sentAt` (ms).
 * 4. Xong khi `received === expected` (`expected = clients × clients × messagesPerClient`: mỗi tin tới mọi client)
 *    hoặc hết `timeoutMs`. `durationMs = performance.now() - t0`.
 * 5. Đóng mọi kết nối (`terminate()`) trước khi trả kết quả.
 *
 * Trả về: `{ clients, sent, received, expected, durationMs, msgsPerSec, latency: { p50, p95, p99, max } }`
 * với `msgsPerSec = Math.round(received / (durationMs / 1000))`, p50/p95/p99 dùng `percentile`, `max` = độ trễ lớn nhất.
 *
 * @param {{url: string, clients?: number, messagesPerClient?: number, timeoutMs?: number}} options
 * @returns {Promise<{clients: number, sent: number, received: number, expected: number, durationMs: number,
 *                    msgsPerSec: number, latency: {p50: number, p95: number, p99: number, max: number}}>}
 */
export async function runLoadTest({ url, clients = 10, messagesPerClient = 20, timeoutMs = 10000 }) {
  // Khung (Bước 5 trong bài). Bước 1 và 5 đã viết sẵn dưới đây ở dạng chú thích — bỏ dấu // để dùng;
  // bạn viết bước 2–4 và phần tính kết quả.
  //
  // // Bước 1 — mở `clients` kết nối, chờ TẤT CẢ mở xong
  // const sockets = [];
  // for (let i = 0; i < clients; i += 1) {
  //   sockets.push(new WebSocket(`${url}?name=load${i}`));
  // }
  // await Promise.all(sockets.map((ws) => new Promise((resolve, reject) => {
  //   ws.once('open', resolve);
  //   ws.once('error', reject);
  // })));
  //
  // // Bước 3 + 4 — gắn listener 'message' cho từng client TRƯỚC khi gửi:
  // //   đếm received; tin của chính client (from === `load${i}`) → đẩy độ trễ vào mảng latencies;
  // //   đủ `expected` thì báo xong. Gợi ý "báo xong": let finish; const done = new Promise((r) => { finish = r; });
  //
  // // Bước 2 — t0 = performance.now(); mỗi client gửi messagesPerClient tin {type: 'chat', text: 'load', sentAt: performance.now()}
  //
  // // Bước 4 — chờ `done` hoặc hết timeoutMs (setTimeout(finish, timeoutMs), nhớ clearTimeout); durationMs = performance.now() - t0
  //
  // // Bước 5 — đóng mọi kết nối
  // for (const ws of sockets) ws.terminate();
  //
  // // Kết quả: { clients, sent, received, expected, durationMs, msgsPerSec, latency: { p50, p95, p99, max } }
  // TODO: viết theo khung trên
  throw new Error('TODO: viết runLoadTest');
}
