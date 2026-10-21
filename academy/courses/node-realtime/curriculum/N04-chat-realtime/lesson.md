# N04 — Chat realtime: broadcast, giao thức, presence

> Biến echo server thành phòng chat nhiều người của TeamPulse: tin JSON có `type` được kiểm tra, gửi cho cả phòng, có tên, thông báo vào/ra, danh sách đang online — và server không sập khi client gửi bậy hay rớt mạng.

## 🎯 Mục tiêu

Sau buổi này (khoảng 3 giờ) bạn sẽ:

- Thiết kế **giao thức tin nhắn JSON** `{type, ...}` và **kiểm tra** mọi tin client gửi lên.
- **Broadcast**: gửi cho mọi người, hoặc mọi người trừ một người; bỏ qua kết nối không còn `OPEN`.
- Giữ **trạng thái theo kết nối** bằng `Map` (kết nối → tên): join, trùng tên, rời phòng.
- Làm **presence**: thông báo vào/ra và danh sách online luôn đúng, kể cả khi client mất kết nối đột ngột.
- Phân biệt trạng thái **chung** của server với trạng thái **riêng** của từng kết nối, và đọc được code WebSocket ở công ty theo một checklist.
- **Kết quả đo được:** `chat.js` qua hết **13 test**; hai tab trình duyệt chat được với nhau.

> 🧠 **Ghi nhớ:** WebSocket chỉ chuyển **byte**. Nó không biết "tin chat", "vào phòng" hay "ai gửi" — mọi ý nghĩa đó là **giao thức** do bạn tự định nghĩa ở tầng trên. Code WebSocket ở công ty bạn chắc chắn có một giao thức như vậy; đọc được nó là hiểu được nửa hệ thống.

## 📋 Đề bài

**Mở thư mục:** workspace của bài `N04-chat-realtime` (`chat.js`, `public/index.html` — giao diện hoàn chỉnh).

Giao thức (ghi đầy đủ ở đầu `chat.js`):

| Hướng | `type` | Trường | Ai nhận |
|---|---|---|---|
| client → server | `join` | `name` | — |
| client → server | `chat` | `text` | — |
| server → client | `welcome` | `name, users` | Người vừa vào |
| server → client | `joined` | `name, users` | Những người khác trong phòng |
| server → client | `left` | `name, users` | Những người còn lại |
| server → client | `chat` | `from, text, ts` | Mọi người trong phòng, kể cả người gửi |
| server → client | `error` | `error` | Chỉ người gửi sai |

| Viết | Làm gì |
|---|---|
| `parseClientMessage(raw)` | Chuỗi/Buffer → `{ok: true, msg}` hoặc `{ok: false, error}`, không bao giờ ném lỗi |
| `broadcast(clients, payload, except)` | Gửi một JSON cho mọi client `OPEN`, trừ `except`; trả số đã gửi |
| `createChatServer()` | Trang `/` + WebSocket `/ws`: join, chat, rời phòng, mã lỗi |

**Xong khi:** `# pass 13`, rồi `npm start`, mở `http://127.0.0.1:3002` ở **hai tab**, đặt hai tên, chat qua lại; đóng một tab thì tab kia thấy "đã rời phòng".

## 🤔 Tại sao? (kiến thức nền)

### Từ echo tới phòng chat

Echo server (N03): mỗi kết nối chỉ nói chuyện với chính nó. Phòng chat: server phải **nhớ mọi kết nối** và **ai là ai**, rồi chuyển tin của người này tới người khác.

```mermaid
flowchart TD
    M["Tin đến từ một kết nối"] --> P{"parseClientMessage"}
    P -- "ok: false" --> E["Gửi riêng {type: error}"]
    P -- "join" --> J{"Đã join? Trùng tên?"}
    J -- "có" --> E
    J -- "không" --> W["Lưu tên vào Map<br/>welcome cho mình<br/>joined cho người khác"]
    P -- "chat" --> C{"Đã join?"}
    C -- "chưa" --> E
    C -- "rồi" --> B["broadcast {type: chat} cho cả phòng"]
    X["Sự kiện close (đóng tab, mất mạng)"] --> L["Xoá khỏi Map<br/>broadcast {type: left}"]
```

### Vì sao phải kiểm tra mọi tin

Client là **bất kỳ ai** mở được kết nối: trang web của bạn, một script, hay người đang thử phá. Server nhận được mọi thứ: JSON hỏng, `type` lạ, tên dài 10.000 ký tự, `text` là một mảng. Không kiểm tra thì:

| Tin gửi lên | Server không kiểm tra sẽ... |
|---|---|
| `{hỏng` | `JSON.parse` ném lỗi trong listener `message` → **sập cả tiến trình**, mọi người mất kết nối |
| `{"type":"chat","text":["a"]}` | `text.trim` không tồn tại → `TypeError`, cũng sập |
| `{"type":"join","name":"<10.000 ký tự>"}` | Danh sách online của mọi người bị phình ra |
| `{"type":"chat"}` trước khi join | Tin không có người gửi |

Quy tắc: **một** hàm kiểm tra ở cửa vào, trả mã lỗi rõ ràng; phần còn lại của server chỉ làm việc với tin đã sạch.

> 🎯 **Phỏng vấn hay hỏi:** "Client gửi JSON hỏng qua WebSocket thì server của bạn làm gì?" — bắt lỗi parse, trả `{type: "error", error: "invalid_json"}` cho đúng client đó, giữ kết nối; không bao giờ để một client làm sập tiến trình phục vụ mọi người.

### Mất kết nối: `close` luôn đến

| Tình huống | Client gửi frame close? | Server thấy |
|---|---|---|
| Bấm nút đóng, `ws.close()` | Có | `close` code 1000 (hoặc code client chọn) |
| Đóng tab, tải lại trang | Thường có | `close` code 1001 |
| Mất mạng, tiến trình chết, `terminate()` | Không | `close` code 1006 khi TCP báo đứt |

Dù kiểu nào, sự kiện `close` của kết nối đó **luôn** chạy (với mất mạng im lặng thì có thể rất muộn — heartbeat ở P2 xử lý chuyện này). Vì vậy dọn dẹp (xoá tên, báo `left`) đặt trong `close`, không đặt trong một tin `leave` mà client có thể không kịp gửi.

```js
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
await new Promise((r) => wss.once('listening', r));
let closedCount = 0;
wss.on('connection', (ws, req) => {
  const label = new URL(req.url, 'http://x').searchParams.get('who');
  ws.on('close', (code) => {
    console.log(`server: ${label} đóng, code ${code}`);
    closedCount += 1;
    if (closedCount === 2) wss.close();
  });
});

const url = `ws://127.0.0.1:${wss.address().port}/?who=`;
const polite = new WebSocket(url + 'lịch-sự');
polite.on('open', () => polite.close(1000));
const rude = new WebSocket(url + 'đột-ngột');
rude.on('open', () => setTimeout(() => rude.terminate(), 50));
```
```output
server: lịch-sự đóng, code 1000
server: đột-ngột đóng, code 1006
```

## 🛠️ Làm

### Bước 1 — Chuẩn bị

```bash
cd academy/courses/node-realtime/workspace/N04-chat-realtime
npm test    # 13 fail vì TODO — bình thường
node --test --test-name-pattern="parseClientMessage" "../../curriculum/N04-chat-realtime/tests/*.test.js"   # chỉ test của một hàm
```

> ⚠️ **Lỗi hay gặp:** `npm test -- --test-name-pattern=...` **không** lọc được: npm nối cờ vào **sau** mẫu tên file, và Node 22 bỏ qua cờ đặt sau tên file — mọi test vẫn chạy. Gõ thẳng lệnh `node --test --test-name-pattern="<mẫu>" "<mẫu file>"` như trên.

Đọc khối comment đầu `chat.js` và phần `<script>` trong `public/index.html`: giao diện gửi `join`/`chat` và hiển thị mọi `type` server gửi về. Bạn chỉ viết phía server.

### Bước 2 — Kiểm tra theo `type` → `parseClientMessage`

Ví dụ một giao thức khác (điều khiển nhà thông minh) — cùng khuôn: parse an toàn → kiểm tra là object → rẽ nhánh theo trường loại → kiểm tra trường riêng của từng loại → trả object **mới** chỉ có trường đã kiểm tra.

```js
function parseCommand(raw) {
  let data;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return { ok: false, error: 'bad_json' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'bad_json' };
  }
  if (data.cmd === 'light') {
    if (typeof data.on !== 'boolean') return { ok: false, error: 'bad_on' };
    return { ok: true, value: { cmd: 'light', on: data.on } };
  }
  if (data.cmd === 'temp') {
    if (typeof data.c !== 'number' || data.c < 16 || data.c > 30) return { ok: false, error: 'bad_temp' };
    return { ok: true, value: { cmd: 'temp', c: data.c } };
  }
  return { ok: false, error: 'bad_cmd' };
}

for (const raw of ['{"cmd":"light","on":true,"hack":1}', '{"cmd":"temp","c":45}', '{"cmd":"door"}', '[1]', Buffer.from('{oops')]) {
  console.log(String(raw).padEnd(34), '→', JSON.stringify(parseCommand(raw)));
}
```
```output
{"cmd":"light","on":true,"hack":1} → {"ok":true,"value":{"cmd":"light","on":true}}
{"cmd":"temp","c":45}              → {"ok":false,"error":"bad_temp"}
{"cmd":"door"}                     → {"ok":false,"error":"bad_cmd"}
[1]                                → {"ok":false,"error":"bad_json"}
{oops                              → {"ok":false,"error":"bad_json"}
```

`String(raw)` chạy được cho cả chuỗi lẫn `Buffer` (thư viện `ws` đưa `Buffer`). Trả object mới giúp khóa thừa như `"hack"` không lọt vào phần còn lại của server.

> 💡 **Mẹo:** kiểu `{ ok: true, value } | { ok: false, error }` thay cho `throw` khi lỗi là chuyện **bình thường, hay xảy ra** (dữ liệu người dùng). Người gọi buộc phải xét `ok`, không quên `try/catch`.

### Bước 3 — Gửi cho nhiều người → `broadcast`

`clients` có thể là `Set`, mảng, hay `map.keys()` — mọi thứ duyệt được bằng `for...of`. Ví dụ báo tin cho các bàn ăn đang có khách, trừ bàn vừa gọi món:

**Cách 1 — vòng lặp `for...of` + `continue`**

```js
const tables = new Set([
  { no: 1, busy: true, inbox: [] },
  { no: 2, busy: false, inbox: [] },
  { no: 3, busy: true, inbox: [] },
  { no: 4, busy: true, inbox: [] },
]);
const caller = [...tables][2];                    // bàn số 3
const note = JSON.stringify({ type: 'promo', text: 'Giảm 10% chè' });
let sent = 0;
const served = [];
for (const t of tables) {
  if (t === caller || !t.busy) {
    continue;                                     // bỏ qua, sang bàn kế tiếp
  }
  t.inbox.push(note);
  sent += 1;
  served.push(t.no);
}
console.log('đã báo', sent, 'bàn:', served);
```
```output
đã báo 2 bàn: [ 1, 4 ]
```

**Cách 2 — spread + `filter` + `forEach`**

```js
const tables = new Set([
  { no: 1, busy: true, inbox: [] },
  { no: 2, busy: false, inbox: [] },
  { no: 3, busy: true, inbox: [] },
  { no: 4, busy: true, inbox: [] },
]);
const caller = [...tables][2];
const note = JSON.stringify({ type: 'promo', text: 'Giảm 10% chè' });
const targets = [...tables].filter((t) => t !== caller && t.busy);
targets.forEach((t) => t.inbox.push(note));
console.log('đã báo', targets.length, 'bàn:', targets.map((t) => t.no));
```
```output
đã báo 2 bàn: [ 1, 4 ]
```

`[...tables]` (**spread**) trải mọi phần tử của Set ra một mảng mới — tương đương vòng `for (const t of tables) arr.push(t)`. Cần nó vì `Set` không có `filter`/`map`.

> ⚖️ **So sánh:** cùng O(n). Cách 2 tạo thêm 2 mảng tạm (spread, filter); với vài nghìn kết nối vẫn không đáng kể, nhưng broadcast chạy cho **mọi** tin nên server lớn thường viết kiểu Cách 1. Cả hai đều `JSON.stringify` **một lần** ngoài vòng lặp: stringify trong vòng lặp là n lần cùng một việc.

> ⚠️ **Lỗi hay gặp:** gửi cho kết nối không còn `OPEN`. Đang `CONNECTING`: thư viện `ws` và trình duyệt đều ném lỗi (trình duyệt: `InvalidStateError`). Đang `CLOSING`/`CLOSED`: không ném lỗi — trình duyệt **lặng lẽ bỏ** dữ liệu, `ws` chỉ báo lỗi qua callback của `send` nếu bạn truyền vào. Tin mất mà không ai biết, nên luôn kiểm tra `readyState === OPEN` trước khi `send`.

### Bước 4 — `Map`, trùng tên, danh sách online

`Map` giống `dict` của Python nhưng **khóa có thể là object** — ở đây khóa là chính kết nối `ws`. Object thường `{}` chỉ nhận khóa chuỗi.

```js
const lockers = new Map();             // khách (object) → số tủ
const lan = { name: 'Lan' };
const huy = { name: 'Huy' };
lockers.set(lan, 12);
lockers.set(huy, 7);
console.log(lockers.get(lan), lockers.has(huy), lockers.size);
lockers.delete(huy);
console.log(lockers.has(huy), lockers.size, [...lockers.values()]);

const asObject = {};
asObject[lan] = 12;                    // object bị đổi thành chuỗi "[object Object]"
console.log(Object.keys(asObject));
```
```output
12 true 2
false 1 [ 12 ]
[ '[object Object]' ]
```

Kiểm tra tên đã có người dùng (không phân biệt hoa thường):

**Cách 1 — vòng lặp `for...of`**

```js
const members = new Map();             // khóa là object (ở server thật: kết nối ws)
members.set({ seat: 1 }, 'Lan');
members.set({ seat: 2 }, 'Huy');
function taken(wanted) {
  for (const name of members.values()) {
    if (name.toLowerCase() === wanted.toLowerCase()) {
      return true;
    }
  }
  return false;
}
console.log(taken('lan'), taken('Mai'));
```
```output
true false
```

**Cách 2 — spread + `some`**

```js
const members = new Map();
members.set({ seat: 1 }, 'Lan');
members.set({ seat: 2 }, 'Huy');
const taken = (wanted) => [...members.values()].some((n) => n.toLowerCase() === wanted.toLowerCase());
console.log(taken('lan'), taken('Mai'));
```
```output
true false
```

**Cách 3 — thêm một `Set` tên viết thường**

```js
const lowerNames = new Set(['lan', 'huy']);    // cập nhật cùng lúc với Map khi join / rời
const taken = (wanted) => lowerNames.has(wanted.toLowerCase());
console.log(taken('lan'), taken('Mai'));
```
```output
true false
```

`arr.some(fn)` = vòng `for` trả `true` ngay khi `fn` đúng (Cách 1).

> ⚖️ **So sánh:** Cách 1 và 2 là O(n) theo số người online; Cách 3 là O(1) nhưng phải giữ **hai** cấu trúc đồng bộ (quên xoá khỏi `Set` khi rời phòng là lỗi "tên bị giữ mãi"). Phòng vài chục người → dùng Cách 1; hàng chục nghìn người mỗi server → Cách 3.

Danh sách online sắp A→Z:

```js
const names = new Map();
names.set({ seat: 1 }, 'Mai');
names.set({ seat: 2 }, 'An');
names.set({ seat: 3 }, 'Huy');
const users = [...names.values()].sort();
console.log(users, [...names.values()]);
console.log([10, 9, 1].sort(), [10, 9, 1].sort((a, b) => a - b));
```
```output
[ 'An', 'Huy', 'Mai' ] [ 'Mai', 'An', 'Huy' ]
[ 1, 10, 9 ] [ 1, 9, 10 ]
```

`.sort()` **sửa tại chỗ** mảng gọi nó — sort trên bản sao (`[...]`) để không đụng dữ liệu gốc. Không truyền hàm so sánh thì `.sort()` so **chuỗi**: đúng cho tên, sai cho số.

### Bước 5 — Trạng thái chung và trạng thái riêng của từng kết nối

Callback `wss.on('connection', (ws) => { ... })` chạy **một lần cho mỗi kết nối**. Biến khai báo **bên trong** nó là **riêng** của kết nối đó (mỗi lần chạy là một biến mới — closure, N00 Bước 8); biến khai báo **bên ngoài**, trong `createChatServer`, là **chung** cho mọi kết nối.

```mermaid
flowchart TD
    S["createChatServer()<br/>const names = new Map() — CHUNG cho cả phòng"] --> W["wss.on('connection', (ws) => ...)<br/>chạy MỘT lần cho MỖI kết nối"]
    W --> A["Kết nối của An<br/>3 listener: error · message · close"]
    W --> B["Kết nối của Binh<br/>3 listener: error · message · close"]
    W --> C["Kết nối chưa join<br/>3 listener: error · message · close"]
    A -. "names.get(ws)" .-> S
    B -. "names.set / names.delete" .-> S
```

Ví dụ mẫu **cùng khuôn, khác miền** — quầy gửi xe: mỗi kết nối nhận một số vé, `Map` chung biết ai đang gửi xe, kết nối đóng thì dọn khỏi `Map`:

```js
import { once } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
const tickets = new Map();          // CHUNG cho cả server: kết nối → số vé
let nextTicket = 1;                 // CHUNG: mọi kết nối dùng cùng bộ đếm

wss.on('connection', (ws) => {
  const myTicket = nextTicket;      // RIÊNG của kết nối này: mỗi lần 'connection' là một biến mới
  nextTicket += 1;
  let sent = 0;                     // RIÊNG: số tin kết nối này đã gửi
  tickets.set(ws, myTicket);

  ws.on('error', console.error);
  ws.on('message', () => {
    sent += 1;
    const parked = [...tickets.values()].join(', ');
    ws.send(`vé #${myTicket}: tin thứ ${sent} của bạn | đang gửi xe: ${parked}`);
  });
  ws.on('close', () => {
    tickets.delete(ws);             // dọn trạng thái CHUNG khi kết nối đóng
    console.log(`server: vé #${myTicket} lấy xe, còn ${tickets.size} xe`);
    if (tickets.size === 0) wss.close();
  });
});
await once(wss, 'listening');       // = new Promise((r) => wss.once('listening', r))

const url = `ws://127.0.0.1:${wss.address().port}`;
async function connect() {
  const c = new WebSocket(url);
  await once(c, 'open');
  return c;
}
async function ask(c) {
  c.send('?');
  const [data] = await once(c, 'message');   // once trả mảng các đối số của sự kiện
  console.log(data.toString());
}

const lan = await connect();
const huy = await connect();
await ask(lan);
await ask(lan);
await ask(huy);
lan.close();
await once(lan, 'close');
huy.close();
```
```output
vé #1: tin thứ 1 của bạn | đang gửi xe: 1, 2
vé #1: tin thứ 2 của bạn | đang gửi xe: 1, 2
vé #2: tin thứ 1 của bạn | đang gửi xe: 1, 2
server: vé #1 lấy xe, còn 1 xe
server: vé #2 lấy xe, còn 0 xe
```

`sent` đếm riêng từng kết nối (Lan gửi 2, Huy gửi 1), còn `tickets` thấy cả hai. `once(emitter, 'tên')` của `node:events` là cách viết gọn của khuôn `new Promise((r) => emitter.once('tên', r))` (N03).

> ⚠️ **Lỗi hay gặp:** khai báo `const names = new Map()` **bên trong** `wss.on('connection', ...)` → mỗi kết nối có một Map riêng chỉ chứa chính nó: không ai thấy ai, trùng tên không bao giờ bị phát hiện.

### Bước 6 — Ghép `createChatServer` từng bước

Ba listener cho mỗi kết nối, đều nằm trong `wss.on('connection', (ws) => { ... })`:

| Listener | Việc |
|---|---|
| `ws.on('error', ...)` | Ghi log — thiếu nó, một lỗi socket làm sập tiến trình |
| `ws.on('message', (raw) => ...)` | `parseClientMessage` → rẽ nhánh `join` / `chat` như sơ đồ ở trên |
| `ws.on('close', () => ...)` | Có tên trong `Map` thì xoá, rồi `broadcast` `left` cho người còn lại |

Người nhận `chat` là **những kết nối đã join** — tức các khóa của `Map` (`names.keys()`), không phải `wss.clients` (gồm cả người chưa join).

Viết theo từng bước (starter có khung xương trong comment), sau khi `parseClientMessage` và `broadcast` đã qua test — test của `createChatServer` dùng cả hai. Sau mỗi bước chạy:

```bash
node --test --test-name-pattern="createChatServer" "../../curriculum/N04-chat-realtime/tests/*.test.js"
```

| Bước | Viết | Test `createChatServer` xanh thêm |
|---|---|---|
| **6a** | Phần HTTP như N03 (`GET /` → `public/index.html`, khác → 404), `new WebSocketServer({ server, path: '/ws' })`, `ws.on('error', ...)`, `return server` | "GET / trả giao diện chat" |
| **6b** | Trong `createChatServer`, **ngoài** `connection`: `const names = new Map()` và hàm nhỏ `users()` trả tên đang online sắp A→Z. Trong `message`: `parseClientMessage(raw)`; `ok: false` → gửi riêng `{ type: 'error', error }` rồi `return` | (chưa có — cần 6c, 6d) |
| **6c** | Nhánh `join`: đã có trong `names` → `already_joined`; trùng tên (Bước 4) → `name_taken`; hợp lệ → `names.set(ws, name)`, gửi `welcome` cho mình, `broadcast(names.keys(), { type: 'joined', ... }, ws)` | "join → welcome…", "trùng tên…" |
| **6d** | Nhánh `chat`: `names.get(ws)` là `undefined` → `not_joined`; có tên → `broadcast(names.keys(), { type: 'chat', from, text, ts })` | "chat tới mọi người…", "chat trước khi join…", "JSON hỏng…" |
| **6e** | `ws.on('close', ...)`: có tên → `names.delete(ws)` rồi `broadcast` `left` với `users()` mới | "rời phòng…" |
| **6f** | `npm test` → 13 test xanh | |

> ⚠️ **Lỗi hay gặp:** gửi `joined` bằng `broadcast(..., ws)` **trước** khi `names.set(ws, ...)` → `users` thiếu chính người vừa vào. Thứ tự: lưu tên → `welcome` → `joined`.

> ⚠️ **Lỗi hay gặp:** giao diện hiển thị tin bằng `innerHTML` → người gửi `<img src=x onerror=alert(1)>` chạy được JavaScript trên máy mọi người (XSS). `public/index.html` dùng `textContent`; giữ nguyên như vậy khi bạn sửa giao diện.

### Bước 7 — Chạy hai tab, xem frame

```bash
npm start
```

Mở `http://127.0.0.1:3002` ở hai tab (hoặc một tab thường + một tab ẩn danh). Đặt tên `An` và `an` → tab thứ hai báo "Tên này đã có người dùng". Đổi tên khác, chat qua lại. DevTools → Network → WS → Messages: mỗi tin là một frame JSON, đúng bảng giao thức ở trên. Đóng một tab: tab còn lại hiện "… đã rời phòng" và danh sách online giảm.

Thử gửi tin hỏng ngay trong Console của tab đang mở (giao diện giữ kết nối trong biến `ws`):

```js
ws.send('{hỏng');                                   // → ⚠ Tin không phải JSON hợp lệ
ws.send(JSON.stringify({ type: 'chat', text: '' })); // → ⚠ Tin phải từ 1 đến 500 ký tự
```

Server vẫn chạy, các tab khác không bị ảnh hưởng.

### Bước 8 — Checklist đọc code WebSocket ở công ty

Mở repo ở công ty và tìm đủ 8 thứ dưới đây (tìm bằng chức năng **Search** của editor với các từ khóa gợi ý). Mỗi dòng đều có bản thu nhỏ trong N03–N04; dòng "P2" bạn sẽ gặp kỹ ở N05–N09.

| # | Tìm gì | Từ khóa hay gặp | Trong khóa này |
|---|---|---|---|
| 1 | Nơi **nhận kết nối** (server WebSocket được tạo, gắn vào HTTP server nào, path gì) | `new WebSocketServer`, `handleUpgrade`, `'upgrade'`, `new Server(` / `io(` (Socket.IO) | `createChatServer`: `{ server, path: '/ws' }` |
| 2 | **Xác thực**: kiểm tra token/cookie/`Origin` ở đâu — trước handshake hay sau | `verifyClient`, `upgrade`, `token`, `cookie`, `origin`, `io.use(` | P2 — N07 |
| 3 | **Bảng loại tin** (giao thức): mọi `type` client và server gửi | `JSON.parse`, `switch (msg.type)`, `case '`, `type:`, `socket.on('` / `emit('` | Bảng giao thức đầu bài, `parseClientMessage` |
| 4 | **Kiểm tra dữ liệu** vào: tin hỏng bị xử lý thế nào | `try`, `schema`, `validate`, `zod`, `joi` | `{ ok, msg }` / `{ ok, error }` |
| 5 | **Broadcast**: gửi cho ai — cả phòng, trừ người gửi, theo room | `wss.clients`, `.forEach(`, `readyState === WebSocket.OPEN`, `to(room).emit`, `broadcast` | `broadcast(names.keys(), ...)` |
| 6 | **Trạng thái kết nối** lưu ở đâu: Map trong bộ nhớ hay Redis | `new Map`, `new Set`, `redis`, `publish`, `subscribe` | `names` (Map ws → tên); nhiều server → P2, N08 |
| 7 | **Đóng và dọn dẹp**: listener `close` xoá gì, báo ai | `on('close'`, `'disconnect'`, `delete(`, `clearInterval` | `ws.on('close')` → `left` |
| 8 | **Heartbeat và kết nối lại**: server ping, client tự nối lại khi rớt | Server: `ping`, `pong`, `isAlive`, `terminate`, `pingInterval`. Client (code frontend): `onclose`, `reconnect`, `backoff`, `setTimeout(connect` | P2 — N05 |

Ghi kết quả ra một trang giấy (file, dòng code) cho từng mục: đó là "bản đồ" để bạn hỏi đúng người, đúng chỗ khi sửa bug realtime ở công ty.

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc trong thư mục workspace của bài:

```bash
npm test
```

`npm test` chạy `scripts.test` trong `package.json`: `node --test "../../curriculum/N04-chat-realtime/tests/*.test.js"`. Dấu ngoặc kép giữ nguyên mẫu `*.test.js` để chính Node tìm file — chạy được cả trong bash lẫn PowerShell. Node 22 **không** nhận đường dẫn thư mục (`node --test thư-mục/` báo `Cannot find module`).

Mục tiêu: `# pass 13`. Test dựng server thật, mở nhiều client `ws` cùng lúc, kiểm tra ai nhận tin gì — kể cả client chưa join, client gửi JSON hỏng và client bị ngắt đột ngột (`terminate()`).

## 🎤 Câu hỏi phỏng vấn

> 🎯 **Phỏng vấn hay hỏi:** "Bạn thiết kế giao thức tin nhắn cho chat WebSocket thế nào?" — mọi tin là JSON có `type`; client chỉ gửi `join`/`chat`, server gửi `welcome`/`joined`/`left`/`chat`/`error`; mọi tin vào đều qua một hàm kiểm tra trả mã lỗi; trạng thái theo kết nối giữ trong `Map`; dọn dẹp ở sự kiện `close` vì client có thể mất kết nối mà không gửi gì. Nếu được hỏi tiếp "chạy 2 server thì sao?" — mỗi server chỉ biết kết nối của mình; cần Redis pub/sub để chuyển tin giữa các server (P2).
