// npm run demo — migration, SQL injection, transaction trên PGlite trong bộ nhớ. File này có sẵn.
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from './db.ts';
import { migrate } from './migrate.ts';
import { createChannelWithWelcome, createPgStore, searchMessages } from './store.ts';

const db = new PGlite();
const dir = fileURLToPath(new URL('./migrations', import.meta.url));
console.log('migrate lần 1:', await migrate(db, dir));
console.log('migrate lần 2:', await migrate(db, dir));

const store = createPgStore(db);
const general = (await store.createChannel('general'))!;
const hr = (await store.createChannel('hr'))!;
await store.addMessage({ channelId: general.id, author: 'An', text: 'Deploy lúc 10h' });
await store.addMessage({ channelId: general.id, author: 'Binh', text: 'Ok, deploy xong báo nhé' });
await store.addMessage({ channelId: hr.id, author: 'Chi', text: 'Bảng lương tháng 10 (mật)' });
console.log('trùng tên kênh:', await store.createChannel('general'));
const page = await store.listMessages(general.id, { limit: 1 });
console.log('trang 1 general:', page.map((m) => `${m.id} ${m.author}: ${m.text}`));

// Cách SAI để so sánh: ghép chữ người dùng gõ vào SQL
async function unsafeSearch(channelId: number, q: string) {
  const sql = `SELECT m.text FROM messages m WHERE m.channel_id = ${channelId} AND m.text ILIKE '%${q}%'`;
  return (await db.query<{ text: string }>(sql)).rows.map((r) => r.text);
}
const attack = "%' OR 1=1 --";
console.log('\ntìm "deploy"  ghép chuỗi:', await unsafeSearch(general.id, 'deploy'));
console.log(`tìm "${attack}" ghép chuỗi:`, await unsafeSearch(general.id, attack));
console.log(`tìm "${attack}" tham số $2:`, (await searchMessages(db, general.id, attack)).map((m) => m.text));

// Transaction: tạo kênh + tin chào. db "chập chờn" mất kết nối đúng lúc INSERT tin.
const flaky: Db = {
  query(sql, params) {
    if (/insert\s+into\s+messages/i.test(sql)) return Promise.reject(new Error('mất kết nối tới DB'));
    return db.query(sql, params);
  },
};
console.log('\ntạo #ops:', await createChannelWithWelcome(db, { name: 'ops', owner: 'An' }).then((r) => r?.message.text));
try {
  await createChannelWithWelcome(flaky, { name: 'qa', owner: 'An' });
} catch (err) {
  console.log('tạo #qa :', (err as Error).message);
}
console.log('kênh hiện có:', (await store.listChannels()).map((c) => c.name));
await db.close();
