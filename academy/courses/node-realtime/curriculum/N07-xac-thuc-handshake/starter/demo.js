/**
 * Kịch bản thử xác thực (đã viết sẵn). Chạy: npm run demo
 * Dựng createAuthServer() CỦA BẠN ở cổng ngẫu nhiên, đồng hồ giả để thấy token hết hạn ngay.
 */
import { WebSocket } from 'ws';
import { createAuthServer, signToken } from './auth.js';

const secret = 'demo-secret';
let clock = Date.now();
const now = () => clock;
const origin = 'http://127.0.0.1:3007';
const server = createAuthServer({ secret, allowedOrigins: [origin], now });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `ws://127.0.0.1:${server.address().port}/ws`;

const an = signToken({ sub: 'an', rooms: ['general', 'dev'] }, secret, { ttlSec: 3600, now });
const binh = signToken({ sub: 'binh', rooms: ['general'] }, secret, { ttlSec: 60, now });

/** Thử kết nối; in mã HTTP nếu bị từ chối. */
function open(label, headers) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.on('unexpected-response', (req, res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => { console.log(`${label.padEnd(30)} → HTTP ${res.statusCode} ${body}`); resolve(null); });
    });
    ws.on('error', () => {});
    ws.on('open', () => { console.log(`${label.padEnd(30)} → 101, đã kết nối`); resolve(ws); });
  });
}
const next = (ws) => new Promise((r) => ws.once('message', (d) => r(String(d))));

await open('Không token', {});
await open('Token giả', { authorization: 'Bearer abc.def' });
await open('Origin lạ + token An', { authorization: `Bearer ${an}`, origin: 'https://evil.example' });
await open('Token sửa rooms', { authorization: `Bearer ${Buffer.from(JSON.stringify({ sub: 'binh', rooms: ['general', 'dev'], exp: 9e9 })).toString('base64url')}.${binh.split('.')[1]}` });
const wsAn = await open('An qua header Authorization', { authorization: `Bearer ${an}`, origin });
const wsBinh = await open('Binh qua cookie tp_token', { cookie: `theme=dark; tp_token=${binh}`, origin });

wsBinh.send(JSON.stringify({ type: 'chat', room: 'dev', text: 'cho xem với' }));
console.log('Binh gửi vào dev       ←', await next(wsBinh));
wsAn.send(JSON.stringify({ type: 'chat', room: 'general', text: 'Họp 3h' }));
console.log('An gửi vào general: An   ←', await next(wsAn));
console.log('                    Binh ←', await next(wsBinh));

clock += 61_000; // 61 giây sau: token Binh (60 giây) hết hạn
const closed = new Promise((r) => wsBinh.once('close', (code, reason) => r(`${code} ${reason}`)));
wsBinh.send(JSON.stringify({ type: 'chat', room: 'general', text: 'còn đó không?' }));
console.log('61 giây sau, Binh gửi  ←', await next(wsBinh), '| đóng:', await closed);

wsAn.close();
server.close();
