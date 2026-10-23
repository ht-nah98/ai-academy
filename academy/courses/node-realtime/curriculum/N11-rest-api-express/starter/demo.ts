// npm run demo — mở app ở cổng ngẫu nhiên, gọi lần lượt các route, in status + body. File này có sẵn.
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { createMemoryStore } from './store.ts';

const store = createMemoryStore({ now: () => Date.UTC(2026, 9, 20, 8, 0) });
const server = createApp(store).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function call(method: string, path: string, body?: string): Promise<void> {
  const init: RequestInit = { method };
  if (body !== undefined) init.headers = { 'content-type': 'application/json' };
  if (body !== undefined) init.body = body;
  const res = await fetch(base + path, init);
  let text = await res.text();
  const data: unknown = text === '' ? null : JSON.parse(text);
  if (typeof data === 'object' && data !== null && 'items' in data && Array.isArray(data.items)) {
    // danh sách dài: chỉ in id các tin cho gọn
    const ids = data.items.map((m: { id: number }) => m.id);
    text = `items: id ${JSON.stringify(ids)}, nextBefore: ${'nextBefore' in data ? data.nextBefore : '-'}`;
  }
  const location = res.headers.get('location');
  console.log(`${method.padEnd(6)} ${path.padEnd(38)} → ${res.status}${location ? ` (Location: ${location})` : ''} ${text}`);
}

await call('POST', '/channels', '{"name":"general"}');
await call('POST', '/channels', '{"name":"general"}');
await call('POST', '/channels', '{"name":"Phòng Họp!"}');
for (const text of ['Tin 1', 'Tin 2', 'Tin 3', 'Tin 4', 'Tin 5']) {
  await store.addMessage({ channelId: 1, author: 'An', text });
}
await call('POST', '/channels/1/messages', '{"author":"  Binh ","text":"Tin 6"}');
await call('POST', '/channels/1/messages', '{"author":"","text":42}');
await call('POST', '/channels/1/messages', '{"author":"An",');
await call('GET', '/channels/1/messages?limit=2');
await call('GET', '/channels/1/messages?limit=2&before=5');
await call('GET', '/channels/1/messages?limit=abc');
await call('GET', '/channels/99');
await call('GET', '/channels/abc');
await call('DELETE', '/channels/1');
server.close();
