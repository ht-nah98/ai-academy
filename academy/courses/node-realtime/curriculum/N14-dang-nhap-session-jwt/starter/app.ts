/**
 * TeamPulse — REST API của N11 (Express 5 + zod). File này CÓ SẴN: lời giải N11, chỉ đổi chỗ import
 * `ChatStore` sang `types.ts` (như N12). Không cần sửa.
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
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { ChatStore } from './types.ts';

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

export const ChannelBody = z.object({
  name: z.string().trim().regex(/^[a-z0-9-]{2,32}$/, 'chỉ gồm a-z, 0-9, -, dài 2–32'),
});

export const MessageBody = z.object({
  author: z.string().trim().min(1).max(32),
  text: z.string().trim().min(1).max(2000),
});

export const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.coerce.number().int().positive().optional(),
});

export const IdParams = z.object({
  id: z.coerce.number().int().positive(),
});

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
  const details: FieldIssue[] = [];
  for (const issue of error.issues) {
    const field = issue.path.length === 0 ? '*' : issue.path.join('.');
    details.push({ field, message: issue.message });
  }
  return { error: 'validation_failed', in: source, details };
}

/**
 * Kiểm tra `value` theo `schema` NGAY Ở CỬA VÀO của handler.
 *
 * - Hợp lệ → trả dữ liệu ĐÃ CHUẨN HOÁ (đã trim, đã đổi kiểu, có giá trị mặc định) — kiểu TS là `z.infer<S>`.
 * - Không hợp lệ → `throw new HttpError(400, toValidationError(err, source))`.
 * Dùng `schema.safeParse(value)`.
 */
export function validate<S extends z.ZodType>(schema: S, value: unknown, source: Source): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, toValidationError(result.error, source));
  }
  return result.data;
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
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json(err.body);
    return;
  }
  const type = typeof err === 'object' && err !== null && 'type' in err ? err.type : undefined;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_json' });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal' });
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
  const app = express();

  app.use((req, res, next) => {
    const incoming = req.get('x-request-id');
    res.set('X-Request-Id', incoming ?? randomUUID());
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/channels', async (req, res) => {
    res.json({ items: await store.listChannels() });
  });

  app.post('/channels', async (req, res) => {
    const { name } = validate(ChannelBody, req.body, 'body');
    const channel = await store.createChannel(name);
    if (channel === null) {
      throw new HttpError(409, { error: 'channel_exists' });
    }
    res.status(201).location(`/channels/${channel.id}`).json(channel);
  });

  async function requireChannel(rawParams: unknown) {
    const { id } = validate(IdParams, rawParams, 'params');
    const channel = await store.getChannel(id);
    if (channel === undefined) {
      throw new HttpError(404, { error: 'channel_not_found' });
    }
    return channel;
  }

  app.get('/channels/:id', async (req, res) => {
    res.json(await requireChannel(req.params));
  });

  app.get('/channels/:id/messages', async (req, res) => {
    const channel = await requireChannel(req.params);
    const { limit, before } = validate(ListQuery, req.query, 'query');
    const rows = await store.listMessages(channel.id, { limit: limit + 1, before });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const nextBefore = rows.length > limit && last !== undefined ? last.id : null;
    res.json({ items, nextBefore });
  });

  app.post('/channels/:id/messages', async (req, res) => {
    const channel = await requireChannel(req.params);
    const { author, text } = validate(MessageBody, req.body, 'body');
    const message = await store.addMessage({ channelId: channel.id, author, text });
    res.status(201).json(message);
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  app.use(errorHandler);
  return app;
}
