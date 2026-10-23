/**
 * TeamPulse — chat WebSocket có lưu tin và đồng bộ khi kết nối lại. File này CÓ SẴN (lời giải N13). Không cần sửa.
 * Ở N14, `auth.ts` gán `ws.user` từ phiên đăng nhập trước khi kết nối tới đây, nên `user` trong hello bị bỏ qua.
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
  const userResult = await db.query<{ id: number }>(
    'INSERT INTO users (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [input.author],
  );
  const user = userResult.rows[0];
  if (user === undefined) throw new Error('Không tạo được người dùng');

  const inserted = await db.query<ChatMessageRow>(
    `INSERT INTO messages (channel_id, user_id, client_msg_id, text) VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id, user_id, client_msg_id) DO NOTHING
     RETURNING id, channel_id, $5::text AS author, client_msg_id, text, created_at`,
    [input.channelId, user.id, input.clientMsgId, input.text, input.author],
  );
  const created = inserted.rows[0];
  if (created !== undefined) {
    return { message: rowToChatMessage(created), duplicate: false };
  }

  const existing = await db.query<ChatMessageRow>(
    `SELECT ${CHAT_MESSAGE_COLUMNS}
       FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = $1 AND m.user_id = $2 AND m.client_msg_id = $3`,
    [input.channelId, user.id, input.clientMsgId],
  );
  const old = existing.rows[0];
  if (old === undefined) throw new Error('Tin trùng nhưng không đọc lại được');
  return { message: rowToChatMessage(old), duplicate: true };
}

/**
 * Tin của kênh `channelId` có `id > afterId`, xếp `id` TĂNG dần, tối đa `limit` tin (mặc định 100).
 * Gồm cả tin gửi qua REST (clientMsgId `null`). Dùng để gửi bù tin bị lỡ khi client kết nối lại.
 * (Test nhận ra câu đọc bù nhờ điều kiện dạng `id > $n` trong SQL — viết điều kiện theo dạng đó.)
 */
export async function messagesAfter(db: Db, channelId: number, afterId: number, limit = 100): Promise<ChatMessage[]> {
  const result = await db.query<ChatMessageRow>(
    `SELECT ${CHAT_MESSAGE_COLUMNS}
       FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = $1 AND m.id > $2
      ORDER BY m.id ASC
      LIMIT $3`,
    [channelId, afterId, limit],
  );
  const messages: ChatMessage[] = [];
  for (const row of result.rows) {
    messages.push(rowToChatMessage(row));
  }
  return messages;
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
  const store = createPgStore(db);

  function send(ws: ChatSocket, data: unknown) {
    if (ws.readyState === OPEN) ws.send(JSON.stringify(data));
  }
  function deliver(ws: ChatSocket, message: ChatMessage) {
    if (message.id <= (ws.lastSentId ?? 0)) return; // đã gửi rồi → bỏ, không trùng
    send(ws, { type: 'message', ...message });
    ws.lastSentId = message.id;
  }
  function broadcast(message: ChatMessage) {
    for (const client of wss.clients as Set<ChatSocket>) {
      if (client.channelId !== message.channelId || client.readyState !== OPEN) continue;
      if (client.syncing) client.buffer?.push(message);
      else deliver(client, message);
    }
  }

  async function handleHello(ws: ChatSocket, hello: z.infer<typeof HelloMsg>) {
    const user = ws.user ?? hello.user;
    if (user === undefined) {
      send(ws, { type: 'error', error: 'bad_message' });
      return;
    }
    const channel = await store.getChannel(hello.channelId);
    if (channel === undefined) {
      send(ws, { type: 'error', error: 'channel_not_found' });
      return;
    }
    ws.user = user;
    ws.channelId = channel.id;
    ws.syncing = true;
    const buffer: ChatMessage[] = [];
    ws.buffer = buffer;
    ws.lastSentId = hello.lastSeenId;
    while (true) {
      const page = await messagesAfter(db, channel.id, ws.lastSentId, 100);
      for (const message of page) deliver(ws, message);
      if (page.length < 100) break;
    }
    buffer.sort((a, b) => a.id - b.id);
    for (const message of buffer) deliver(ws, message);
    ws.buffer = [];
    ws.syncing = false;
    send(ws, { type: 'synced', lastId: ws.lastSentId });
  }

  async function handleChat(ws: ChatSocket, chat: z.infer<typeof ChatMsg>) {
    if (ws.channelId === undefined || ws.user === undefined) {
      send(ws, { type: 'error', error: 'hello_first' });
      return;
    }
    const { message, duplicate } = await saveMessage(db, {
      channelId: ws.channelId,
      author: ws.user,
      clientMsgId: chat.clientMsgId,
      text: chat.text,
    });
    send(ws, { type: 'ack', clientMsgId: chat.clientMsgId, id: message.id, duplicate });
    if (!duplicate) broadcast(message);
  }

  wss.on('connection', (ws: ChatSocket) => {
    ws.on('error', () => {});
    ws.on('message', async (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(String(raw));
      } catch {
        send(ws, { type: 'error', error: 'bad_message' });
        return;
      }
      try {
        const hello = HelloMsg.safeParse(data);
        if (hello.success) {
          await handleHello(ws, hello.data);
          return;
        }
        const chat = ChatMsg.safeParse(data);
        if (!chat.success) {
          send(ws, { type: 'error', error: 'bad_message' });
          return;
        }
        await handleChat(ws, chat.data);
      } catch {
        send(ws, { type: 'error', error: 'server_error' });
      }
    });
  });
  return { broadcast };
}

/**
 * Bọc một `ChatStore` (interface của N11): mọi hàm giữ nguyên hành vi và kết quả của `store`, riêng `addMessage`
 * — sau khi `store.addMessage` lưu XONG — phát tin vừa lưu qua `hub.broadcast` (clientMsgId `null`) rồi trả đúng tin đó.
 * Nhờ vậy app REST của N11 không phải sửa mà tin POST qua REST vẫn tới WebSocket ngay. Lưu lỗi → không phát, lỗi ném ra.
 */
export function withBroadcast(store: ChatStore, hub: ChatHub): ChatStore {
  return {
    listChannels: () => store.listChannels(),
    getChannel: (id) => store.getChannel(id),
    createChannel: (name) => store.createChannel(name),
    listMessages: (channelId, opts) => store.listMessages(channelId, opts),
    async addMessage(input) {
      const message = await store.addMessage(input);
      hub.broadcast({ ...message, clientMsgId: null });
      return message;
    },
  };
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
