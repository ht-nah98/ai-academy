/**
 * TeamPulse — kết nối cơ sở dữ liệu. File này CÓ SẴN.
 *
 * `Db` là interface nhỏ nhất mà code của bạn cần: chạy MỘT câu SQL có tham số, nhận lại các dòng.
 * Cả PGlite (Postgres chạy trong tiến trình Node, dùng cho test và máy học viên) lẫn `pg.Pool` /
 * `pg.PoolClient` (Postgres thật qua mạng) đều khớp interface này — code nhận `Db` chạy được với cả hai.
 */
import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Db mà `acquire` biết mượn riêng một kết nối: `pg.Pool` có `connect()`. */
interface PoolLike extends Db {
  connect(): Promise<Db & { release(): void }>;
}

function isPool(db: Db): db is PoolLike {
  return typeof (db as Partial<PoolLike>).connect === 'function';
}

/**
 * Mượn MỘT kết nối để chạy nhiều câu liên tiếp trên cùng kết nối (bắt buộc cho transaction).
 *
 * - `pg.Pool` giữ nhiều kết nối; mỗi `pool.query()` có thể đi một kết nối khác → BEGIN ở kết nối A,
 *   INSERT ở kết nối B, COMMIT ở kết nối C: transaction vô nghĩa. Nên với pool: `pool.connect()` lấy
 *   một client, xong thì `release()` trả lại pool.
 * - PGlite hoặc một client đã mượn: bản thân nó là một kết nối → dùng luôn, `release` không làm gì.
 */
export async function acquire(db: Db): Promise<{ conn: Db; release: () => void }> {
  if (isPool(db)) {
    const client = await db.connect();
    return { conn: client, release: () => client.release() };
  }
  return { conn: db, release: () => {} };
}

/**
 * Tách nội dung một file .sql thành từng câu lệnh (PGlite và câu có tham số chỉ nhận MỘT câu mỗi lần).
 * Quy ước đơn giản của khóa: mỗi câu kết thúc bằng `;` ở CUỐI DÒNG; dòng bắt đầu bằng `--` là chú thích.
 * Không dùng `;` ở cuối dòng bên trong chuỗi hay thân hàm SQL.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  for (const line of sql.split(/\r?\n/)) {
    if (line.trim().startsWith('--')) continue;
    current.push(line);
    if (line.trimEnd().endsWith(';')) {
      const text = current.join('\n').trim();
      if (text !== ';') statements.push(text.slice(0, -1).trim());
      current = [];
    }
  }
  const rest = current.join('\n').trim();
  if (rest !== '') statements.push(rest);
  return statements;
}

/**
 * Mở cơ sở dữ liệu cho `npm start` / `npm run migrate`:
 * - Có biến môi trường `DATABASE_URL` (vd. postgres://teampulse:teampulse@127.0.0.1:5432/teampulse) → Postgres thật qua `pg.Pool`.
 * - Không có → PGlite lưu trong thư mục `.pgdata/` của workspace (tắt đi mở lại vẫn còn dữ liệu).
 */
export async function openDb(): Promise<{ db: Db; kind: string; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    await pool.query('SELECT 1');
    return { db: pool, kind: `PostgreSQL ${new URL(url).host}`, close: () => pool.end() };
  }
  mkdirSync('.pgdata', { recursive: true });
  const lite = new PGlite('./.pgdata');
  return { db: lite, kind: 'PGlite ./.pgdata', close: () => lite.close() };
}
