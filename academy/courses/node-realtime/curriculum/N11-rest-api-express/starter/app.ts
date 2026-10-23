/**
 * TeamPulse — Bài N11: REST API cho kênh và tin nhắn, viết bằng Express 5 + zod.
 *
 *   Method  Đường dẫn                      Thành công                       Lỗi
 *   GET     /health                        200 { ok: true }
 *   GET     /channels                      200 { items: Channel[] }
 *   POST    /channels                      201 Channel + header Location     400 validation_failed · 409 channel_exists
 *   GET     /channels/:id                  200 Channel                       400 validation_failed · 404 channel_not_found
 *   GET     /channels/:id/messages         200 { items, nextBefore }         400 validation_failed · 404 channel_not_found
 *   POST    /channels/:id/messages         201 Message                       400 validation_failed · 404 channel_not_found
 *   (mọi đường dẫn khác)                                                     404 not_found
 *   JSON hỏng 400 bad_json · body > 16kb 413 payload_too_large · lỗi không lường trước 500 internal
 *
 * Chạy thử:   npm start      → http://127.0.0.1:3110 (có sẵn kênh general, dev và vài tin)
 *             npm run demo   → gọi lần lượt các route, in status + body
 * Kiểm kiểu:  npm run typecheck
 * Chạy test:  npm test
 * Chạy riêng một nhóm test (vd. tên chứa "createApp"):
 *   node --test --test-name-pattern="createApp" "../../curriculum/N11-rest-api-express/tests/*.test.js"
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { ChatStore } from './store.ts';

z.config(z.locales.vi()); // thông báo lỗi của zod bằng tiếng Việt

/** Một lỗi của một trường dữ liệu. */
export interface FieldIssue {
  field: string;
  message: string;
}

/** Body JSON của MỌI response lỗi. */
export interface ErrorBody {
  error: string;
  in?: Source;
  details?: FieldIssue[];
}

/** Dữ liệu đến từ đâu trong request. */
export type Source = 'body' | 'query' | 'params';

/** Lỗi mang sẵn status + body để errorHandler trả về. CÓ SẴN. */
export class HttpError extends Error {
  status: number;
  body: ErrorBody;
  constructor(status: number, body: ErrorBody) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Schemas (zod) — hình dạng dữ liệu vào. Mỗi schema vừa kiểm tra lúc chạy, vừa cho kiểu TS (z.infer).
//
// ChannelBody   { name }            name: chuỗi, trim, khớp /^[a-z0-9-]{2,32}$/ (chữ thường, số, gạch ngang, 2–32 ký tự)
// MessageBody   { author, text }    author: chuỗi, trim, dài 1–32; text: chuỗi, trim, dài 1–2000
// ListQuery     { limit, before? }  query luôn là CHUỖI → dùng z.coerce.number();
//                                   limit: số nguyên 1–100, mặc định 20; before: số nguyên dương, không bắt buộc
// IdParams      { id }              id: z.coerce.number(), số nguyên dương
// Khóa thừa bị bỏ (mặc định của z.object).
// ---------------------------------------------------------------------------

// TODO: viết 4 schema theo bảng trên. Hiện mỗi schema là object rỗng nên test "schemas" fail.
export const ChannelBody = z.object({});

export const MessageBody = z.object({});

export const ListQuery = z.object({});

export const IdParams = z.object({});

/**
 * Đổi một ZodError thành body lỗi 400 thống nhất.
 *
 * Trả `{ error: 'validation_failed', in: source, details }`, `details` theo đúng thứ tự `error.issues`:
 * mỗi issue → `{ field: issue.path.join('.'), message: issue.message }`; path rỗng (cả body sai, vd. body
 * không phải object) → `field: '*'`.
 *
 * Ví dụ: MessageBody.safeParse({ author: '', text: 5 }).error
 *   → { error: 'validation_failed', in: 'body', details: [{ field: 'author', message: '...' }, { field: 'text', message: '...' }] }
 */
export function toValidationError(error: z.ZodError, source: Source): ErrorBody {
  // TODO: vòng lặp qua error.issues, field = path nối bằng ".", path rỗng → "*"
  throw new Error('TODO: viết toValidationError');
}

/**
 * Kiểm tra `value` theo `schema` NGAY Ở CỬA VÀO của handler.
 *
 * - Hợp lệ → trả dữ liệu ĐÃ CHUẨN HOÁ (đã trim, đã đổi kiểu, có giá trị mặc định) — kiểu TS là `z.infer<S>`.
 * - Không hợp lệ → `throw new HttpError(400, toValidationError(err, source))`.
 * Dùng `schema.safeParse(value)`.
 */
export function validate<S extends z.ZodType>(schema: S, value: unknown, source: Source): z.infer<S> {
  // TODO: schema.safeParse(value); sai → throw new HttpError(400, toValidationError(...))
  throw new Error('TODO: viết validate');
}

/**
 * Middleware xử lý lỗi của Express (đủ 4 tham số thì Express mới coi là error handler).
 *
 * - `err` là `HttpError` → `res.status(err.status).json(err.body)`.
 * - JSON hỏng từ `express.json()` (`err.type === 'entity.parse.failed'`) → 400 `{ error: 'bad_json' }`.
 * - Body quá lớn (`err.type === 'entity.too.large'`) → 413 `{ error: 'payload_too_large' }`.
 * - Mọi lỗi khác → `console.error(err)` rồi 500 `{ error: 'internal' }` — KHÔNG gửi message/stack cho client.
 * - Nếu `res.headersSent` (đã gửi dở response) → `next(err)` để Express tự đóng kết nối.
 * `err` có kiểu `unknown`: kiểm tra trước khi đọc `.type` (`typeof err === 'object' && err !== null && 'type' in err`).
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  // TODO: headersSent → next(err); HttpError; entity.parse.failed; entity.too.large; còn lại 500
  throw new Error('TODO: viết errorHandler');
}

/**
 * Tạo app Express (CHƯA listen) theo bảng route ở đầu file. `store` truyền vào (test dùng store bộ nhớ).
 *
 * Thứ tự middleware:
 * 1. Gắn header `X-Request-Id` cho MỌI response: lấy từ header `x-request-id` của request nếu có, không thì `randomUUID()`.
 * 2. `express.json({ limit: '16kb' })`.
 * 3. Các route. Mỗi handler: `validate(...)` params/query/body trước, rồi mới gọi `store`.
 *    Request có content-type không phải JSON thì `express.json()` bỏ qua và `req.body` là `undefined`:
 *    truyền thẳng `req.body` cho `validate` để ra 400 `validation_failed` với `field: '*'` (đừng thay bằng `req.body ?? {}`).
 *    - POST /channels: `store.createChannel(name)` trả `null` → 409 `{ error: 'channel_exists' }`;
 *      thành công → 201, header `Location: /channels/<id>`, body là kênh.
 *    - GET /channels/:id/messages: kênh không tồn tại → 404 `channel_not_found`. Phân trang kiểu cursor:
 *      gọi `store.listMessages(id, { limit: limit + 1, before })` (lấy THỪA 1 tin để biết còn trang sau không);
 *      trả `{ items: <tối đa limit tin>, nextBefore: <id tin cuối của items nếu còn trang sau, không thì null> }`.
 *    - POST /channels/:id/messages: kênh không tồn tại → 404; thành công → 201, body là tin vừa lưu.
 * 4. Không khớp route nào → 404 `{ error: 'not_found' }`.
 * 5. `errorHandler` đặt CUỐI CÙNG.
 * Express 5 tự chuyển lỗi của handler `async` (throw hoặc Promise reject) tới errorHandler — không cần try/catch.
 */
export function createApp(store: ChatStore): express.Express {
  // TODO: middleware X-Request-Id → express.json → các route → 404 → errorHandler
  throw new Error('TODO: viết createApp');
}
