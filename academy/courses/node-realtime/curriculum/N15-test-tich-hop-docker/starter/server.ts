/**
 * TeamPulse — điểm khởi động server. File này CÓ SẴN.
 *
 *   prepareDb(db)                      → áp migration (một kết nối, BEGIN/COMMIT) + tạo kênh general nếu chưa có kênh nào
 *   startServer({ db, port, ... })     → listen; trả { server, port, url, close() }. port 0 = cổng ngẫu nhiên (dùng trong test).
 *   close()                            → cắt mọi kết nối WebSocket và HTTP đang mở, chờ server đóng hẳn. KHÔNG đóng db.
 *
 * npm start (chạy file này trực tiếp): DATABASE_URL → Postgres thật, không có → PGlite ./.pgdata; cổng PORT hoặc 3114.
 * HOST (mặc định 127.0.0.1) — N15 thêm biến này: trong container phải nghe 0.0.0.0 (Dockerfile đặt sẵn).
 * ALLOWED_ORIGINS (vd. "https://teampulse.cty.vn,http://localhost:3114") — mặc định http://127.0.0.1:<port>, http://localhost:<port>.
 */
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAuthServer, type LoginLimiter } from './auth.ts';
import { acquire, openDb, type Db } from './db.ts';
import { migrate } from './migrate.ts';
import { createPgStore } from './store.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

/** Áp migration còn thiếu và bảo đảm có ít nhất một kênh (`general`). Trả tên các file vừa áp. */
export async function prepareDb(db: Db): Promise<string[]> {
  const { conn, release } = await acquire(db); // migration chạy BEGIN/COMMIT: cần MỘT kết nối
  let applied: string[];
  try {
    applied = await migrate(conn, MIGRATIONS_DIR);
  } finally {
    release();
  }
  const store = createPgStore(db);
  if ((await store.listChannels()).length === 0) await store.createChannel('general');
  return applied;
}

export interface StartOptions {
  db: Db;
  port?: number;
  host?: string;
  /** Origin được phép gửi request ghi / mở WebSocket. Mặc định [] — chỉ client không gửi Origin (curl, Node, test). */
  allowedOrigins?: string[];
  now?: () => number;
  limiter?: LoginLimiter;
  sessionTtlSec?: number;
}

export interface RunningServer {
  server: http.Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

/** Tạo server TeamPulse (createAuthServer) và listen. DB phải đã `prepareDb`. */
export async function startServer({ db, port = 0, host = '127.0.0.1', allowedOrigins = [], now, limiter, sessionTtlSec }: StartOptions): Promise<RunningServer> {
  const server = createAuthServer({ db, allowedOrigins, now, limiter, sessionTtlSec });
  const upgraded = new Set<Duplex>(); // socket đã nâng cấp WebSocket: server.close() không tự đóng chúng
  server.on('upgrade', (req, socket) => {
    upgraded.add(socket);
    socket.on('close', () => upgraded.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  return {
    server,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of upgraded) socket.destroy();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

async function main() {
  const port = Number(process.env.PORT) || 3114;
  const host = process.env.HOST || '127.0.0.1';
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
    ?? [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const { db, kind, close: closeDb } = await openDb();
  const applied = await prepareDb(db);
  const running = await startServer({ db, port, host, allowedOrigins });
  console.log(`DB: ${kind}; migration vừa áp: ${applied.length === 0 ? '(không có — DB đã đủ)' : applied.join(', ')}`);
  console.log(`TeamPulse: ${running.url} — POST /api/register, /api/login, /api/logout · GET /api/me · /channels · WebSocket /ws`);
  const stop = () => { void running.close().then(closeDb).then(() => process.exit(0)); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
