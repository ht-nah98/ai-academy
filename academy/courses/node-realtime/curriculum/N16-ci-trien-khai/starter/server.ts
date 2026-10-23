/**
 * TeamPulse — điểm khởi động server. File này CÓ SẴN: đúng `server.ts` của N14 (N15 thêm HOST), cộng phần vận hành của N16.
 *
 *   prepareDb(db)                      → áp migration (một kết nối, BEGIN/COMMIT) + tạo kênh general nếu chưa có kênh nào
 *   startServer({ db, port, ... })     → listen; trả { server, port, url, close(), wss, beginShutdown() }. port 0 = cổng ngẫu nhiên.
 *   close()                            → cắt mọi kết nối WebSocket và HTTP đang mở, chờ server đóng hẳn. KHÔNG đóng db. (test dùng)
 *
 * N16 thêm vào startServer (chữ ký cũ giữ nguyên, chỉ thêm):
 *   - `GET /health`, `GET /ready` từ `registerHealthRoutes` (health.ts — BẠN viết), gắn TRƯỚC lớp kiểm đăng nhập của
 *     auth.ts nên nền tảng/Docker gọi được mà không cần cookie. `/ready` trả 503 sau khi `beginShutdown()` được gọi.
 *   - `wss`: WebSocketServer của app, để `createShutdown` (shutdown.ts — BẠN viết) đóng mọi WebSocket với mã 1001.
 *
 * npm start (main): loadConfig(process.env) (config.ts — BẠN viết; sai → in lỗi, thoát mã 1) → openDb (N12: DATABASE_URL →
 * Postgres thật, không có → PGlite ./.pgdata) → prepareDb → startServer → SIGTERM/SIGINT gọi createShutdown. Log mỗi dòng một JSON.
 */
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createAuthServer, type LoginLimiter } from './auth.ts';
import { loadConfig, type Config } from './config.ts';
import { acquire, openDb, type Db } from './db.ts';
import { registerHealthRoutes } from './health.ts';
import { migrate } from './migrate.ts';
import { createShutdown } from './shutdown.ts';
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
  /** (N16) Thời gian tối đa `/ready` chờ `SELECT 1` (mặc định của registerHealthRoutes: 1000 ms). */
  readyTimeoutMs?: number;
}

export interface RunningServer {
  server: http.Server;
  port: number;
  url: string;
  close(): Promise<void>;
  /** (N16) WebSocketServer của app — `wss.clients` là mọi kết nối WebSocket đang mở. */
  wss: WebSocketServer;
  /** (N16) Đánh dấu "đang tắt": từ lúc này `/ready` trả 503 shutting_down. */
  beginShutdown(): void;
}

/** Tạo server TeamPulse (createAuthServer) và listen. DB phải đã `prepareDb`. */
export async function startServer({
  db, port = 0, host = '127.0.0.1', allowedOrigins = [], now, limiter, sessionTtlSec, readyTimeoutMs,
}: StartOptions): Promise<RunningServer> {
  let shuttingDown = false;
  const wss = new WebSocketServer({ noServer: true });
  const server = createAuthServer({
    db, allowedOrigins, now, limiter, sessionTtlSec, wss,
    publicRoutes: (app) => registerHealthRoutes(app, { db, isShuttingDown: () => shuttingDown, readyTimeoutMs }),
  });
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
    wss,
    beginShutdown: () => {
      shuttingDown = true;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of upgraded) socket.destroy();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** Log một dòng JSON: máy (Render, Fly, Railway...) đọc và lọc được theo trường. */
function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...fields }));
}

async function main() {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1); // fail fast: sai cấu hình thì không chạy nửa vời
  }
  const allowedOrigins = config.allowedOrigins.length > 0
    ? config.allowedOrigins
    : [`http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`];
  const { db, kind, close: closeDb } = await openDb(); // openDb (N12) đọc cùng DATABASE_URL mà loadConfig vừa kiểm
  const applied = await prepareDb(db);
  const running = await startServer({ db, port: config.port, host: config.host, allowedOrigins });
  log('db sẵn sàng', { db: kind, migrations: applied });
  log(`TeamPulse nghe ở ${running.url}`, { env: config.nodeEnv });

  const shutdown = createShutdown({
    server: running.server,
    wss: running.wss,
    closeDb,
    timeoutMs: config.shutdownTimeoutMs,
    onStart: running.beginShutdown,
    log: (msg) => log(msg),
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      shutdown(signal).then(
        () => {
          log('đã tắt êm', { signal });
          process.exit(0);
        },
        (err: Error) => {
          log('tắt lỗi', { signal, error: err.message });
          process.exit(1);
        },
      );
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
