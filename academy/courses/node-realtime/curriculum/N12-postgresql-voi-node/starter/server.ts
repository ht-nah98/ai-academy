// npm start — app Express BẠN viết ở N11 + store PostgreSQL của bài này, cổng 3112. File này có sẵn.
// createApp chỉ biết interface ChatStore, nên đổi store bộ nhớ → PostgreSQL không phải sửa app.ts.
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { acquire, openDb } from './db.ts';
import { migrate } from './migrate.ts';
import { createPgStore } from './store.ts';
import type { ChatStore } from './types.ts';

const appFile = new URL('../N11-rest-api-express/app.ts', import.meta.url);
if (!existsSync(appFile)) {
  console.log('Chưa có workspace N11-rest-api-express (app.ts). Làm N11 trước, hoặc chỉ dùng npm run demo.');
  process.exit(1);
}
const { createApp } = (await import(appFile.href)) as {
  createApp: (store: ChatStore) => { listen: (port: number, host: string, cb: () => void) => unknown };
};

const { db, kind, close } = await openDb();
const { conn, release } = await acquire(db);
await migrate(conn, fileURLToPath(new URL('./migrations', import.meta.url)));
release();

const port = Number(process.env.PORT) || 3112;
createApp(createPgStore(db)).listen(port, '127.0.0.1', () => {
  console.log(`TeamPulse API (${kind}): http://127.0.0.1:${port}/channels`);
});
process.on('SIGINT', () => { void close().then(() => process.exit(0)); });
