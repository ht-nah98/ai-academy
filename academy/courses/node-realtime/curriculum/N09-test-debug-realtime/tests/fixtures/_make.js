// Bản server chat có lỗi cố ý, dùng để chấm test của học viên. Mỗi file fixture chọn một lỗi.
import http from 'node:http';
import { WebSocketServer } from 'ws';

export function makeServer(bug) {
  const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  const wss = new WebSocketServer({ server, path: '/ws' });
  let list = []; // dùng mảng riêng để có thể cài lỗi "xoá nhầm"
  let nextId = 1;
  wss.on('connection', (ws, req) => {
    ws.id = nextId++;
    ws.name = new URL(req.url, 'http://x').searchParams.get('name') || `khach-${ws.id}`;
    list.push(ws);
    ws.send(JSON.stringify({ type: 'welcome', id: ws.id, name: ws.name }));
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        if (bug === 'close-on-bad-json') { ws.close(1011); return; }
        ws.send(JSON.stringify({ type: 'error', error: 'bad_json' }));
        return;
      }
      if (!msg || msg.type !== 'chat' || typeof msg.text !== 'string') {
        ws.send(JSON.stringify({ type: 'error', error: 'bad_message' }));
        return;
      }
      const text = JSON.stringify({ type: 'chat', from: ws.name, text: msg.text, sentAt: msg.sentAt });
      for (const c of list) {
        if (c.readyState !== 1) continue;
        if (bug === 'only-sender' && c !== ws) continue;
        if (bug === 'skip-sender' && c === ws) continue;
        c.send(text);
      }
    });
    ws.on('close', () => {
      // lỗi 'drop-others': đảo điều kiện lọc (=== thay vì !==) → giữ lại đúng người vừa rời, xoá hết người còn lại.
      // Không phụ thuộc thứ tự kết nối (khác lỗi splice(i) chỉ xoá những người kết nối SAU người rời).
      if (bug === 'drop-others') list = list.filter((c) => c === ws);
      else list = list.filter((c) => c !== ws);
    });
  });
  return server;
}
