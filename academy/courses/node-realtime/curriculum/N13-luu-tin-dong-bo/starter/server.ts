// npm start — TeamPulse N13: REST của N11 + WebSocket đồng bộ, cổng 3113. File này có sẵn.
// DB: Postgres thật nếu có DATABASE_URL (cùng DB với N12 → migrate chỉ áp thêm 003), không thì PGlite ./.pgdata.
import { fileURLToPath } from 'node:url';
import { createChatServer } from './chat-store.ts';
import { acquire, openDb } from './db.ts';
import { migrate } from './migrate.ts';
import { createPgStore } from './store.ts';

const { db, kind, close } = await openDb();
const { conn, release } = await acquire(db); // migration chạy BEGIN/COMMIT: cần MỘT kết nối
let applied: string[];
try {
  applied = await migrate(conn, fileURLToPath(new URL('./migrations', import.meta.url)));
} finally {
  release();
}
const store = createPgStore(db);
if ((await store.listChannels()).length === 0) await store.createChannel('general');

const port = Number(process.env.PORT) || 3113;
const server = createChatServer({ db });
server.listen(port, '127.0.0.1', () => {
  console.log(`DB: ${kind}; migration vừa áp: ${applied.length === 0 ? '(không có — DB đã đủ)' : applied.join(', ')}`);
  console.log(`REST: http://127.0.0.1:${port}/channels/1/messages?limit=20`);
  console.log(`WS:   ws://127.0.0.1:${port}/ws — thử: npm run client -- an 1 0`);
});
process.on('SIGINT', () => {
  server.closeAllConnections();
  server.close();
  void close().then(() => process.exit(0));
});
