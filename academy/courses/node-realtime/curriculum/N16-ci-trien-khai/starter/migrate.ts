/**
 * TeamPulse — chạy migration (các file .sql trong migrations/, theo thứ tự tên). File này CÓ SẴN (lời giải N12).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { splitStatements } from './db.ts';
import type { Db } from './db.ts';

/**
 * Áp các migration CHƯA chạy, theo thứ tự tên file. Chạy lại bao nhiêu lần cũng an toàn (idempotent).
 *
 * `db` phải là MỘT kết nối (PGlite, hoặc client từ `pool.connect()` — xem `acquire` trong db.ts).
 *
 * 1. `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.
 * 2. Đọc tên các version đã chạy từ `schema_migrations`.
 * 3. Liệt kê file trong `dir` có đuôi `.sql`, sắp theo tên (`001_...` trước `002_...`); bỏ qua file khác.
 * 4. Với mỗi file chưa có trong `schema_migrations` (version = TÊN FILE, vd. `'001_init.sql'`):
 *    `BEGIN` → chạy lần lượt từng câu của `splitStatements(nội dung file)` →
 *    `INSERT INTO schema_migrations (version) VALUES ($1)` → `COMMIT`.
 *    Có lỗi → `ROLLBACK` rồi ném lại lỗi (dừng luôn, không chạy các file sau; file trước đã COMMIT thì giữ).
 * 5. Trả mảng tên các file VỪA áp trong lần gọi này (đã chạy hết rồi → `[]`).
 */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done = new Set<string>();
  const appliedRows = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
  for (const row of appliedRows.rows) done.add(row.version);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await db.query('BEGIN');
    try {
      for (const statement of splitStatements(sql)) {
        await db.query(statement);
      }
      await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
    applied.push(file);
  }
  return applied;
}
