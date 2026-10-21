/**
 * TeamPulse — server chat dùng cho bài N09 (đã viết sẵn, ĐÚNG). Bạn viết test cho nó trong chat.test.js.
 *
 *   Kết nối:  ws://host/ws?name=An            → server gửi {type:"welcome", id, name}
 *   Client →  {type:"chat", text, sentAt?}     → MỌI client đang mở (kể cả người gửi) nhận
 *                                                {type:"chat", from, text, sentAt}   (sentAt chuyển nguyên nếu là số)
 *   Client →  JSON hỏng / sai dạng             → riêng người gửi nhận {type:"error", error:"bad_json" | "bad_message"},
 *                                                kết nối vẫn mở
 *   Client rời đi                              → người còn lại vẫn nhận tin bình thường
 *
 * Chạy:  npm start   → ws://127.0.0.1:3009/ws, in log vòng đời kết nối (id, mở, đóng, lỗi)
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const OPEN = 1;
const MAX_BUFFERED = 1024 * 1024; // client đọc chậm: quá 1 MB chờ gửi thì bỏ qua tin cho client đó

/**
 * @param {{log?: (line: string) => void}} [options]
 * @returns {http.Server}
 */
export function createChatServer({ log = () => {} } = {}) {
  const server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  let nextId = 1;

  function broadcast(payload) {
    const text = JSON.stringify(payload);
    for (const c of wss.clients) {
      if (c.readyState !== OPEN) continue;
      if (c.bufferedAmount > MAX_BUFFERED) {
        log(`#${c.id} chậm (${c.bufferedAmount} byte chờ gửi) → bỏ qua tin`);
        continue;
      }
      c.send(text);
    }
  }

  wss.on('connection', (ws, req) => {
    ws.id = nextId++;
    ws.name = new URL(req.url, 'http://x').searchParams.get('name') || `khach-${ws.id}`;
    const t0 = Date.now();
    log(`#${ws.id} mở   name=${ws.name} ip=${req.socket.remoteAddress} (${wss.clients.size} đang mở)`);
    ws.send(JSON.stringify({ type: 'welcome', id: ws.id, name: ws.name }));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        log(`#${ws.id} gửi JSON hỏng: ${String(raw).slice(0, 40)}`);
        ws.send(JSON.stringify({ type: 'error', error: 'bad_json' }));
        return;
      }
      if (!msg || msg.type !== 'chat' || typeof msg.text !== 'string') {
        ws.send(JSON.stringify({ type: 'error', error: 'bad_message' }));
        return;
      }
      const out = { type: 'chat', from: ws.name, text: msg.text };
      if (typeof msg.sentAt === 'number') out.sentAt = msg.sentAt;
      broadcast(out);
    });
    ws.on('error', (err) => log(`#${ws.id} lỗi  ${err.message}`));
    ws.on('close', (code) => log(`#${ws.id} đóng code=${code} sau ${Date.now() - t0} ms (${wss.clients.size} đang mở)`));
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3009;
  const server = createChatServer({ log: (line) => console.log(`${new Date().toISOString().slice(11, 23)} ${line}`) });
  server.listen(port, '127.0.0.1', () => console.log(`TeamPulse chat: ws://127.0.0.1:${port}/ws?name=<tên>`));
}
