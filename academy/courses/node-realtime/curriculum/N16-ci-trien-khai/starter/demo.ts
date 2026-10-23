/**
 * Kịch bản thử đăng nhập (đã viết sẵn). Chạy: npm run demo
 * Dựng TeamPulse (createAuthServer CỦA BẠN qua startServer) trên PGlite trong bộ nhớ, cổng ngẫu nhiên, đồng hồ giả.
 */
import { PGlite } from '@electric-sql/pglite';
import { WebSocket } from 'ws';
import { prepareDb, startServer } from './server.ts';

const db = new PGlite();
await prepareDb(db); // migration 001→004 + kênh general (id 1)
let clock = Date.now();
const origin = 'http://127.0.0.1:3114';
const app = await startServer({ db, allowedOrigins: [origin], now: () => clock });

type Reply = { status: number; text: string; cookie: string | null; retry: string | null };
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const res = await fetch(app.url + path, {
    method,
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text(), cookie: res.headers.get('set-cookie'), retry: res.headers.get('retry-after') };
}
const line = (label: string, r: { status: number; text: string }) => console.log(`${label.padEnd(34)} → ${r.status} ${r.text}`);
const login = (username: string, password: string) => call('POST', '/api/login', { username, password });

line('Đăng ký An_Le / mat-khau-dai-123', await call('POST', '/api/register', { username: 'An_Le', password: 'mat-khau-dai-123' }));
line('Đăng ký lại "an_le"', await call('POST', '/api/register', { username: 'an_le', password: 'khac-hoan-toan' }));
const row = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE name = $1', ['an_le']);
console.log(`${'Cột password_hash trong DB'.padEnd(34)} → ${row.rows[0]?.password_hash.slice(0, 48)}...`);
line('Đăng nhập sai mật khẩu', await login('an_le', 'sai-mat-khau'));
line('Đăng nhập user không tồn tại', await login('khong_co', 'sai-mat-khau'));
for (let i = 2; i <= 5; i++) await login('an_le', `doan-lan-${i}`);
const blocked = await login('an_le', 'mat-khau-dai-123');
line('Lần thứ 6 (đúng mật khẩu)', blocked);
console.log(`${''.padEnd(34)}   Retry-After: ${blocked.retry}`);

await call('POST', '/api/register', { username: 'binh_tran', password: 'mat-khau-cua-binh' });
const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => login('binh_tran', `doan-song-song-${i}`)));
const tally: Record<number, number> = {};
for (const r of burst) tally[r.status] = (tally[r.status] ?? 0) + 1;
console.log(`${'10 lần đoán binh_tran CÙNG LÚC'.padEnd(34)} → ${JSON.stringify(tally)}`);

clock += 15 * 60_000;
const ok = await login('an_le', 'mat-khau-dai-123');
line('15 phút sau, đúng mật khẩu', ok);
console.log(`${''.padEnd(34)}   Set-Cookie: ${(ok.cookie ?? '').replace(/tp_session=[^;]+/, 'tp_session=<43 ký tự>').replace(/; Expires=[^;]+/, '')}`);
const cookie = (ok.cookie ?? '').split(';')[0] ?? '';
line('Trang lạ POST /api/logout', await call('POST', '/api/logout', {}, { cookie, origin: 'https://evil.example' }));
line('GET /channels không cookie', await call('GET', '/channels'));
line('POST tin, author tự khai giam_doc', await call('POST', '/channels/1/messages', { author: 'giam_doc', text: 'Tăng lương!' }, { cookie }));

function open(label: string, headers: Record<string, string>) {
  return new Promise<WebSocket | null>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { headers });
    ws.on('unexpected-response', (req, res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => { console.log(`${label.padEnd(34)} → HTTP ${res.statusCode} ${body}`); resolve(null); });
    });
    ws.on('error', () => {});
    ws.on('open', () => resolve(ws));
  });
}
await open('WebSocket không cookie', { origin });
await open('WebSocket cookie đúng, Origin lạ', { cookie, origin: 'https://evil.example' });
const ws = (await open('WebSocket cookie đúng', { cookie, origin }))!;
const replies: string[] = [];
await new Promise<void>((done) => {
  ws.on('message', (d) => {
    replies.push(String(d).slice(0, 60));
    if (String(d).includes('"synced"')) done();
  });
  ws.send(JSON.stringify({ type: 'hello', channelId: 1, user: 'giam_doc', lastSeenId: 0 }));
});
console.log(`${'hello tự khai user=giam_doc'.padEnd(34)} ← ${replies.join(' | ')}`);
const closed = new Promise<string>((r) => ws.once('close', (code, reason) => r(`${code} ${reason}`)));
line('POST /api/logout', await call('POST', '/api/logout', {}, { cookie }));
console.log(`${'WebSocket đang mở'.padEnd(34)} → đóng ${await closed}`);
line('GET /api/me bằng cookie cũ', await call('GET', '/api/me', undefined, { cookie }));

await app.close();
await db.close();
