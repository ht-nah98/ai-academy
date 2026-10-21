/**
 * Server xem trước (ĐÃ VIẾT SẴN) — để thấy WebSocket chạy trước khi tự viết.
 *
 * Chạy:  npm run preview   → mở http://127.0.0.1:3003 , gõ vài chữ, bấm "Gửi binary"
 *
 * "Loa phóng thanh": vừa kết nối thì chào; nhận TEXT → gửi lại CHỮ HOA kèm "!";
 * nhận BINARY → báo đã nhận bao nhiêu byte. Cùng khuôn với createEchoServer (Bước 6),
 * nhưng làm việc khác — đọc nó như ví dụ mẫu.
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { WebSocketServer } from 'ws';

// (1) HTTP server thường (như N02): mọi GET đều trả trang public/index.html
const server = http.createServer(async (req, res) => {
  const html = await readFile(new URL('./public/index.html', import.meta.url));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

// (2) Gắn WebSocket vào CÙNG server đó, chỉ nhận ở đường dẫn /ws
const wss = new WebSocketServer({ server, path: '/ws' });

// (3) Mỗi client kết nối thành công → một lần 'connection', `ws` là kênh riêng tới client đó
wss.on('connection', (ws) => {
  ws.on('error', (err) => console.error('[preview] lỗi kết nối:', err.message));
  console.log('[preview] có kết nối mới, đang mở:', wss.clients.size);
  ws.send('Loa đã bật — gõ gì tôi nói to lên');

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      ws.send(`nhận ${data.length} byte`);                 // data là Buffer
    } else {
      ws.send(data.toString().toUpperCase() + '!');         // tin text cũng đến dạng Buffer
    }
  });
  ws.on('close', (code) => console.log('[preview] một kết nối đóng, code', code));
});

const port = Number(process.env.PORT) || 3003;
server.listen(port, '127.0.0.1', () => {
  console.log(`Preview: http://127.0.0.1:${port}  (WebSocket ở ws://127.0.0.1:${port}/ws, Ctrl+C để dừng)`);
});
