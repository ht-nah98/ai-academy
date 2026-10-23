/**
 * TeamPulse — Bài N12: chạy migration (các file .sql trong thư mục migrations/, theo thứ tự tên).
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
  // TODO: tạo schema_migrations, đọc version đã chạy, readdir + lọc .sql + sort, mỗi file BEGIN … COMMIT / ROLLBACK
  throw new Error('TODO: viết migrate');
}
