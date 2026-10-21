# N08 — Nhiều server với Redis pub/sub

> Một tiến trình Node có giới hạn; production chạy nhiều instance sau load balancer. Nhưng mỗi instance chỉ giữ kết nối của nó: người ở server A không thấy tin của người ở server B. Bài này nối các instance bằng pub/sub — trước bằng broker trong bộ nhớ để test offline, rồi bằng Redis thật.

## 🎯 Mục tiêu

Sau buổi này (khoảng 3,5 giờ với người mới; thêm 30–90 phút nếu lần đầu cài Docker/Redis cho phần chạy thật) bạn sẽ:

- Giải thích vì sao **broadcast trong một tiến trình** không đủ khi chạy nhiều instance.
- Thiết kế một **interface broker** nhỏ (`publish`/`subscribe`) và viết bản **trong bộ nhớ** (EventEmitter) để test không cần Redis.
- Dùng **Redis pub/sub** thật bằng thư viện `redis`: hai kết nối, subscriber mode, `PUBLISH` trả gì.
- Viết **chat node**: mọi tin đi qua broker, mỗi node giao cho client của mình.
- Tính được **chi phí fan-out**, biết khi nào cần **sticky session**, và Socket.IO giải bài này bằng adapter ra sao.
- **Kết quả đo được:** `scale.js` qua hết **8 test** không cần Redis; `npm start` + 2 client dòng lệnh ở cổng 3008/3009 thấy tin của nhau; với Redis thật, 2 **tiến trình** ở cổng 3108/3109 thấy tin của nhau; 2.000 tin giao trong 0,03 s, độ trễ trung vị 4,3 ms (Redis) so với 2,3 ms (bộ nhớ).

> 🧠 **Ghi nhớ:** WebSocket là kết nối **có trạng thái**: một client gắn với **một** tiến trình cho tới khi đứt. Muốn tin tới client ở tiến trình khác, phải có một kênh **giữa các tiến trình** — pub/sub.

> 🧠 **Ghi nhớ — bốn từ của bài:**
> - **Instance** (hay "node" trong bài): một bản server đang chạy — một tiến trình `node scale.js`. Production chạy nhiều bản giống hệt nhau, trên một hay nhiều máy.
> - **Load balancer**: "cửa vào" chia kết nối của client cho các instance (vd. nginx, AWS ALB). Client chỉ biết một địa chỉ.
> - **Redis**: một server lưu dữ liệu trong RAM, các chương trình nói chuyện với nó qua mạng (cổng 6379). Ngoài lưu key–value, nó có **pub/sub**: chương trình *publish* tin lên một kênh, mọi chương trình đã *subscribe* kênh đó nhận được.
> - **Docker**: chạy phần mềm đóng gói sẵn (gọi là image, vd. `redis:7-alpine`) bằng một lệnh, không phải cài từng thứ vào máy. Bài này chỉ dùng nó để bật Redis; có cách cài Redis không cần Docker ở Bước 6.

```mermaid
flowchart TD
    C1["Client An"] --> LB["Load balancer"]
    C2["Client Binh"] --> LB
    LB --> A["Instance A<br/>(tiến trình node)"]
    LB --> B["Instance B<br/>(tiến trình node)"]
    A <--> R[("Redis: kênh pub/sub")]
    B <--> R
```

## 📋 Đề bài

**Mở thư mục:** workspace của bài `N08-scale-redis-pubsub` (`scale.js`; `bench.js`, `cli.js` — đã viết sẵn).

| Viết | Làm gì |
|---|---|
| `createMemoryBroker()` | `publish(channel, string) → số subscriber`, `subscribe(channel, handler) → unsubscribe`; giao tin bất đồng bộ |
| `createRedisBroker({pub, sub})` | Cùng interface, bọc 2 client `redis`: `pub` để publish, `sub` để subscribe |
| `createChatNode({broker, nodeId})` | Server chat `/ws?name=`: tin hợp lệ → publish; tin từ kênh → gửi mọi client của node; `stats` |

`npm start` chạy node A (:3008) và B (:3009) **trong cùng một tiến trình**, dùng chung broker bộ nhớ; thêm `REDIS_URL` để dùng Redis. `npm run cli -- "ws://127.0.0.1:3008/ws?name=An"` là client dòng lệnh (gõ JSON rồi Enter). `npm run bench` đo fan-out bằng chính code của bạn.

**Xong khi:** `# pass 8`, và `npm start` + hai client dòng lệnh (An ở cổng 3008, Binh ở 3009) thấy tin của nhau (Bước 6, không cần Redis). Có Redis (Docker hoặc cài thẳng): thêm phần 2 tiến trình riêng thấy tin của nhau qua Redis.

## 🤔 Tại sao? (kiến thức nền)

### Vấn đề: mỗi instance chỉ biết client của nó

```js
function createInstance(id) {
  const clients = new Set();
  return {
    id,
    connect(name) {
      const c = { name, inbox: [] };
      clients.add(c);
      return c;
    },
    broadcast(text) {
      for (const c of clients) c.inbox.push(`${text} (qua ${id})`);
    },
  };
}
const a = createInstance('A');
const b = createInstance('B');
const lan = a.connect('Lan');      // load balancer chia Lan vào A
const minh = b.connect('Minh');    // ...và Minh vào B
a.broadcast('Lan: trưa nay ăn gì?');
console.log('Lan  nhận:', lan.inbox);
console.log('Minh nhận:', minh.inbox);
```
```output
Lan  nhận: [ 'Lan: trưa nay ăn gì? (qua A)' ]
Minh nhận: []
```

Đây đúng là `broadcast` của N04 khi chạy 2 bản. Cách chữa: instance nhận tin **không** tự gửi cho client, mà **publish** lên một kênh chung; **mọi** instance (kể cả chính nó) **subscribe** kênh đó và gửi cho client của mình.

```mermaid
flowchart TD
    An["Client An"] -- "ws: {type: chat}" --> A["Node A"]
    A -- "PUBLISH teampulse:chat" --> R[("Redis pub/sub")]
    R -- "message" --> A
    R -- "message" --> B["Node B"]
    A -- "ws: chat via A" --> An
    B -- "ws: chat via B" --> Binh["Client Binh"]
    LB["Load balancer"] -. "chia kết nối" .-> A
    LB -. "chia kết nối" .-> B
```

Node gửi cũng nhận lại tin của chính mình qua Redis — **một đường duy nhất** cho mọi tin, nên mọi client thấy cùng một thứ tự, và không có chuyện người gửi nhận 2 lần (một lần gửi thẳng, một lần qua Redis).

### Redis pub/sub: những điều phải biết

Chạy với Redis thật (Bước 6 có cách cài):

```js
import { createClient } from 'redis';

const pub = createClient({ url: 'redis://127.0.0.1:6379' });
const sub = pub.duplicate();                      // kết nối thứ hai, cùng cấu hình
await pub.connect();
await sub.connect();

await sub.subscribe('kho:nhap', (message, channel) => console.log(`sub nhận [${channel}]`, message));
await sub.subscribe('kho:nhap', (message) => console.log('listener thứ hai cũng nhận', message));
console.log('PUBLISH trả', await pub.publish('kho:nhap', '{"sku":"TAO-01","qty":30}'), '(đếm theo KẾT NỐI subscribe, không theo listener)');
console.log('kênh không ai nghe:', await pub.publish('kho:xuat', 'mất luôn'));
try {
  await sub.publish('kho:nhap', 'x');
} catch (err) {
  console.log('sub.publish →', err.message.slice(0, 40) + '...');
}
await new Promise((r) => setTimeout(r, 100));
await sub.close();
await pub.close();
```
```output
PUBLISH trả 1 (đếm theo KẾT NỐI subscribe, không theo listener)
sub nhận [kho:nhap] {"sku":"TAO-01","qty":30}
listener thứ hai cũng nhận {"sku":"TAO-01","qty":30}
kênh không ai nghe: 0
sub.publish → ERR Can't execute 'publish': only (P|S)S...
```

| Đặc điểm | Hệ quả cho TeamPulse |
|---|---|
| Kết nối đã `SUBSCRIBE` vào **subscriber mode**, chỉ được (UN)SUBSCRIBE/PING | Cần **2 kết nối**: một publish, một subscribe (`pub.duplicate()`) |
| Chỉ chở **chuỗi** (hoặc Buffer) | `JSON.stringify` trước khi publish, `JSON.parse` (có `try`) khi nhận |
| **Fire-and-forget**: không lưu, không gửi lại | Node đang khởi động lại hay mất kết nối Redis thì **mất** tin của khoảng đó. Cần lịch sử → lưu DB; cần giao chắc chắn → Redis Streams/Kafka |
| `PUBLISH` trả số **kết nối** đang nghe | `0` nghĩa là không node nào nghe — tin mất luôn |

Bản **trong bộ nhớ** giữ đúng các đặc điểm đó (chuỗi, bất đồng bộ, trả số subscriber) để test chạy offline mà vẫn bắt được lỗi giống khi chạy Redis.

### Sticky session và Socket.IO adapter

| Câu hỏi | `ws` thuần (bài này) | Socket.IO |
|---|---|---|
| Có cần sticky session (load balancer gửi cùng client về cùng instance)? | Không: một kết nối WebSocket nằm trên một TCP, tự dính vào một instance | **Có**, nếu bật long-polling: các request polling của cùng một phiên phải về cùng instance (vd. nginx `ip_hash`). Chỉ dùng `transports: ['websocket']` thì không cần |
| Đồng bộ tin giữa instance | Tự làm: broker + chat node (bài này) | Adapter: `io.adapter(createAdapter(pubClient, subClient))` từ gói `@socket.io/redis-adapter` — `io.to(room).emit` tự đi qua Redis |
| Đếm "ai đang online" toàn hệ thống | Tự làm (mỗi node chỉ biết client của nó; cần lưu chung, vd. Redis SET có hạn dùng) | `io.fetchSockets()` hỏi qua adapter, chậm hơn gọi local |

> 🎯 **Phỏng vấn hay hỏi:** "Chạy 2 instance chat sau load balancer thì sao?" — mỗi instance chỉ có kết nối của nó nên broadcast local không tới người ở instance kia; dùng pub/sub (Redis) làm kênh chung: instance nhận tin publish, mọi instance subscribe và giao cho client local. Redis pub/sub không lưu tin; Socket.IO giải bằng redis-adapter và cần sticky session nếu dùng long-polling.

## 🛠️ Làm

### Bước 1 — Chuẩn bị

```bash
cd academy/courses/node-realtime/workspace/N08-scale-redis-pubsub
npm test    # 8 fail vì TODO — bình thường; test KHÔNG cần Redis
```

Chạy riêng test của hàm đang làm — cờ `--test-name-pattern` (biểu thức chính quy so với tên test) phải đứng **trước** đường dẫn file; `npm test -- --test-name-pattern=...` không lọc được vì npm nối cờ vào sau đường dẫn. Dùng y hệt trên PowerShell:

```bash
node --test --test-name-pattern="createMemoryBroker" "../../curriculum/N08-scale-redis-pubsub/tests/*.test.js"
```

### Bước 2 — Đồng bộ hay bất đồng bộ → `createMemoryBroker`

`EventEmitter` (N02) đã là pub/sub trong một tiến trình: tên sự kiện = tên kênh. Nhưng `emit` gọi listener **ngay lập tức**, trước khi `emit` trả về — khác với tin đi qua mạng:

```js
import { EventEmitter } from 'node:events';

const shop = new EventEmitter();
shop.on('order', (o) => console.log('  listener: nhận đơn', o));

console.log('1. trước emit');
shop.emit('order', 'A01');                      // gọi listener NGAY, trước khi emit trả về
console.log('2. sau emit');

setImmediate(() => shop.emit('order', 'A02'));  // để dành tới vòng event loop sau
console.log('3. sau setImmediate (đơn A02 chưa tới)');
```
```output
1. trước emit
  listener: nhận đơn A01
2. sau emit
3. sau setImmediate (đơn A02 chưa tới)
  listener: nhận đơn A02
```

Vì sao quan trọng: code chạy đúng với broker đồng bộ có thể sai với Redis (vd. đọc `stats` ngay sau `publish` và mong đã giao xong). Broker trong bộ nhớ giao tin **bất đồng bộ** để lộ lỗi đó ngay khi test.

Một pub/sub tí hon cùng khuôn — bảng tin toà nhà, mỗi tầng một kênh:

**Cách 1 — `Map` từ kênh → `Set` các hàm nhận, vòng `for...of` khi publish**

```js
// Bảng tin toà nhà: mỗi tầng là một kênh; ai đăng ký tầng nào thì nhận thông báo của tầng đó.
const channels = new Map();                  // tên kênh → Set các hàm nhận tin

function subscribe(channel, handler) {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(handler);
  return () => channels.get(channel).delete(handler);   // hàm huỷ đăng ký
}

function publish(channel, message) {
  const handlers = channels.get(channel);
  if (!handlers) return 0;                   // không ai nghe → tin mất
  for (const h of handlers) h(message);
  return handlers.size;
}

const offLan = subscribe('tang-3', (m) => console.log('  Lan (tầng 3) nhận:', m));
subscribe('tang-3', (m) => console.log('  Minh (tầng 3) nhận:', m));
subscribe('tang-5', (m) => console.log('  Hoa (tầng 5) nhận:', m));
console.log('publish trả', publish('tang-3', 'cắt nước 14h'));
offLan();
console.log('publish trả', publish('tang-3', 'có nước lại'));
console.log('publish trả', publish('tang-9', 'không ai nghe'));
```
```output
  Lan (tầng 3) nhận: cắt nước 14h
  Minh (tầng 3) nhận: cắt nước 14h
publish trả 2
  Minh (tầng 3) nhận: có nước lại
publish trả 1
publish trả 0
```

**Cách 2 — `EventEmitter` (tên sự kiện = tên kênh)**

```js
import { EventEmitter } from 'node:events';

const board = new EventEmitter();            // tên sự kiện = tên kênh
const lan = (m) => console.log('  Lan (tầng 3) nhận:', m);
board.on('tang-3', lan);
board.on('tang-3', (m) => console.log('  Minh (tầng 3) nhận:', m));
board.on('tang-5', (m) => console.log('  Hoa (tầng 5) nhận:', m));

function publish(channel, message) {
  const count = board.listenerCount(channel);
  board.emit(channel, message);
  return count;
}
console.log('publish trả', publish('tang-3', 'cắt nước 14h'));
board.off('tang-3', lan);
console.log('publish trả', publish('tang-3', 'có nước lại'));
console.log('publish trả', publish('tang-9', 'không ai nghe'));
```
```output
  Lan (tầng 3) nhận: cắt nước 14h
  Minh (tầng 3) nhận: cắt nước 14h
publish trả 2
  Minh (tầng 3) nhận: có nước lại
publish trả 1
publish trả 0
```

> ⚖️ **So sánh:** cùng O(số người nghe) mỗi lần publish, cùng kết quả. Cách 1 cho thấy pub/sub chỉ là "một `Map` + một vòng lặp"; Cách 2 dùng `EventEmitter` có sẵn (`listenerCount`, `on`, `off`) nên ngắn hơn và là thứ bài này dùng. Cả hai đều giao tin **đồng bộ** (in "nhận" trước "publish trả") — `createMemoryBroker` phải thêm `setImmediate` như bảng dưới. Cách 1 dùng `Set` nên đăng ký cùng một hàm hai lần chỉ tính một; Cách 2 tính hai — lý do của ⚠️ dưới bảng.

| Phần | Gợi ý |
|---|---|
| `publish` | Kiểm tra `typeof message === 'string'` (sai → `throw new TypeError(...)` trong hàm `async` = Promise reject); đếm `emitter.listenerCount(channel)`; phát bằng `setImmediate` |
| `subscribe` | Bọc `handler` trong một listener **mới**, `on(channel, listener)`, trả `async () => off(channel, listener)` |

> ⚠️ **Lỗi hay gặp:** `subscribe` hai lần cùng một hàm `handler` rồi `off(channel, handler)` — `off` chỉ gỡ **một** bản. Bọc mỗi lần subscribe trong một listener riêng thì unsubscribe gỡ đúng lần subscribe đó.

> 💡 **Mẹo:** EventEmitter cảnh báo `MaxListenersExceededWarning` khi một sự kiện có hơn 10 listener. Broker có thể có nhiều subscriber hợp lệ: `emitter.setMaxListeners(0)` tắt giới hạn.

```bash
node --test --test-name-pattern="createMemoryBroker" "../../curriculum/N08-scale-redis-pubsub/tests/*.test.js"
```

### Bước 3 — Bọc client Redis → `createRedisBroker`

Interface y hệt bản bộ nhớ, chỉ khác bên trong: `publish` → `pub.publish(channel, message)`; `subscribe` → `sub.subscribe(channel, listener)` với `listener(message, channel)`, unsubscribe → `sub.unsubscribe(channel, listener)`. Test dùng client Redis **giả**: `sub.publish` ném đúng lỗi subscriber mode như Redis thật — dùng nhầm kết nối là fail ngay.

Đây là lợi ích của interface: `createChatNode` không biết (và không cần biết) broker là bộ nhớ hay Redis. Test chạy với bộ nhớ, production chạy với Redis, cùng một code.

```bash
node --test --test-name-pattern="createRedisBroker" "../../curriculum/N08-scale-redis-pubsub/tests/*.test.js"
```

### Bước 4 — Mọi tin qua broker → `createChatNode`

Làm từng phần 4a → 4d theo khung chú thích trong starter. Cấu trúc giống `createChatServer` ở N04 — khác duy nhất: tin hợp lệ **không** gửi thẳng cho client mà đi vòng qua broker.

| Sự kiện | Việc |
|---|---|
| Kết nối `/ws?name=...` | Tên rỗng → `ws.close(1008)` |
| Tin từ client | Kiểm tra `{type: 'chat', text}`; sai → `bad_message`; đúng → `stats.published++`, publish JSON `{origin, from, text, ts}` |
| Tin từ broker | `stats.received++`; `JSON.parse` trong `try` (hỏng → bỏ qua); gửi `{type: 'chat', ..., via: nodeId}` cho mọi client OPEN, mỗi lần gửi `stats.sent++` |
| `server.on('close')` | Gọi hàm unsubscribe |

`createChatNode` là `async` vì phải chờ `subscribe` xong (với Redis là một lệnh mạng) trước khi nhận kết nối — nếu không, tin đến trong khoảng đó bị mất.

#### Bước 4a — Server, `/ws?name=`, tên rỗng → 1008

`http.createServer` trả 404; `new WebSocketServer({ server, path: '/ws' })`; `server.stats = { published: 0, received: 0, sent: 0 }`. Ở `connection`: `new URL(req.url, 'http://x').searchParams.get('name')`, trim, rỗng → `ws.close(1008, ...)` và `return`.

#### Bước 4b — Tin từ client: kiểm tra rồi publish

`JSON.parse` trong `try`; phải là `{type: 'chat', text}` với `text` chuỗi, sau trim dài 1–500; sai → gửi riêng `bad_message`. Đúng → `stats.published += 1`, `await broker.publish(CHANNEL, JSON.stringify({origin: nodeId, from, text, ts}))` — **không** `ws.send` cho ai ở đây.

```bash
node --test --test-name-pattern="tin sai" "../../curriculum/N08-scale-redis-pubsub/tests/*.test.js"
```

#### Bước 4c — Tin từ kênh: giao cho client của node này

`const unsubscribe = await broker.subscribe(CHANNEL, (message) => {...})` — đặt **trước** khi trả `server`. Trong handler: `stats.received += 1`; `JSON.parse` trong `try` (hỏng → `return`, không sập); vòng `for...of` qua `wss.clients`, client `OPEN` thì `send` `{type: 'chat', from, text, ts, origin, via: nodeId}` và `stats.sent += 1`.

> ⚠️ **Lỗi hay gặp:** gửi thẳng cho client local **và** publish → người cùng node nhận 2 lần. Hoặc lọc bỏ tin có `origin === nodeId` khi nhận từ kênh → người cùng node không nhận lần nào. Một đường duy nhất: chỉ publish, mọi node (kể cả node gửi) giao từ kênh.

```bash
node --test --test-name-pattern="thấy tin của nhau|fan-out" "../../curriculum/N08-scale-redis-pubsub/tests/*.test.js"
```

#### Bước 4d — Đóng server thì huỷ đăng ký

`server.on('close', () => { unsubscribe(); })` — không có dòng này, node đã tắt vẫn nhận tin từ kênh (với Redis: rò một listener mỗi lần tạo node trong test).

```bash
node --test --test-name-pattern="tin hỏng trên kênh" "../../curriculum/N08-scale-redis-pubsub/tests/*.test.js"
```

### Bước 5 — Chi phí fan-out

Mỗi tin chat: Redis giao 1 lần **cho mỗi node**, mỗi node `ws.send` cho **mọi client của nó**:

**Cách 1 — vòng lặp `for` nhân đôi số node**

```js
const rate = 50;
const clientsPerNode = 2000;
console.log('node | client | Redis giao/giây | ws.send/giây mỗi node | ws.send/giây tổng');
for (let nodes = 1; nodes <= 8; nodes *= 2) {
  const clients = nodes * clientsPerNode;
  const redisDeliveries = rate * nodes;          // mỗi tin tới mọi node
  const sendsPerNode = rate * clientsPerNode;    // mỗi node gửi mỗi tin cho mọi client của nó
  const sendsTotal = sendsPerNode * nodes;
  console.log(`${String(nodes).padStart(4)} | ${String(clients).padStart(6)} | ${String(redisDeliveries).padStart(15)} | ${String(sendsPerNode).padStart(21)} | ${String(sendsTotal).padStart(17)}`);
}
```
```output
node | client | Redis giao/giây | ws.send/giây mỗi node | ws.send/giây tổng
   1 |   2000 |              50 |                100000 |            100000
   2 |   4000 |             100 |                100000 |            200000
   4 |   8000 |             200 |                100000 |            400000
   8 |  16000 |             400 |                100000 |            800000
```

**Cách 2 — `map` ra mảng object, in bằng `console.table`**

```js
const rate = 50;
const clientsPerNode = 2000;
const rows = [1, 2, 4, 8].map((nodes) => ({
  nodes, clients: nodes * clientsPerNode, redis: rate * nodes, perNode: rate * clientsPerNode, total: rate * clientsPerNode * nodes,
}));
console.table(rows);
```
```output
┌─────────┬───────┬─────────┬───────┬─────────┬────────┐
│ (index) │ nodes │ clients │ redis │ perNode │ total  │
├─────────┼───────┼─────────┼───────┼─────────┼────────┤
│ 0       │ 1     │ 2000    │ 50    │ 100000  │ 100000 │
│ 1       │ 2     │ 4000    │ 100   │ 100000  │ 200000 │
│ 2       │ 4     │ 8000    │ 200   │ 100000  │ 400000 │
│ 3       │ 8     │ 16000   │ 400   │ 100000  │ 800000 │
└─────────┴───────┴─────────┴───────┴─────────┴────────┘
```

> ⚖️ **So sánh:** cùng O(số dòng), chỉ khác cách trình bày; `console.table` tiện khi xem nhanh, Cách 1 kiểm soát được định dạng cột.

Đọc bảng: thêm node giữ **tải mỗi node** không đổi (100.000 `ws.send`/giây) — đó là lý do scale ngang được. Phần Redis rất nhẹ (vài trăm tin/giây). Nhưng đây là **một phòng chung**: thực tế càng đông người càng nhiều tin, nên tổng `ws.send` tăng theo **bình phương** số người. Chia room (N06) để mỗi tin chỉ tới người cần nhận.

### Bước 6 — Chạy thật: một tiến trình, rồi hai tiến trình với Redis

**Phần 1 — không cần Redis.** Ba terminal trong thư mục bài:

```bash
npm start                                         # terminal 1: node A :3008 + node B :3009, CÙNG một tiến trình
npm run cli -- "ws://127.0.0.1:3008/ws?name=An"   # terminal 2: An vào node A
npm run cli -- "ws://127.0.0.1:3009/ws?name=Binh" # terminal 3: Binh vào node B
```

Ở terminal An gõ `{"type":"chat","text":"Build #128 xong"}` rồi Enter. Kết quả thật:

```output
# An (node A, cổng 3008)
01:56:36.704 ✓ đã kết nối ws://127.0.0.1:3008/ws?name=An
01:56:37.268 → {"type":"chat","text":"Build #128 xong"}
01:56:37.270 ← {"type":"chat","from":"An","text":"Build #128 xong","ts":"2026-10-21T01:56:37.269Z","origin":"A","via":"A"}
# Binh (node B, cổng 3009)
01:56:37.270 ← {"type":"chat","from":"An","text":"Build #128 xong","ts":"2026-10-21T01:56:37.269Z","origin":"A","via":"B"}
```

`origin: "A"` (node nhận tin), `via: "B"` (node giao cho Binh): tin đã đi qua broker. Nhưng hai node đang ở **cùng một tiến trình** nên dùng chung **một** broker bộ nhớ — điều này chỉ chứng minh code đúng. Production là các **tiến trình** (thường trên các máy) riêng: broker bộ nhớ của tiến trình này không thấy tiến trình kia. Phần 2 cho thấy điều đó và cách Redis chữa.

**Phần 2 — hai tiến trình, cần Redis.** Bật Redis một lần, chọn cách hợp với máy bạn:

| Máy | Cài và bật Redis | Kiểm tra |
|---|---|---|
| Có Docker (Docker Desktop tải ở `docker.com/products/docker-desktop`; trên Windows/macOS cần quyền admin, Windows cần bật WSL2 — laptop công ty có thể chặn) | `docker run --rm -d --name tp-redis -p 127.0.0.1:6379:6379 redis:7-alpine` | `docker exec tp-redis redis-cli ping` → `PONG` |
| Windows có WSL (Ubuntu), không Docker | Trong terminal WSL: `sudo apt update && sudo apt install -y redis-server`, rồi `redis-server --daemonize yes` | `redis-cli ping` → `PONG`. Node chạy trên Windows vẫn nối được `127.0.0.1:6379` (WSL2 chuyển tiếp localhost) |
| macOS có Homebrew | `brew install redis`, rồi `brew services start redis` | `redis-cli ping` → `PONG` |
| Linux (Ubuntu/Debian) | `sudo apt install -y redis-server` (tự chạy như dịch vụ) | `redis-cli ping` → `PONG` |

Không cài được (máy bị khoá)? Bỏ qua phần 2 — test và phần 1 không cần Redis; đọc kết quả thật bên dưới.

Hai tiến trình node riêng, mỗi terminal **tự đặt** biến môi trường của nó (biến đặt ở terminal này không sang terminal kia):

```bash
# bash (Linux, macOS, WSL, Git Bash)
REDIS_URL=redis://127.0.0.1:6379 NODES=A PORT=3108 npm start      # terminal 1
REDIS_URL=redis://127.0.0.1:6379 NODES=B PORT=3109 npm start      # terminal 2
npm run cli -- "ws://127.0.0.1:3108/ws?name=An"                   # terminal 3
npm run cli -- "ws://127.0.0.1:3109/ws?name=Binh"                 # terminal 4
```

```powershell
# PowerShell (Windows) — $env: giữ tới khi đóng cửa sổ terminal đó
$env:REDIS_URL="redis://127.0.0.1:6379"; $env:NODES="A"; $env:PORT="3108"; npm start   # terminal 1
$env:REDIS_URL="redis://127.0.0.1:6379"; $env:NODES="B"; $env:PORT="3109"; npm start   # terminal 2
```

Thử trước **không** có `REDIS_URL` (bỏ phần `REDIS_URL=...`; PowerShell: `Remove-Item Env:REDIS_URL` hoặc mở terminal mới): mỗi tiến trình một broker bộ nhớ riêng, An gửi một tin. Rồi với Redis. Kết quả thật:

```output
### memory (2 tiến trình, mỗi tiến trình một broker riêng) — Binh không nhận gì
An   (cổng 3108) ← {"type":"chat","from":"An","text":"Build #128 xong","ts":"2026-10-20T08:31:07.105Z","origin":"A","via":"A"}
### redis — cả hai nhận, Binh qua node B
Binh (cổng 3109) ← {"type":"chat","from":"An","text":"Build #128 xong","ts":"2026-10-20T08:31:08.583Z","origin":"A","via":"B"}
An   (cổng 3108) ← {"type":"chat","from":"An","text":"Build #128 xong","ts":"2026-10-20T08:31:08.583Z","origin":"A","via":"A"}

$ redis-cli PUBSUB NUMSUB teampulse:chat
teampulse:chat
2
$ redis-cli SUBSCRIBE teampulse:chat
subscribe
teampulse:chat
1
message
teampulse:chat
{"origin":"A","from":"An","text":"Build #128 xong","ts":"2026-10-20T08:31:19.443Z"}
```

`redis-cli SUBSCRIBE` (chạy `redis-cli ...` nếu cài thẳng, hoặc `docker exec tp-redis redis-cli ...` với Docker) là cách debug nhanh nhất: thấy đúng chuỗi JSON đi qua kênh. Đo fan-out bằng code của bạn (tất cả node và client trong **một** tiến trình):

```output
$ npm run bench
Broker: memory broker (1 tiến trình)
2 node × 5 client, mỗi client gửi 20 tin → 200 tin gửi, mỗi tin tới 10 client
Client nhận 2000/2000 tin trong 0.03 s → 73460 tin/giây
Độ trễ gửi → nhận lại tin của chính mình: trung vị 2.3 ms, tối đa 5.6 ms
stats {"published":100,"received":200,"sent":1000}
stats {"published":100,"received":200,"sent":1000}

$ REDIS_URL=redis://127.0.0.1:6379 npm run bench        # PowerShell: $env:REDIS_URL="redis://127.0.0.1:6379"; npm run bench
Broker: Redis redis://127.0.0.1:6379
2 node × 5 client, mỗi client gửi 20 tin → 200 tin gửi, mỗi tin tới 10 client
Client nhận 2000/2000 tin trong 0.03 s → 72678 tin/giây
Độ trễ gửi → nhận lại tin của chính mình: trung vị 4.3 ms, tối đa 6.2 ms
stats {"published":100,"received":200,"sent":1000}
stats {"published":100,"received":200,"sent":1000}
```

Redis thêm khoảng 2 ms mỗi tin (một vòng qua mạng loopback + Docker). Với `BENCH_NODES=4 BENCH_CLIENTS=25 BENCH_MSGS=10 npm run bench` (PowerShell: `$env:BENCH_NODES=4; $env:BENCH_CLIENTS=25; $env:BENCH_MSGS=10; npm run bench`; 100.000 tin giao), độ trễ trung vị lên ~92 ms (bộ nhớ) và ~115 ms (Redis): lúc này thời gian nằm ở **100.000 lần `ws.send` trong một tiến trình**, không phải ở Redis — đúng như bảng fan-out dự đoán. Xong thì tắt Redis: `docker stop tp-redis` (Docker), `redis-cli shutdown` (WSL/Linux cài thẳng), `brew services stop redis` (macOS).

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc trong thư mục workspace của bài:

```bash
npm test
```

Mục tiêu: `# pass 8`. Test không cần Redis: `createMemoryBroker` kiểm tra hành vi pub/sub, `createRedisBroker` dùng client Redis giả (có lỗi subscriber mode như thật), `createChatNode` chạy 2 node thật dùng chung một broker bộ nhớ và đếm `stats` của fan-out.

## 🎤 Câu hỏi phỏng vấn

> 🎯 **Phỏng vấn hay hỏi:** "Scale server WebSocket ra nhiều instance thế nào?" — kết nối WebSocket có trạng thái, gắn với một instance; cần kênh giữa các instance: mỗi instance publish tin lên Redis, mọi instance subscribe và giao cho client local (một đường duy nhất, kể cả node gửi). Redis cần 2 kết nối (subscriber mode), pub/sub không lưu tin (cần lịch sử thì lưu DB, cần chắc chắn thì Streams). Tải mỗi node giữ nguyên khi thêm node, nhưng tổng fan-out tăng theo số người × số tin — chia room. Socket.IO: redis-adapter, và sticky session nếu dùng long-polling. Test thì thay Redis bằng broker trong bộ nhớ cùng interface.
