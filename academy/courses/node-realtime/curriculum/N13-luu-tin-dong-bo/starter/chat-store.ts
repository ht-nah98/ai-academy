/**
 * TeamPulse — Bài N13: lưu tin từ WebSocket vào bảng `messages` của N12 và đồng bộ khi kết nối lại.
 *
 *   Client → server                                   Server → client
 *   {type:"hello", channelId, user, lastSeenId}      {type:"message", ...ChatMessage}   các tin bị lỡ, id tăng dần
 *                                                     {type:"synced", lastId}
 *   {type:"chat", clientMsgId, text}                  {type:"ack", clientMsgId, id, duplicate}   (chỉ người gửi)
 *                                                     {type:"message", ...ChatMessage}   (mọi kết nối trong kênh)
 *   Lỗi: {type:"error", error: "bad_message" | "hello_first" | "channel_not_found" | "server_error"}
 *
 *   ChatMessage = {id, channelId, author, clientMsgId, text, createdAt} — Message của N11 + clientMsgId.
 *   REST: app.ts của N11 giữ nguyên (GET/POST /channels/:id/messages ...). Tin POST qua REST cũng tới
 *   WebSocket ngay nhờ `withBroadcast`.
 *
 * Chạy thử:   npm start      → http://127.0.0.1:3113/channels, ws://127.0.0.1:3113/ws
 *             npm run client → client WebSocket gõ tay (npm run client -- binh 1 0)
 *             npm run demo   → kịch bản: gửi, gửi lại (trùng), offline rồi kết nối lại, REST → WebSocket
 * Kiểm kiểu:  npm run typecheck
 * Chạy test:  npm test
 * Chạy riêng một nhóm test (vd. tên chứa "saveMessage"):
 *   node --test --test-name-pattern="saveMessage" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
 *
 * Luật SQL như N12: giá trị từ bên ngoài đi qua `$1, $2...`, không ghép vào chuỗi SQL.
 */
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { createApp } from './app.ts';
import type { Db } from './db.ts';
import { createPgStore } from './store.ts';
import type { ChatStore, Message } from './types.ts';

export const OPEN = 1;

/** Tin gửi qua WebSocket: Message của N11 + khóa chống trùng do client tạo (tin gửi qua REST: `null`). */
export interface ChatMessage extends Message {
  clientMsgId: string | null;
}

/** (Đã viết sẵn) Một dòng tin đã JOIN `users` để có tên người gửi. */
export interface ChatMessageRow {
  id: number;
  channel_id: number;
  author: string;
  client_msg_id: string | null;
  text: string;
  created_at: Date;
}

/**
 * (Đã viết sẵn) Danh sách cột để SELECT ra một `ChatMessageRow`. Dùng kèm
 * `FROM messages m JOIN users u ON u.id = m.user_id`.
 */
export const CHAT_MESSAGE_COLUMNS = 'm.id, m.channel_id, u.name AS author, m.client_msg_id, m.text, m.created_at';

/** (Đã viết sẵn) Dòng → object gửi cho client. `Number(...)`: `pg` trả kiểu bigint là chuỗi, PGlite trả number. */
export function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: Number(row.id),
    channelId: Number(row.channel_id),
    author: row.author,
    clientMsgId: row.client_msg_id,
    text: row.text,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ---------- (Đã viết sẵn) Kiểm tra tin client bằng zod — như N11 ----------
export const HelloMsg = z.object({
  type: z.literal('hello'),
  channelId: z.number().int().positive(),
  user: z.string().trim().min(1).max(32).optional(),
  lastSeenId: z.number().int().min(0).default(0),
});
export const ChatMsg = z.object({
  type: z.literal('chat'),
  clientMsgId: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(2000),
});

export interface NewChatMessage {
  channelId: number;
  author: string;
  clientMsgId: string;
  text: string;
}

/**
 * Lưu một tin gửi qua WebSocket, CHỐNG TRÙNG theo (kênh, người gửi, `clientMsgId`).
 *
 * - Người gửi `author` chưa có trong `users` thì tạo (theo `name`), có rồi thì dùng lại — như `addMessage` của N12.
 * - Ghi tin bằng MỘT câu INSERT có `ON CONFLICT ... DO NOTHING` và `RETURNING` (chỉ mục duy nhất ở
 *   `migrations/003_message_sync.sql`). Không kiểm "đã có chưa" bằng một câu SELECT riêng TRƯỚC khi ghi.
 * - Ghi được → `{ message, duplicate: false }`.
 * - Không ghi (đã có tin cùng kênh, cùng người gửi, cùng clientMsgId) → đọc tin cũ đó:
 *   `{ message: <tin cũ, nội dung CŨ>, duplicate: true }`. Không thêm dòng mới.
 *   Cùng `clientMsgId` nhưng khác người gửi hoặc khác kênh là tin KHÁC → lưu bình thường.
 * - Kênh không tồn tại → để lỗi khóa ngoại của Postgres (code '23503') ném ra, không tự bắt.
 * - `message` đổi qua `rowToChatMessage` (id là number, createdAt là chuỗi ISO, author là tên).
 */
export async function saveMessage(db: Db, input: NewChatMessage): Promise<{ message: ChatMessage; duplicate: boolean }> {
  // TODO: tạo/dùng lại người gửi; một câu INSERT chống trùng có RETURNING; không ghi được → đọc lại tin cũ
  throw new Error('TODO: viết saveMessage');
}

/**
 * Tin của kênh `channelId` có `id > afterId`, xếp `id` TĂNG dần, tối đa `limit` tin (mặc định 100).
 * Gồm cả tin gửi qua REST (clientMsgId `null`). Dùng để gửi bù tin bị lỡ khi client kết nối lại.
 * (Test nhận ra câu đọc bù nhờ điều kiện dạng `id > $n` trong SQL — viết điều kiện theo dạng đó.)
 */
export async function messagesAfter(db: Db, channelId: number, afterId: number, limit = 100): Promise<ChatMessage[]> {
  // TODO: tin của kênh sau afterId, id tăng dần, tối đa limit; đổi từng dòng bằng rowToChatMessage
  throw new Error('TODO: viết messagesAfter');
}

/** Thứ `attachChat` trả về: phát một tin đã lưu cho mọi kết nối đang ở kênh của tin đó. */
export interface ChatHub {
  broadcast(message: ChatMessage): void;
}

/** Trạng thái gắn trên mỗi kết nối. `user` có thể được gán SẴN trước khi kết nối tới đây (N14: từ phiên đăng nhập). */
export interface ChatSocket extends WebSocket {
  user?: string;
  channelId?: number;
  syncing?: boolean;
  buffer?: ChatMessage[];
  lastSentId?: number;
}

/**
 * Gắn giao thức chat vào `wss` (mọi kết nối của nó): lưu tin, ack, phát, và đồng bộ khi kết nối lại.
 *
 * Mỗi kết nối gửi `hello` trước (kiểm bằng `HelloMsg`), rồi mới được `chat` (kiểm bằng `ChatMsg`):
 * - JSON hỏng hoặc sai dạng → `{type:'error', error:'bad_message'}`; `chat` trước `hello` → `{type:'error', error:'hello_first'}`.
 * - Tên người gửi: `ws.user` nếu kết nối đã có sẵn (N14 gán từ phiên đăng nhập, hoặc từ hello trước), không thì
 *   `hello.user`. Không có cả hai → `bad_message`.
 * - `hello` với kênh không tồn tại → `{type:'error', error:'channel_not_found'}`, kết nối không vào kênh nào.
 * - `hello` hợp lệ → gửi bù MỌI tin của kênh có id > lastSeenId, id tăng dần, mỗi tin `{type:'message', ...ChatMessage}`
 *   (đọc theo trang bằng `messagesAfter` cho tới khi hết), rồi `{type:'synced', lastId}` (lastId = id tin cuối đã
 *   gửi, hoặc lastSeenId nếu không có tin nào). Sau đó nhận tin trực tiếp.
 * - KHÔNG hở, KHÔNG trùng trong lúc gửi bù: tin mới được lưu trong lúc đang đọc bù vẫn phải tới client đúng một
 *   lần, đúng thứ tự id, trước `synced`. Vì vậy kết nối phải vào kênh (ở trạng thái "đang đồng bộ") TRƯỚC khi đọc bù.
 * - `chat` → `saveMessage` (kênh và người gửi lấy từ kết nối, KHÔNG từ tin client). Lưu XONG mới gửi:
 *   `{type:'ack', clientMsgId, id, duplicate}` cho người gửi, và nếu KHÔNG trùng thì phát `{type:'message', ...ChatMessage}`
 *   cho mọi kết nối OPEN trong cùng kênh (gồm người gửi). Trùng → chỉ ack.
 * - Lỗi DB khi xử lý một tin → `{type:'error', error:'server_error'}`; tiến trình không sập.
 * Trả `ChatHub`: `broadcast(message)` phát theo đúng luật trên (dùng cho cả tin đến từ REST).
 */
export function attachChat(wss: WebSocketServer, db: Db): ChatHub {
  // Khung gợi ý — làm lần lượt Bước 5a → 5d trong bài (xoá dòng throw khi bắt đầu viết):
  //
  // - Vài hàm nhỏ dùng chung: gửi JSON khi kết nối còn OPEN; "giao" một tin cho một kết nối (Bước 5d: bỏ tin
  //   có id ≤ id đã gửi); phát một tin cho mọi kết nối cùng kênh (Bước 5d: kết nối đang đồng bộ → vào hàng đợi).
  // - Bước 5a: mỗi kết nối mới — đọc tin client (JSON hỏng / sai dạng / chat trước hello).
  // - Bước 5b: chat → lưu → ack cho người gửi → phát nếu không trùng.
  // - Bước 5c: hello → kiểm kênh → gửi bù theo trang tới hết → synced.
  // - Bước 5d: không hở, không trùng khi có tin mới trong lúc đang gửi bù.
  // - Trả object có hàm broadcast.
  throw new Error('TODO: viết attachChat');
}

/**
 * Bọc một `ChatStore` (interface của N11): mọi hàm giữ nguyên hành vi và kết quả của `store`, riêng `addMessage`
 * — sau khi `store.addMessage` lưu XONG — phát tin vừa lưu qua `hub.broadcast` (clientMsgId `null`) rồi trả đúng tin đó.
 * Nhờ vậy app REST của N11 không phải sửa mà tin POST qua REST vẫn tới WebSocket ngay. Lưu lỗi → không phát, lỗi ném ra.
 */
export function withBroadcast(store: ChatStore, hub: ChatHub): ChatStore {
  // TODO: trả một ChatStore mới: bốn hàm đọc chuyển thẳng cho store; addMessage lưu xong rồi phát qua hub
  throw new Error('TODO: viết withBroadcast');
}

/**
 * (Đã viết sẵn) HTTP server (CHƯA listen) = REST của N11 + WebSocket ở `/ws`, chung một cổng và một `db`.
 * Tin đi vào bằng đường nào (REST hay WebSocket) cũng được lưu một chỗ và phát cho WebSocket.
 */
export function createChatServer({ db }: { db: Db }): http.Server {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  const hub = attachChat(wss, db);
  server.on('request', createApp(withBroadcast(createPgStore(db), hub)));
  server.on('close', () => wss.close());
  return server;
}
