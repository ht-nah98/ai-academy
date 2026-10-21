/**
 * TeamPulse — Bài N09: bộ công cụ test & đo cho ứng dụng realtime.
 *
 * Dùng ở: chat.test.js (test bạn tự viết cho chat-server.js) và load.js (đo tải).
 *
 * Chạy test chấm bài:    npm test
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
  // TODO: new Promise; gắn onMessage/onClose; setTimeout; hàm cleanup gỡ cả ba
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
  // TODO: mở kết nối, gửi, đếm, đo độ trễ, đóng, tính kết quả
  throw new Error('TODO: viết runLoadTest');
}
