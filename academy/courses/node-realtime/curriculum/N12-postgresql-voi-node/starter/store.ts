/**
 * TeamPulse — Bài N12: ChatStore trên PostgreSQL, truy vấn có tham số, transaction.
 *
 * Chạy thử:   npm run demo     → migration, SQL injection (nối chuỗi vs $1), transaction — trên PGlite
 *             npm run migrate  → áp migration vào .pgdata/ (hoặc DATABASE_URL)
 *             npm start        → app Express của BẠN ở N11 + store này, cổng 3112
 * Kiểm kiểu:  npm run typecheck
 * Chạy test:  npm test
 * Chạy riêng một nhóm test (vd. tên chứa "searchMessages"):
 *   node --test --test-name-pattern="searchMessages" "../../curriculum/N12-postgresql-voi-node/tests/*.test.js"
 *
 * Luật cho MỌI câu SQL trong file này: giá trị từ bên ngoài đi qua tham số `$1, $2...` + mảng `params`.
 * KHÔNG ghép giá trị vào chuỗi SQL (`'...' + name`, template string `${name}`).
 */
import { acquire } from './db.ts';
import type { Db } from './db.ts';
import type { Channel, ChatStore, Message } from './types.ts';

/** Dòng `channels` như Postgres trả về (tên cột snake_case, thời gian là Date). */
interface ChannelRow {
  id: number;
  name: string;
  created_at: Date;
}

/** Dòng tin nhắn đã JOIN với users để có tên người gửi. */
interface MessageRow {
  id: number;
  channel_id: number;
  author: string;
  text: string;
  created_at: Date;
}

const toChannel = (r: ChannelRow): Channel => ({ id: r.id, name: r.name, createdAt: r.created_at.toISOString() });
const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  channelId: r.channel_id,
  author: r.author,
  text: r.text,
  createdAt: r.created_at.toISOString(),
});

/** Lỗi Postgres có `code` (SQLSTATE), vd. '23505' = vi phạm UNIQUE. CÓ SẴN. */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') return err.code;
  return undefined;
}

/**
 * ChatStore (interface của N11, xem types.ts) chạy trên bảng của 001_init.sql.
 *
 * - `listChannels()` — mọi kênh, theo `id` tăng dần.
 * - `getChannel(id)` — kênh hoặc `undefined`.
 * - `createChannel(name)` — INSERT ... RETURNING; tên trùng → `null` (không ném lỗi). Hai cách: `ON CONFLICT (name) DO NOTHING`
 *   (không có dòng nào trả về = trùng), hoặc bắt lỗi có `pgErrorCode(err) === '23505'`. Cách đầu dùng được cả trong transaction.
 * - `listMessages(channelId, { limit, before })` — tin của kênh, `id` GIẢM dần, chỉ `id < before` khi có `before`,
 *   tối đa `limit`; `author` = `users.name` (JOIN). Một câu SQL: `before` vắng thì truyền `null` và viết
 *   điều kiện `($2::int IS NULL OR m.id < $2)`.
 * - `addMessage({ channelId, author, text })` — người gửi chưa có trong `users` thì tạo (theo `name`), có rồi thì dùng lại;
 *   rồi INSERT tin; trả Message vừa lưu (author là tên).
 *   Kênh `channelId` không tồn tại → để lỗi khóa ngoại của Postgres (`pgErrorCode(err) === '23503'`) ném ra ngoài;
 *   không tự kiểm tra trước rồi trả giá trị khác.
 * - Mọi `createdAt` là chuỗi ISO (`Date.toISOString()`); đổi tên cột snake_case → camelCase.
 */
export function createPgStore(db: Db): ChatStore {
  // TODO: trả object có 5 hàm async của ChatStore; mọi giá trị qua $1, $2…
  throw new Error('TODO: viết createPgStore');
}

/**
 * Tìm tin trong MỘT kênh có chứa `q` (không phân biệt hoa thường), `id` giảm dần, tối đa 50 tin.
 *
 * - `q` do người dùng gõ: đi qua tham số, KHÔNG ghép vào SQL.
 * - `%` và `_` trong `q` là ký tự thường (tìm "50%" chỉ ra tin có chữ "50%"); lưu ý trong LIKE/ILIKE
 *   chúng là ký tự đại diện.
 * - `q` rỗng hoặc toàn khoảng trắng → `[]` (không truy vấn).
 */
export async function searchMessages(db: Db, channelId: number, q: string): Promise<Message[]> {
  // TODO: q rỗng → []; một câu SELECT có tham số, không phân biệt hoa thường, % và _ là ký tự thường
  throw new Error('TODO: viết searchMessages');
}

/**
 * Chạy `fn` trong MỘT transaction: tất cả câu trong `fn` cùng thành công, hoặc không câu nào có hiệu lực.
 *
 * 1. `const { conn, release } = await acquire(db)` — mượn một kết nối (với pg.Pool là bắt buộc).
 * 2. `BEGIN` trên `conn` → `const result = await fn(conn)` → `COMMIT` → trả `result`.
 * 3. `fn` ném lỗi (hoặc COMMIT lỗi) → `ROLLBACK` trên `conn` rồi ném lại ĐÚNG lỗi đó.
 * 4. Luôn `release()` đúng một lần, kể cả khi lỗi (`finally`).
 * Mọi câu SQL trong `fn` phải chạy trên `tx` được truyền vào, không phải `db` gốc.
 */
export async function withTransaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  // TODO: acquire(db) → BEGIN → fn(conn) → COMMIT; lỗi → ROLLBACK + throw; finally release()
  throw new Error('TODO: viết withTransaction');
}

/**
 * Tạo kênh KÈM tin chào đầu tiên — hai việc phải cùng có hoặc cùng không (dùng `withTransaction`).
 *
 * Trong transaction, trên `tx`:
 * 1. INSERT kênh `name`. Tên trùng → kết thúc transaction không thay đổi gì và trả `null`.
 * 2. Tạo/dùng lại người dùng `owner` và INSERT tin `"<owner> đã tạo kênh #<name>"` vào kênh mới
 *    (gợi ý: `createPgStore(tx).addMessage(...)`).
 * 3. Trả `{ channel, message }`.
 * Bất kỳ bước nào lỗi (vd. mất kết nối giữa bước 1 và 2) → không còn kênh "mồ côi" thiếu tin chào; lỗi ném ra ngoài.
 */
export async function createChannelWithWelcome(
  db: Db,
  { name, owner }: { name: string; owner: string },
): Promise<{ channel: Channel; message: Message } | null> {
  // TODO: withTransaction(db, async (tx) => { ... }) — mọi câu chạy trên tx
  throw new Error('TODO: viết createChannelWithWelcome');
}
