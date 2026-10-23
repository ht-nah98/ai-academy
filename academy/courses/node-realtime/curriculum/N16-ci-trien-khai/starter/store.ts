/**
 * TeamPulse — ChatStore trên PostgreSQL của N12. File này CÓ SẴN (lời giải N12). Không cần sửa.
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
  return {
    async listChannels() {
      const { rows } = await db.query<ChannelRow>('SELECT id, name, created_at FROM channels ORDER BY id');
      return rows.map(toChannel);
    },
    async getChannel(id) {
      const { rows } = await db.query<ChannelRow>('SELECT id, name, created_at FROM channels WHERE id = $1', [id]);
      const row = rows[0];
      return row === undefined ? undefined : toChannel(row);
    },
    async createChannel(name) {
      const { rows } = await db.query<ChannelRow>(
        'INSERT INTO channels (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name, created_at',
        [name],
      );
      const row = rows[0];
      return row === undefined ? null : toChannel(row);
    },
    async listMessages(channelId, { limit, before }) {
      const { rows } = await db.query<MessageRow>(
        `SELECT m.id, m.channel_id, u.name AS author, m.text, m.created_at
           FROM messages m JOIN users u ON u.id = m.user_id
          WHERE m.channel_id = $1 AND ($2::int IS NULL OR m.id < $2)
          ORDER BY m.id DESC
          LIMIT $3`,
        [channelId, before ?? null, limit],
      );
      return rows.map(toMessage);
    },
    async addMessage({ channelId, author, text }) {
      const user = await db.query<{ id: number }>(
        'INSERT INTO users (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [author],
      );
      const { rows } = await db.query<MessageRow>(
        `INSERT INTO messages (channel_id, user_id, text) VALUES ($1, $2, $3)
         RETURNING id, channel_id, $4::text AS author, text, created_at`,
        [channelId, user.rows[0]!.id, text, author],
      );
      return toMessage(rows[0]!);
    },
  };
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
  if (q.trim() === '') return [];
  const { rows } = await db.query<MessageRow>(
    `SELECT m.id, m.channel_id, u.name AS author, m.text, m.created_at
       FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = $1 AND strpos(lower(m.text), lower($2)) > 0
      ORDER BY m.id DESC
      LIMIT 50`,
    [channelId, q],
  );
  return rows.map(toMessage);
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
  const { conn, release } = await acquire(db);
  try {
    await conn.query('BEGIN');
    try {
      const result = await fn(conn);
      await conn.query('COMMIT');
      return result;
    } catch (err) {
      await conn.query('ROLLBACK');
      throw err;
    }
  } finally {
    release();
  }
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
  return withTransaction(db, async (tx) => {
    const store = createPgStore(tx);
    const channel = await store.createChannel(name);
    if (channel === null) return null;
    const message = await store.addMessage({ channelId: channel.id, author: owner, text: `${owner} đã tạo kênh #${name}` });
    return { channel, message };
  });
}
