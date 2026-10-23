/**
 * TeamPulse — Bài N10: viết lại phần đọc/hiển thị tin nhắn bằng TypeScript.
 *
 * Chạy thử:     npm start          (node demo.ts — Node tự xoá kiểu rồi chạy)
 * Kiểm kiểu:    npm run typecheck  (tsc --noEmit — chỉ kiểm tra, không sinh file)
 * Chạy test:    npm test
 * Chạy riêng một nhóm test (vd. tên chứa "groupBy"):
 *   node --test --test-name-pattern="groupBy" "../../curriculum/N10-typescript-co-ban/tests/*.test.js"
 */
import { MAX_NAME, MAX_TEXT } from './types.ts';
import type { ParseResult, ServerMessage } from './types.ts';

/**
 * Đọc và kiểm tra MỘT tin client gửi lên. KHÔNG BAO GIỜ ném lỗi.
 *
 * - `JSON.parse(raw)` trong try/catch; lưu kết quả vào biến kiểu `unknown` (không dùng `any`).
 * - Lỗi parse, hoặc kết quả không phải object thường (null, mảng, số, chuỗi...) → `{ ok: false, error: 'invalid_json' }`.
 * - `type` không phải `'join'` hay `'chat'` → `'unknown_type'`.
 * - `join`: `name` phải là chuỗi, sau `trim()` dài 1..MAX_NAME → `{ ok: true, msg: { type: 'join', name } }`, sai → `'invalid_name'`.
 * - `chat`: `text` phải là chuỗi, sau `trim()` dài 1..MAX_TEXT → `{ ok: true, msg: { type: 'chat', text } }`, sai → `'invalid_text'`.
 * - `msg` chỉ giữ đúng các khóa trên (bỏ khóa thừa), giá trị đã trim.
 *
 * Ví dụ: parseClientMessage('{"type":"join","name":"  An "}') → { ok: true, msg: { type: 'join', name: 'An' } }
 *        parseClientMessage('[1,2]') → { ok: false, error: 'invalid_json' }
 */
export function parseClientMessage(raw: string): ParseResult {
  // TODO: JSON.parse trong try/catch vào biến unknown, kiểm tra object, rồi kiểm tra theo từng type
  throw new Error('TODO: viết parseClientMessage');
}

/**
 * Đổi một tin server thành MỘT dòng chữ để in ra màn hình (log, client dòng lệnh).
 *
 * - `welcome` → `Chào An! Đang online: An, Binh`        (users nối bằng ", ")
 * - `joined`  → `+ Binh vào phòng (2 online)`           (số = users.length)
 * - `left`    → `- Binh rời phòng (1 online)`
 * - `chat`    → `[09:05] An: Chào cả nhà`               (giờ:phút theo UTC của `ts`, luôn 2 chữ số)
 * - `error`   → `! Lỗi: name_taken`
 *
 * Dùng `switch (msg.type)`; nhánh `default` gán `msg` cho một biến kiểu `never`, để khi
 * ServerMessage có thêm loại tin mới mà hàm chưa xử lý, `npm run typecheck` báo lỗi.
 */
export function describeServerMessage(msg: ServerMessage): string {
  // TODO: switch (msg.type) với một case cho mỗi loại tin, default gán cho biến kiểu never
  throw new Error('TODO: viết describeServerMessage');
}

/**
 * Gom phần tử theo khóa — hàm generic: dùng được cho mảng bất kỳ kiểu `T`, và kết quả giữ đúng kiểu `T`.
 *
 * - `keyOf(item)` trả khóa (chuỗi) của từng phần tử.
 * - Trả object thường `{}`: mỗi khóa → mảng các phần tử có khóa đó, GIỮ thứ tự xuất hiện.
 * - Không sửa mảng `items` truyền vào. Mảng rỗng → `{}`.
 * - Phần tử trong mảng kết quả là CHÍNH object gốc (cùng tham chiếu, không sao chép).
 *
 * Ví dụ: groupBy([{ n: 'An', r: 'dev' }, { n: 'Binh', r: 'ops' }, { n: 'Chi', r: 'dev' }], (u) => u.r)
 *        → { dev: [{ n: 'An', r: 'dev' }, { n: 'Chi', r: 'dev' }], ops: [{ n: 'Binh', r: 'ops' }] }
 */
export function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Record<string, T[]> {
  // TODO: vòng lặp for...of, tạo mảng cho khóa mới, push vào mảng của khóa đã có
  throw new Error('TODO: viết groupBy');
}
