/**
 * Demo polling vs WebSocket (ĐÃ VIẾT SẴN — bạn chỉ chạy và quan sát, không cần sửa).
 *
 * Chạy:  npm run demo   → mở http://127.0.0.1:3004
 *        (cổng bận thì: PORT=3014 npm run demo — PowerShell: $env:PORT=3014; npm run demo)
 *
 * Server này có hai "cửa" cho cùng một nguồn tin:
 *   - GET /poll?since=<id>  → kiểu HTTP hỏi–đáp: trả các tin có id lớn hơn <id> (thường là [] rỗng)
 *   - WebSocket /ws         → kiểu giữ máy: có tin là server gửi ngay, không ai phải hỏi
 * Bấm "Server gửi tin" trên trang (gọi POST /send) để server có một tin mới.
 * Trang web hiển thị hai cột nhận CÙNG tin đó và đếm: bao nhiêu request, bao nhiêu lần rỗng, trễ bao lâu.
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const SAMPLES = [
  'Đơn hàng mới #1024 — 2 ly trà sữa',
  'Build #128 xong, mọi test đều qua',
  'An: 3 giờ họp phòng lớn nhé',
  'Tài xế còn cách bạn 300 m',
  'Giá BTC vừa tăng 1,2%',
  'Binh vừa vào phòng chat',
];

const events = [];            // các tin server đã có: {type, id, text, at}
let lastId = 0;
const stats = { polls: 0, emptyPolls: 0 };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Server có tin mới: lưu lại (cho người polling hỏi sau) và đẩy ngay qua mọi kết nối WebSocket. */
function publish() {
  lastId += 1;
  const event = { type: 'news', id: lastId, text: SAMPLES[(lastId - 1) % SAMPLES.length], at: Date.now() };
  events.push(event);
  if (events.length > 100) events.shift();
  const frame = JSON.stringify(event);
  let pushed = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(frame);
      pushed += 1;
    }
  }
  console.log(`[server] tin #${event.id} "${event.text}" → đẩy ngay qua ${pushed} kết nối WebSocket; ` +
    `người polling phải đợi lần hỏi kế tiếp (đã nhận ${stats.polls} request, ${stats.emptyPolls} lần trả rỗng)`);
  return event;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readFile(new URL('./public/index.html', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (req.method === 'GET' && url.pathname === '/state') {
      sendJson(res, 200, { lastId });
    } else if (req.method === 'GET' && url.pathname === '/poll') {
      const since = Number(url.searchParams.get('since')) || 0;
      const fresh = events.filter((e) => e.id > since);
      stats.polls += 1;
      if (fresh.length === 0) stats.emptyPolls += 1;
      sendJson(res, 200, fresh);
    } else if (req.method === 'POST' && url.pathname === '/send') {
      sendJson(res, 201, publish());
    } else {
      sendJson(res, 404, { error: 'not_found' });
    }
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

// Gắn WebSocket vào CÙNG server HTTP, chỉ nhận ở đường dẫn /ws
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('error', (err) => console.error('[server] lỗi kết nối:', err.message));
  console.log(`[server] connection — một trình duyệt vừa "gọi điện và giữ máy" (đang mở: ${wss.clients.size})`);
  ws.send(JSON.stringify({ type: 'hello', lastId }));
  ws.on('close', (code) => console.log(`[server] close — một kết nối đóng, code ${code} (còn mở: ${wss.clients.size})`));
});

const port = Number(process.env.PORT) || 3004;
server.listen(port, '127.0.0.1', () => {
  console.log(`Demo polling vs WebSocket: http://127.0.0.1:${port}  (Ctrl+C để dừng)`);
});
