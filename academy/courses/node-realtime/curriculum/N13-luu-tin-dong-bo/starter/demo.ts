/**
 * Kịch bản thử (đã viết sẵn). Chạy: npm run demo
 * Dựng createChatServer() trên PGlite trong bộ nhớ (database mới mỗi lần chạy), cổng ngẫu nhiên.
 */
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { WebSocket } from 'ws';
import { createChatServer } from './chat-store.ts';
import { migrate } from './migrate.ts';
import { createPgStore } from './store.ts';

const db = new PGlite();
const dir = fileURLToPath(new URL('./migrations', import.meta.url));
console.log('migrate         →', (await migrate(db, dir)).join(', '));
console.log('migrate lần 2   →', (await migrate(db, dir)).join(', ') || '(không có gì mới)');
const general = (await createPgStore(db).createChannel('general'))!;
const server = createChatServer({ db });
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address() as AddressInfo;

type Msg = Record<string, unknown>;
function client(name: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox: Msg[] = [];
  const waiters: ((m: Msg) => void)[] = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d)) as Msg;
    const w = waiters.shift();
    if (w) w(m);
    else inbox.push(m);
  });
  const next = () => {
    const queued = inbox.shift();
    return queued ? Promise.resolve(queued) : new Promise<Msg>((r) => waiters.push(r));
  };
  return {
    ws,
    next,
    async hello(lastSeenId: number) {
      await new Promise((r) => ws.once('open', r));
      ws.send(JSON.stringify({ type: 'hello', channelId: general.id, user: name, lastSeenId }));
      const got: string[] = [];
      for (let m = await next(); m.type !== 'synced'; m = await next()) got.push(`#${m.id} ${m.text}`);
      return got;
    },
  };
}
const short = (m: Msg) =>
  m.type === 'ack' ? `ack id=${m.id} duplicate=${m.duplicate}` : `message #${m.id} ${m.author}: ${m.text} (clientMsgId ${m.clientMsgId})`;

const an = client('An');
console.log('An hello(0)     → bù:', await an.hello(0));
for (const [cid, text] of [['an-1', 'Chào cả nhóm'], ['an-2', 'Build #41 xanh'], ['an-2', 'Build #41 xanh']]) {
  an.ws.send(JSON.stringify({ type: 'chat', clientMsgId: cid, text }));
  const first = await an.next();
  console.log(`An gửi ${cid}     →`, short(first) + (first.duplicate ? ' (gửi lại, không lưu thêm)' : ''));
  if (!first.duplicate) await an.next(); // bản phát cho chính mình
}
const binh = client('Binh');
console.log('Binh hello(1)   → bù:', await binh.hello(1), '(lỡ khi offline)');
an.ws.send(JSON.stringify({ type: 'chat', clientMsgId: 'an-3', text: 'Ai review PR 7?' }));
await an.next();
console.log('Binh trực tiếp  ←', short(await binh.next()));

const base = `http://127.0.0.1:${port}`;
const posted = await fetch(`${base}/channels/${general.id}/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ author: 'Chi', text: 'Mình review' }),
});
console.log('REST POST       →', posted.status, '| Binh ←', short(await binh.next()));
const page = (await (await fetch(`${base}/channels/${general.id}/messages?limit=2`)).json()) as { items: Msg[]; nextBefore: number | null };
console.log('REST GET ?limit=2 →', page.items.map((m) => m.id), 'nextBefore =', page.nextBefore, '(mới → cũ, như N11)');
const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM messages');
console.log('Bảng messages   →', count.rows[0]?.n, 'dòng (5 lần gửi, 1 lần trùng)');

an.ws.close();
binh.ws.close();
server.close();
await db.close();
