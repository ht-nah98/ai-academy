/**
 * Bộ công cụ test tích hợp cho TeamPulse — đúng app bạn đã xây ở N11–N14 (server.ts, auth.ts, chat-store.ts, app.ts...).
 * BẠN viết `resetDb` và `startTestApp`. `waitForMessage`, `api`, `loginAs`, `connectWs` có sẵn (cuối file).
 *
 * Chạy riêng test của hai hàm này:
 *   node --test --test-name-pattern="resetDb" "../../curriculum/N15-test-tich-hop-docker/tests/*.test.js"
 *   node --test --test-name-pattern="startTestApp" "../../curriculum/N15-test-tich-hop-docker/tests/*.test.js"
 */
import type { TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { ChatMessage } from './chat-store.ts';
import type { Db } from './db.ts';

// Đừng sửa dòng dưới: bài chấm đổi app (bản đúng / bản có lỗi) qua biến môi trường TEAMPULSE_APP.
const { startServer }: typeof import('./server.ts') = await import(process.env.TEAMPULSE_APP ?? './server.ts');

export type TeamPulseApp = Awaited<ReturnType<typeof startServer>>;

/** Dữ liệu mẫu (fixture) mỗi test bắt đầu với: đúng hai kênh theo thứ tự này (id 1, id 2), chưa có người dùng, tin hay phiên nào. */
export const FIXTURE_CHANNELS = ['general', 'random'];

/**
 * Đưa DB (đã `prepareDb`: migration 001→004) về trạng thái fixture, để test này không thấy dữ liệu test trước để lại.
 *
 * Yêu cầu (test chấm kiểm tra):
 * - Bảng `messages`, `sessions`, `users`, `channels` trống trơn; rồi `channels` có lại đúng các kênh trong
 *   FIXTURE_CHANNELS, theo đúng thứ tự: `general` có id 1, `random` có id 2.
 * - Mọi bộ đếm id bắt đầu lại từ 1: người dùng đầu tiên tạo sau resetDb có id 1, tin đầu tiên có id 1.
 * - Không đụng bảng `schema_migrations` (không chạy lại migration).
 * - Giá trị đi vào SQL (tên kênh) qua tham số `$1`, không ghép chuỗi (luật N12).
 */
export async function resetDb(db: Db): Promise<void> {
  throw new Error('TODO: resetDb');
}

/**
 * Dựng một TeamPulse thật cho một test: DB sạch, cổng ngẫu nhiên, tự dọn khi test xong.
 *
 * Yêu cầu (test chấm kiểm tra):
 * - Gọi `resetDb(db)` TRƯỚC, rồi `startServer({ db, port: 0, host: '127.0.0.1' })` (startServer lấy từ dòng import
 *   ở đầu file — không import thẳng từ './server.ts'). startServer trả `{ server, port, url, close() }` khi đã nghe xong.
 * - Đăng ký `t.after(...)` gọi `close()` của app — sau đó cổng không còn nhận kết nối, client WS bị cắt.
 * - Trả `{ baseUrl: 'http://127.0.0.1:<cổng>', wsUrl: 'ws://127.0.0.1:<cổng>/ws', app }` (cổng thật, khác 0).
 */
export async function startTestApp(
  t: Pick<TestContext, 'after'>,
  db: Db,
): Promise<{ baseUrl: string; wsUrl: string; app: TeamPulseApp }> {
  throw new Error('TODO: startTestApp');
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
