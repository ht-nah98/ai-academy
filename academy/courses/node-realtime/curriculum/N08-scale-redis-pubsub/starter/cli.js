/**
 * Client WebSocket dòng lệnh tí hon (đã viết sẵn) — thay cho wscat/websocat khi debug.
 * Chạy: npm run cli -- "ws://127.0.0.1:3008/ws?name=An"     (node B: cổng 3009)
 * Gõ một dòng + Enter để gửi nguyên văn (vd. {"type":"chat","text":"hi"}); Ctrl+C để thoát.
 * (Cùng file cli.js với bài N09.)
 */
import readline from 'node:readline';
import { WebSocket } from 'ws';

const url = process.argv[2] || 'ws://127.0.0.1:3008/ws?name=cli';
const ws = new WebSocket(url);
const rl = readline.createInterface({ input: process.stdin });
const stamp = () => new Date().toISOString().slice(11, 23);

ws.on('open', () => console.log(`${stamp()} ✓ đã kết nối ${url}`));
ws.on('message', (d, isBinary) => console.log(`${stamp()} ← ${isBinary ? `<binary ${d.length} byte>` : String(d)}`));
ws.on('close', (code, reason) => { console.log(`${stamp()} ✕ đóng code=${code} ${reason}`); process.exit(0); });
ws.on('error', (err) => console.log(`${stamp()} ! lỗi ${err.message}`));
rl.on('line', (line) => {
  if (ws.readyState !== WebSocket.OPEN) return console.log(`${stamp()} ! chưa mở (readyState ${ws.readyState})`);
  ws.send(line);
  console.log(`${stamp()} → ${line}`);
});
