// npm run client -- <tên> <channelId> <lastSeenId> — client WebSocket gõ tay cho npm start. File này có sẵn.
// Mỗi dòng bạn gõ thành một tin chat (clientMsgId ngẫu nhiên). Gõ /lai để gửi lại đúng tin vừa rồi (thử chống trùng).
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { WebSocket } from 'ws';

const [user = 'an', channel = '1', lastSeen = '0'] = process.argv.slice(2);
const url = process.env.TP_WS ?? `ws://127.0.0.1:${process.env.PORT ?? 3113}/ws`;
const ws = new WebSocket(url);
let last: { clientMsgId: string; text: string } | null = null;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'hello', channelId: Number(channel), user, lastSeenId: Number(lastSeen) }));
  console.log(`→ hello (${user}, kênh ${channel}, lastSeenId ${lastSeen}). Gõ tin rồi Enter; /lai = gửi lại; Ctrl+C = thoát`);
  createInterface({ input: process.stdin }).on('line', (line) => {
    const text = line.trim();
    if (text === '') return;
    if (text !== '/lai') last = { clientMsgId: randomUUID(), text };
    if (last) ws.send(JSON.stringify({ type: 'chat', ...last }));
  });
});
ws.on('message', (data) => console.log('←', String(data)));
ws.on('close', (code) => { console.log(`đóng ${code}`); process.exit(0); });
ws.on('error', (err) => { console.log('Lỗi kết nối:', err.message, '— đã chạy npm start chưa?'); process.exit(1); });

