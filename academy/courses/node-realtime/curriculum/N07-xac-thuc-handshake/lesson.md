# N07 — Xác thực token khi handshake

> Tới giờ ai mở được kết nối tới TeamPulse cũng chat được, và tự khai tên gì cũng được. Bài này ký token bằng HMAC, kiểm tra nó **trước khi** nâng cấp lên WebSocket, chặn trang lạ bằng Origin, kiểm tra quyền theo từng tin, và xử lý token hết hạn giữa chừng.

## 🎯 Mục tiêu

Sau buổi này (khoảng 3,5 giờ với người mới) bạn sẽ:

- Ký và kiểm tra **token HMAC-SHA256** bằng `node:crypto` (cùng ý tưởng với JWT), so chữ ký bằng `timingSafeEqual`.
- Chọn **nơi đặt token** khi mở WebSocket (header, cookie, query, subprotocol) và biết vì sao query string bị ghi vào log.
- Xác thực trong sự kiện **`upgrade`**: sai thì trả **401/403 bằng HTTP** rồi đóng socket, không bao giờ tới 101.
- Chặn **Cross-Site WebSocket Hijacking** bằng kiểm tra `Origin`.
- **Phân quyền theo từng tin** (người này có được gửi vào room này không) và xử lý **token hết hạn** khi kết nối đang mở.
- **Kết quả đo được:** `auth.js` qua hết **9 test**; `npm run demo` cho thấy 4 kiểu bị từ chối (401 ×3, 403 ×1) và token 60 giây hết hạn giữa chừng → đóng code 4001.

> 🧠 **Ghi nhớ:** handshake là **request HTTP cuối cùng** của kết nối. Sau 101, không còn header, không còn status code, không còn middleware HTTP. Mọi thứ cần kiểm tra một lần (ai là ai, từ trang nào) phải làm **trước** 101.

## 📋 Đề bài

**Mở thư mục:** workspace của bài `N07-xac-thuc-handshake` (`auth.js`, `demo.js` — đã viết sẵn).

| Viết | Làm gì |
|---|---|
| `signToken(payload, secret, {ttlSec, now})` | `base64url(JSON + exp) + "." + base64url(HMAC-SHA256)` |
| `verifyToken(token, secret, {now})` | `{ok, user}` hoặc `malformed` / `bad_signature` / `expired`; không ném lỗi |
| `authenticateUpgrade(req, {secret, allowedOrigins, now})` | Origin → 403; token từ Bearer hoặc cookie `tp_token` → 401 nếu thiếu/sai |
| `createAuthServer({secret, allowedOrigins, now})` | `upgrade` → xác thực → 101 hoặc 401/403/404; chat theo quyền room; hết hạn → 4001 |

`now` là tham số (mặc định `Date.now`) để test và `demo.js` dùng **đồng hồ giả**: không phải chờ 60 giây thật để thấy token hết hạn.

**Xong khi:** `# pass 9` và `npm run demo` in đúng các dòng ở Bước 6.

## 🤔 Tại sao? (kiến thức nền)

### Xác thực ở đâu: trước 101

```mermaid
flowchart TD
    R["GET /ws<br/>Upgrade: websocket<br/>Origin, Authorization / Cookie"] --> P{"Đường dẫn = /ws?"}
    P -- "không" --> N["HTTP 404, đóng socket"]
    P -- "có" --> O{"Origin được phép?<br/>(không có Origin: cho qua)"}
    O -- "không" --> F["HTTP 403 bad_origin, đóng socket"]
    O -- "có" --> T{"Có token? Chữ ký đúng? Còn hạn?"}
    T -- "không" --> U["HTTP 401 no_token / bad_signature / expired"]
    T -- "có" --> H["handleUpgrade → 101<br/>ws.user = payload"]
    H --> M["Mỗi tin: còn hạn? có quyền ở room?"]
    M -- "hết hạn" --> X["error token_expired + close 4001"]
    M -- "không có quyền" --> Y["error forbidden"]
    M -- "được" --> Z["Gửi cho người có quyền ở room"]
```

Từ chối ở `upgrade` rẻ hơn và rõ hơn so với "cho kết nối rồi mới đuổi": server không tạo object WebSocket, không giữ bộ nhớ cho kết nối lạ, và client nhận được **mã HTTP** để biết lý do (trình duyệt chỉ thấy `close` code 1006, nhưng tab Network vẫn hiện 401).

| Cách gắn xác thực với `ws` | Ghi chú |
|---|---|
| `new WebSocketServer({ noServer: true })` + `server.on('upgrade', ...)` (bài này) | Kiểm soát hết: đường dẫn, mã lỗi, body; tài liệu `ws` khuyên dùng |
| `new WebSocketServer({ server, verifyClient })` | Gọn hơn, nhưng tài liệu `ws` không khuyến khích dùng nữa |
| Socket.IO: `io.use((socket, next) => ...)` | Middleware chạy trước `connection`; lỗi tới client là `connect_error` |

Socket.IO cùng ý tưởng — middleware trả lỗi thì kết nối không bao giờ tới `connection`:

```js
import http from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

const server = http.createServer();
const srv = new Server(server);
srv.use((socket, next) => {
  const key = socket.handshake.auth.apiKey;          // client gửi qua io(url, { auth: {...} })
  if (key !== 'kho-123') return next(new Error('unauthorized'));
  socket.data.warehouse = 'kho-hcm';
  next();
});
srv.on('connection', (socket) => console.log('server: vào được, kho =', socket.data.warehouse));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;

for (const apiKey of ['sai', 'kho-123']) {
  const c = io(url, { auth: { apiKey }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve) => {
    c.once('connect_error', (err) => { console.log(`client (${apiKey}): connect_error "${err.message}"`); resolve(); });
    c.once('connect', () => { console.log(`client (${apiKey}): connect`); c.disconnect(); resolve(); });
  });
}
srv.close();
```
```output
client (sai): connect_error "unauthorized"
server: vào được, kho = kho-hcm
client (kho-123): connect
```

### Đặt token ở đâu khi mở WebSocket

> 🧠 **Ghi nhớ — cookie và Origin trong 6 dòng:**
> - **Cookie**: server trả header `Set-Cookie: tp_token=abc` một lần; từ đó trình duyệt **tự đính** `Cookie: tp_token=abc` vào request sau tới server đó — kể cả request mở WebSocket — miễn là luật `SameSite` cho phép (mục CSWSH bên dưới). Code JavaScript của trang không phải làm gì.
> - Thuộc tính cookie: `HttpOnly` = JavaScript trên trang không đọc được (script lạ chèn vào trang không lấy trộm được token); `Secure` = chỉ gửi qua HTTPS/WSS; `SameSite` = có gửi kèm khi request xuất phát từ trang **khác site** hay không.
> - **Origin** của trang = `giao thức://tên miền:cổng`, vd. `https://teampulse.cty.vn`. **Same-origin** = cả ba giống nhau. **Site** rộng hơn: cùng giao thức và cùng tên miền đăng ký — `chat.cty.vn` và `blog.cty.vn` cùng site `cty.vn` nhưng khác origin.
> - Trình duyệt tự đặt header `Origin` (origin của trang đang mở kết nối) vào request WebSocket; JavaScript trên trang không sửa được nó.
> - **CORS** là luật trình duyệt áp cho `fetch`/XHR: trang chỉ đọc được response từ origin khác nếu server cho phép. WebSocket **không** áp CORS.
> - **Referer**: header trình duyệt ghi URL của trang (hoặc link) dẫn tới request — URL có `?token=` có thể lọt ra theo đường này.

`new WebSocket(url)` của trình duyệt **không cho đặt header** tuỳ ý. Bốn lựa chọn thường gặp:

| Nơi đặt | Trình duyệt làm được? | Rủi ro / ghi chú |
|---|---|---|
| Header `Authorization: Bearer ...` | Không (chỉ client Node, app mobile) | Sạch nhất cho client không phải trình duyệt |
| Cookie (`tp_token=...; HttpOnly; Secure; SameSite=Lax`) | Có, trình duyệt tự gửi | Vẫn đi kèm khi trang **lạ cùng site** (subdomain khác) mở kết nối, và cả trang khác site nếu cookie là `SameSite=None` → bắt buộc kiểm tra Origin |
| Query `?token=...` | Có | URL bị ghi vào access log, lịch sử, header Referer |
| `Sec-WebSocket-Protocol: auth, <token>` | Có (`new WebSocket(url, ['auth', token])`) | Header này vốn để client đề xuất "giao thức con" (tên định dạng tin nhắn) và server chọn một; nhét token vào là mẹo lách — server phải chọn lại đúng một subprotocol khi trả 101 |

Query string vào log thế nào — một access log bình thường:

```js
import http from 'node:http';

const server = http.createServer((req, res) => {
  console.log(`[access.log] ${req.method} ${req.url}`);
  res.end('ok');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
await fetch(`${base}/ws?token=eyJzdWIiOiJhbiJ9.c2VjcmV0LXNpZw`);
await fetch(`${base}/ws`, { headers: { authorization: 'Bearer eyJzdWIiOiJhbiJ9.c2VjcmV0LXNpZw' } });
server.close();
```
```output
[access.log] GET /ws?token=eyJzdWIiOiJhbiJ9.c2VjcmV0LXNpZw
[access.log] GET /ws
```

Ai đọc được log (đội vận hành, dịch vụ gom log, bản sao lưu) là có token. Bài này nhận **Bearer** (client Node) và **cookie** (trình duyệt), không nhận query. Nếu bắt buộc dùng query (vd. client cũ), dùng token **rất ngắn hạn, dùng một lần**, xin qua một API HTTP có xác thực ngay trước khi mở WebSocket.

**Token đến từ đâu?** Bài này tự ký token bằng `signToken` (trong `npm start`, `demo.js`) để tập trung vào phía WebSocket. Ở sản phẩm thật, trình duyệt lấy token qua một trang đăng nhập — phần đăng nhập thật (băm mật khẩu, session) nằm ngoài P2:

```mermaid
flowchart TD
    L["Trình duyệt: POST /login<br/>(tên + mật khẩu)"] --> S["Server kiểm mật khẩu,<br/>signToken({sub, rooms})"]
    S --> C["Response: Set-Cookie: tp_token=...<br/>HttpOnly; Secure; SameSite=Lax"]
    C --> W["Trang chat chạy new WebSocket('wss://.../ws')"]
    W --> H["Handshake tự kèm Cookie: tp_token=...<br/>và Origin của trang"]
    H --> V["authenticateUpgrade: kiểm Origin,<br/>đọc cookie, verifyToken → 101"]
```

Client không phải trình duyệt (service khác, app mobile, test) thì xin token qua API rồi gửi bằng header `Authorization: Bearer ...`.

### Cross-Site WebSocket Hijacking (CSWSH)

WebSocket **không** bị chính sách same-origin/CORS chặn: trang nào cũng mở được `new WebSocket('wss://teampulse.cty.vn/ws')`. Cookie đăng nhập của `teampulse.cty.vn` có đi kèm handshake đó không thì do thuộc tính `SameSite` của cookie quyết định:

| Cookie | Trang **khác site** (`https://evil.example`) mở WebSocket | Trang **cùng site, khác origin** (`https://blog.cty.vn`) mở WebSocket |
|---|---|---|
| `SameSite=Strict` hoặc `SameSite=Lax` | Không gửi | **Có gửi** |
| `SameSite=None; Secure` | **Có gửi** (trừ khi trình duyệt/người dùng chặn cookie bên thứ ba) | **Có gửi** |
| Không ghi `SameSite` | Chrome/Edge coi như `Lax` → không gửi; Firefox, Safari có luật riêng tuỳ phiên bản và chế độ chống theo dõi → đừng dựa vào mặc định | Có gửi |

Khi cookie đi kèm mà server chỉ nhìn cookie, trang lạ mở được kết nối **dưới danh nghĩa nạn nhân** và đọc toàn bộ chat — gọi là **Cross-Site WebSocket Hijacking**. `SameSite=Lax`/`Strict` là lớp phòng thủ **thứ hai** tốt, nhưng không đủ: mọi subdomain cùng site (trang blog, trang upload file người dùng, một subdomain bị chiếm) vẫn qua được, và cookie buộc phải để `None` khi giao diện nằm ở site khác API. Chặn chắc: trình duyệt luôn gửi header `Origin` thật (JavaScript không sửa được) → server chỉ chấp nhận Origin trong danh sách. Client không phải trình duyệt thường không gửi Origin — cho qua bước này, vì bước token vẫn bắt họ chứng minh danh tính.

> 🎯 **Phỏng vấn hay hỏi:** "WebSocket có bị CORS chặn không?" — không. Trình duyệt cho mọi trang mở WebSocket tới mọi server, và gửi kèm cookie khi luật `SameSite` cho phép (luôn có với trang cùng site; cả trang khác site nếu cookie `SameSite=None`). Server phải tự kiểm tra `Origin` trong handshake (chống CSWSH) và xác thực token trước khi trả 101; `SameSite` chỉ là lớp phòng thủ thứ hai.

### Token có chữ ký: HMAC

Token mang thông tin (`sub`, `rooms`, `exp`) ở dạng **đọc được** (base64url chỉ là **đổi cách viết** — encoding — ai cũng giải ngược được; không phải **mật mã** — encryption — cần khoá mới đọc được), kèm **chữ ký** HMAC tính từ nội dung + `secret` chỉ server biết. Ai sửa nội dung mà không có `secret` thì chữ ký không khớp. Ví dụ phiếu giảm giá:

```js
import { createHmac } from 'node:crypto';

const SECRET = 'khoa-bi-mat-cua-cua-hang';
const signOf = (text) => createHmac('sha256', SECRET).update(text).digest('base64url');

const coupon = Buffer.from(JSON.stringify({ code: 'TET2026', off: 10 })).toString('base64url');
const issued = `${coupon}.${signOf(coupon)}`;
console.log('phiếu  :', issued);

const [body, sig] = issued.split('.');
console.log('đọc    :', Buffer.from(body, 'base64url').toString(), '| chữ ký khớp:', signOf(body) === sig);

const forged = Buffer.from(JSON.stringify({ code: 'TET2026', off: 90 })).toString('base64url');
console.log('sửa off:', Buffer.from(forged, 'base64url').toString(), '| chữ ký khớp:', signOf(forged) === sig);
```
```output
phiếu  : eyJjb2RlIjoiVEVUMjAyNiIsIm9mZiI6MTB9.HxyHbLnD4gcwKPaSlI9Rnr9giw5OqaU0uhSqjgFDsNo
đọc    : {"code":"TET2026","off":10} | chữ ký khớp: true
sửa off: {"code":"TET2026","off":90} | chữ ký khớp: false
```

| | Token HMAC tự viết (bài này) | JWT (`jsonwebtoken`, `jose`) |
|---|---|---|
| Cấu trúc | `body.sig` | `header.body.sig` (header ghi thuật toán) |
| Thuật toán | Chỉ HMAC-SHA256 | HS256, RS256, ES256... (khóa công khai/bí mật) |
| Phụ thuộc | Không, chỉ `node:crypto` | Một thư viện |
| Dùng khi | Server tự ký, tự kiểm | Token do hệ thống khác (SSO, Auth0, Keycloak) cấp |

Ở công ty, token thường là JWT do dịch vụ đăng nhập cấp; phía WebSocket chỉ **kiểm tra**. Viết tay một lần để biết thư viện JWT làm gì bên dưới. Không tự viết khi cần RS256/ES256.

Demo trên so chữ ký bằng `===` cho dễ đọc. Code thật dùng `timingSafeEqual`: `===` dừng ở byte sai đầu tiên, nên thời gian so sánh lộ ra "đúng được bao nhiêu byte đầu" — kẻ tấn công đo thời gian để đoán dần chữ ký. `timingSafeEqual` luôn so hết, nhưng **ném lỗi** nếu hai Buffer khác độ dài:

```js
import { timingSafeEqual } from 'node:crypto';

const a = Buffer.from('abc123');
console.log(timingSafeEqual(a, Buffer.from('abc123')), timingSafeEqual(a, Buffer.from('abc124')));
try {
  timingSafeEqual(a, Buffer.from('abc'));
} catch (err) {
  console.log('độ dài khác nhau →', err.code);
}
```
```output
true false
độ dài khác nhau → ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
```

## 🛠️ Làm

### Bước 1 — Chuẩn bị

```bash
cd academy/courses/node-realtime/workspace/N07-xac-thuc-handshake
npm test    # 9 fail vì TODO — bình thường
```

Chạy riêng test của hàm đang làm — cờ `--test-name-pattern` (biểu thức chính quy so với tên test) phải đứng **trước** đường dẫn file; `npm test -- --test-name-pattern=...` không lọc được vì npm nối cờ vào sau đường dẫn. Dùng y hệt trên PowerShell:

```bash
node --test --test-name-pattern="signToken" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

### Bước 2 — Ký → `signToken`

Theo đúng docstring: bản sao payload + `exp` (giây Unix, `Math.floor(now() / 1000) + ttlSec`) → `JSON.stringify` → `Buffer.from(...).toString('base64url')` → HMAC của **chuỗi body** → nối bằng `.`. Dùng spread `{ ...payload, exp }` để tạo bản sao — không sửa object người gọi truyền vào.

> 💡 **Mẹo:** `exp` tính bằng **giây** (quy ước của JWT), `Date.now()` trả **mili giây**. Nhầm đơn vị là lỗi số một: token "hết hạn năm 58000" hoặc hết hạn ngay khi tạo.

```bash
node --test --test-name-pattern="signToken" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

### Bước 3 — Kiểm tra → `verifyToken`

Thứ tự trong docstring có lý do: **kiểm chữ ký trước khi tin nội dung**. Chưa kiểm chữ ký thì đừng `JSON.parse` rồi dùng `exp`, `rooms` của nó vào việc gì.

| Bước | Sai thì |
|---|---|
| Là chuỗi, `split('.')` ra đúng 2 phần không rỗng | `malformed` |
| Tính lại HMAC của phần 1, so với phần 2 bằng `timingSafeEqual` (kiểm độ dài trước) | `bad_signature` |
| `JSON.parse(Buffer.from(body, 'base64url').toString())` trong `try/catch`, kết quả là object thường: `typeof v === 'object' && v !== null && !Array.isArray(v)` (vì `typeof null === 'object'` — bẫy đã gặp ở N01 — và mảng cũng là object) | `malformed` |
| `exp` là số và `now() < exp × 1000` | `expired` |

```bash
node --test --test-name-pattern="verifyToken" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

### Bước 4 — Tìm token → `authenticateUpgrade`

Header `cookie` là một chuỗi `k1=v1; k2=v2`. Ví dụ cùng định dạng (thông số sản phẩm):

**Cách 1 — vòng lặp, dừng khi tìm thấy**

```js
function findPart(header, wanted) {
  const pieces = header.split(';');
  for (const piece of pieces) {
    const eq = piece.indexOf('=');
    if (eq === -1) continue;
    const key = piece.slice(0, eq).trim();
    if (key === wanted) {
      return piece.slice(eq + 1).trim();
    }
  }
  return null;
}
const header = 'size=L; color=do; note=a=b';
console.log(findPart(header, 'color'), findPart(header, 'note'), findPart(header, 'brand'));
```
```output
do a=b null
```

**Cách 2 — tách hết thành object bằng `map` + `Object.fromEntries`**

```js
function parseAll(header) {
  return Object.fromEntries(
    header.split(';')
      .filter((p) => p.includes('='))
      .map((p) => [p.slice(0, p.indexOf('=')).trim(), p.slice(p.indexOf('=') + 1).trim()]),
  );
}
const parts = parseAll('size=L; color=do; note=a=b');
console.log(parts.color, parts.note, parts.brand ?? null);
```
```output
do a=b null
```

`Object.fromEntries([[k, v], ...])` biến mảng cặp thành object — tương đương vòng `for` gán `obj[k] = v`.

> ⚖️ **So sánh:** cùng O(n) theo độ dài header. Cách 1 dừng sớm khi gặp khóa cần tìm và không tạo object; Cách 2 tiện khi cần tra **nhiều** khóa. Cả hai cắt ở dấu `=` **đầu tiên** (`indexOf`), vì giá trị có thể chứa `=` (base64 có dấu `=` ở cuối) — `split('=')` rồi lấy phần `[1]` sẽ cắt mất.

Header `authorization` có dạng `Bearer <token>`: kiểm tra `startsWith('Bearer ')` rồi cắt phần sau. Node đưa mọi tên header về **chữ thường** (`req.headers.authorization`, `req.headers.origin`).

```bash
node --test --test-name-pattern="authenticateUpgrade" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

### Bước 5 — Từ chối trước 101 → `createAuthServer`

Hàm dài nhất bài; làm từng phần 5a → 5e theo khung chú thích trong starter, mỗi phần chạy riêng test của nó. Phần ghép chuỗi HTTP thô (`HTTP/1.1 401 ...\r\n...`) đã có sẵn trong hàm `rejectUpgrade(socket, status, error)` — bạn chỉ cần gọi.

| Phần | Việc |
|---|---|
| `new WebSocketServer({ noServer: true })` | `ws` không tự nghe `upgrade` nữa; bạn quyết định |
| `server.on('upgrade', (req, socket, head) => ...)` | `socket` là TCP thô (chưa phải WebSocket): từ chối bằng `rejectUpgrade(socket, status, error)` |
| Đúng → `wss.handleUpgrade(req, socket, head, (ws) => ...)` | Gắn `ws.user`, rồi `wss.emit('connection', ws, req)` để dùng `wss.on('connection')` như cũ |
| Mỗi tin | Hết hạn → `token_expired` + `ws.close(4001, ...)`; room ngoài `ws.user.rooms` → `forbidden`; được → gửi cho kết nối OPEN có quyền ở room |

#### Bước 5a — Server và `wss` không tự nâng cấp

`http.createServer` trả 404 cho mọi request thường; `new WebSocketServer({ noServer: true })`; `return server` (chưa `listen`). Đến đây test chưa qua — cần 5b.

#### Bước 5b — `upgrade`: đường dẫn, rồi `authenticateUpgrade`

Trong `server.on('upgrade', ...)`: lấy đường dẫn bằng `new URL(req.url, 'http://x').pathname` (bỏ phần `?...`), khác `/ws` → `rejectUpgrade(socket, 404, 'not_found')`; gọi `authenticateUpgrade` (Bước 4), sai → `rejectUpgrade(socket, result.status, result.error)`. Thêm `socket.on('error', () => {})` để client cắt ngang không làm sập server. Test gửi request nâng cấp **thô** và đọc đúng dòng `HTTP/1.1 401 ...`:

```bash
node --test --test-name-pattern="từ chối 401" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

#### Bước 5c — `handleUpgrade` và chat theo quyền

Hợp lệ → `wss.handleUpgrade(req, socket, head, (ws) => { ws.user = result.user; wss.emit('connection', ws, req); })`. Trong `wss.on('connection')`, tin chat hợp lệ gửi `{type: 'chat', room, from: ws.user.sub, text}` cho mọi `c` của `wss.clients` có `c.readyState === OPEN` **và** `c.user.rooms.includes(room)` — vòng `for...of` + `if` như `broadcast` ở N04, thêm một điều kiện.

```bash
node --test --test-name-pattern="token đúng → kết nối" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

#### Bước 5d — Kiểm tra từng tin: `bad_message`, `forbidden`

`JSON.parse` trong `try/catch`; không phải `{type: 'chat', room: <chuỗi>, text: <chuỗi>}` → `bad_message`; `room` không có trong `ws.user.rooms` → `forbidden`, không gửi cho ai.

> ⚠️ **Lỗi hay gặp:** chỉ kiểm tra quyền lúc handshake. Token hợp lệ không có nghĩa mọi tin đều hợp lệ: người chỉ có quyền `general` vẫn gửi được `{room: "dev"}` nếu server không kiểm tra **từng tin**.

> ⚠️ **Lỗi hay gặp:** tin `sub` hay `name` client tự gửi trong tin chat. `from` phải lấy từ `ws.user.sub` (đã ký), không lấy từ dữ liệu client.

```bash
node --test --test-name-pattern="forbidden" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

#### Bước 5e — Token hết hạn giữa chừng

Đầu handler `message` (trước mọi kiểm tra khác): `now() >= ws.user.exp * 1000` → gửi `{type: 'error', error: 'token_expired'}` rồi `ws.close(4001, 'token_expired')`. Dùng `now` được truyền vào (đồng hồ giả của test), không gọi `Date.now()` trực tiếp.

| Mã đóng | Nghĩa |
|---|---|
| `1000` | Đóng bình thường |
| `1006` | Không có frame close (mất mạng, `terminate()`) — không bao giờ được gửi chủ động |
| `1008` | Chuẩn: vi phạm chính sách (chung chung, client không biết phải làm gì) |
| `4000–4999` | Dành cho ứng dụng tự đặt nghĩa: `4001` = "token hết hạn, xin token mới rồi kết nối lại" |

```bash
node --test --test-name-pattern="hết hạn giữa chừng" "../../curriculum/N07-xac-thuc-handshake/tests/*.test.js"
```

### Bước 6 — Chạy kịch bản

```bash
npm run demo
```

```output
Không token                    → HTTP 401 {"error":"no_token"}
Token giả                      → HTTP 401 {"error":"bad_signature"}
Origin lạ + token An           → HTTP 403 {"error":"bad_origin"}
Token sửa rooms                → HTTP 401 {"error":"bad_signature"}
An qua header Authorization    → 101, đã kết nối
Binh qua cookie tp_token       → 101, đã kết nối
Binh gửi vào dev       ← {"type":"error","error":"forbidden"}
An gửi vào general: An   ← {"type":"chat","room":"general","from":"an","text":"Họp 3h"}
                    Binh ← {"type":"chat","room":"general","from":"an","text":"Họp 3h"}
61 giây sau, Binh gửi  ← {"type":"error","error":"token_expired"} | đóng: 4001 token_expired
```

"Token sửa rooms" là Binh tự thêm `dev` vào `rooms` trong phần body rồi giữ chữ ký cũ → `bad_signature`. `npm start` chạy server thật ở cổng 3007 và in token mẫu để bạn thử bằng client riêng.

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc trong thư mục workspace của bài:

```bash
npm test
```

Mục tiêu: `# pass 9`. Test gửi request nâng cấp **thô** qua TCP (`node:net`) để thấy đúng dòng `HTTP/1.1 401 ...` server trả về, và dùng đồng hồ giả để token hết hạn giữa chừng mà không phải chờ.

## 🎤 Câu hỏi phỏng vấn

> 🎯 **Phỏng vấn hay hỏi:** "Bạn xác thực kết nối WebSocket thế nào?" — kiểm tra trong handshake, trước 101: (1) `Origin` nằm trong danh sách cho phép (chống CSWSH: WebSocket không bị CORS chặn, và trình duyệt gửi kèm cookie khi `SameSite` cho phép — luôn có với trang cùng site; `SameSite` chỉ là lớp phòng thủ thứ hai); (2) token từ header `Authorization` (client không phải trình duyệt) hoặc cookie `HttpOnly` (trình duyệt), tránh query string vì bị ghi log; (3) kiểm chữ ký bằng so sánh thời gian hằng, rồi mới đọc `exp`; sai thì trả 401/403 bằng HTTP và đóng socket. Sau đó vẫn phân quyền **từng tin** (room nào được gửi), lấy danh tính từ token chứ không từ dữ liệu client, và xử lý token hết hạn giữa chừng (đóng với mã 4001 để client xin token mới).
