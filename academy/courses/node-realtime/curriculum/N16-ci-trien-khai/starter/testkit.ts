/**
 * Bộ công cụ test tích hợp cho TeamPulse (N15) — CÓ SẴN ở bài này. CI chạy nó qua `npm run test:mine`.
 * Một cách viết khác của bài N15 (xoá bằng DELETE rồi đặt lại bộ đếm id), cùng hành vi.
 */
import type { TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { ChatMessage } from './chat-store.ts';
import type { Db } from './db.ts';

// Ở N15 bài chấm đổi app qua TEAMPULSE_APP; giữ nguyên để test chạy được với bản app khác khi cần.
const { startServer }: typeof import('./server.ts') = await import(process.env.TEAMPULSE_APP ?? './server.ts');

export type TeamPulseApp = Awaited<ReturnType<typeof startServer>>;

/** Dữ liệu mẫu (fixture) mỗi test bắt đầu với: đúng hai kênh theo thứ tự này (id 1, id 2), chưa có người dùng, tin hay phiên nào. */
export const FIXTURE_CHANNELS = ['general', 'random'];

/** Đưa DB (đã prepareDb) về fixture: bốn bảng dữ liệu trống, id đếm lại từ 1, nạp FIXTURE_CHANNELS. */
export async function resetDb(db: Db): Promise<void> {
  // Xoá theo thứ tự con → cha (khoá ngoại), rồi đặt lại bộ đếm id từng bảng. Tên bảng là hằng trong code (không phải
  // dữ liệu người dùng) nên ghép vào SQL được; giá trị thì vẫn đi qua $1.
  for (const table of ['messages', 'sessions', 'users', 'channels']) {
    await db.query(`DELETE FROM ${table}`);
  }
  for (const table of ['messages', 'users', 'channels']) {
    await db.query(`ALTER TABLE ${table} ALTER COLUMN id RESTART WITH 1`);
  }
  for (const name of FIXTURE_CHANNELS) {
    await db.query('INSERT INTO channels (name) VALUES ($1)', [name]);
  }
}

/** Dựng một TeamPulse thật cho một test (DB sạch, cổng ngẫu nhiên), tự đóng khi test xong. */
export async function startTestApp(
  t: Pick<TestContext, 'after'>,
  db: Db,
): Promise<{ baseUrl: string; wsUrl: string; app: TeamPulseApp }> {
  await resetDb(db);
  const app = await startServer({ db, port: 0, host: '127.0.0.1' });
  t.after(() => app.close());
  return { baseUrl: app.url, wsUrl: `${app.url.replace('http://', 'ws://')}/ws`, app };
}

// ---------------- Có sẵn ----------------

/** Chờ tin JSON đầu tiên thoả predicate (như N09); quá timeoutMs → reject 'timeout', kết nối đóng → reject 'closed'. */
export function waitForMessage<T = any>(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  { timeoutMs = 2000 } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
    };
    const onMessage = (raw: WebSocket.RawData) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (predicate(msg)) {
        cleanup();
        resolve(msg as T);
      }
    };
    const onClose = (code: number) => {
      cleanup();
      reject(new Error(`closed: kết nối đóng (code ${code}) trước khi có tin phù hợp`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout: không có tin phù hợp sau ${timeoutMs} ms`));
    }, timeoutMs);
    ws.on('message', onMessage);
    ws.on('close', onClose);
  });
}

/**
 * fetch JSON gọn: `api(baseUrl, '/channels/1/messages', { method: 'POST', body: {...}, cookie })` → `{ status, body, headers }`.
 * `cookie` là chuỗi `tp_session=...` lấy từ `loginAs`. Không gửi header Origin (giống curl) nên lớp chống CSRF của N14 cho qua.
 */
export async function api(
  baseUrl: string,
  path: string,
  { method = 'GET', body, cookie }: { method?: string; body?: unknown; cookie?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie !== undefined) headers.cookie = cookie;
  const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text === '' ? null : JSON.parse(text)) as any, headers: res.headers };
}

/**
 * Đăng ký rồi đăng nhập `username` qua chính route của N14 (`POST /api/register`, `POST /api/login`).
 * Trả cookie phiên dạng `'tp_session=<id>'` để gửi kèm `api(..., { cookie })` và `connectWs(..., { cookie })`.
 * (Mỗi lần ~0,1 giây vì scrypt chạy hai lần — đăng ký và đăng nhập.)
 */
export async function loginAs(baseUrl: string, username: string, password = 'mat-khau-test-123'): Promise<string> {
  const reg = await api(baseUrl, '/api/register', { method: 'POST', body: { username, password } });
  if (reg.status !== 201) throw new Error(`loginAs: đăng ký ${username} trả ${reg.status} ${JSON.stringify(reg.body)}`);
  const res = await api(baseUrl, '/api/login', { method: 'POST', body: { username, password } });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  if (res.status !== 200 || !cookie.startsWith('tp_session=')) {
    throw new Error(`loginAs: đăng nhập ${username} trả ${res.status} ${JSON.stringify(res.body)}`);
  }
  return cookie;
}

/**
 * Mở WebSocket tới `wsUrl` bằng cookie phiên, gửi `hello` của N13 rồi chờ tới `synced`. Tự terminate khi test xong.
 * Trả `{ ws, missed, synced }`: `missed` = các tin `{type:'message', ...}` server gửi bù trước `synced` (id > lastSeenId,
 * id tăng dần); `synced` = `{type:'synced', lastId}`. Sau khi hàm trả về, mọi tin mới đọc bằng `waitForMessage`.
 */
export async function connectWs(
  t: Pick<TestContext, 'after'>,
  wsUrl: string,
  { cookie, channelId = 1, lastSeenId = 0 }: { cookie: string; channelId?: number; lastSeenId?: number },
) {
  const ws = new WebSocket(wsUrl, { headers: { cookie } });
  t.after(() => ws.terminate());
  ws.on('error', () => {});
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('unexpected-response', (_req, res) => reject(new Error(`connectWs: handshake bị từ chối HTTP ${res.statusCode}`)));
  });
  const missed: (ChatMessage & { type: 'message' })[] = [];
  const collect = (raw: WebSocket.RawData) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === 'message') missed.push(msg);
  };
  ws.on('message', collect);
  const synced = waitForMessage<{ type: 'synced'; lastId: number }>(ws, (m) => m.type === 'synced' || m.type === 'error');
  ws.send(JSON.stringify({ type: 'hello', channelId, lastSeenId }));
  const reply = await synced;
  ws.off('message', collect);
  if (reply.type !== 'synced') throw new Error(`connectWs: server trả ${JSON.stringify(reply)} thay vì synced`);
  return { ws, missed, synced: reply };
}
