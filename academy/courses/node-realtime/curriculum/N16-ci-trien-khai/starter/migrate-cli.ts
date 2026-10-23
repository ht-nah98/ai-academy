// npm run migrate — áp migration vào .pgdata/ (PGlite) hoặc Postgres thật nếu có DATABASE_URL. File này có sẵn.
import { fileURLToPath } from 'node:url';
import { acquire, openDb } from './db.ts';
import { migrate } from './migrate.ts';

const { db, kind, close } = await openDb();
const { conn, release } = await acquire(db); // migration chạy BEGIN/COMMIT: cần MỘT kết nối
try {
  const applied = await migrate(conn, fileURLToPath(new URL('./migrations', import.meta.url)));
  console.log(`${kind}: ${applied.length === 0 ? 'không có migration mới' : `đã áp ${applied.join(', ')}`}`);
} finally {
  release();
  await close();
}
