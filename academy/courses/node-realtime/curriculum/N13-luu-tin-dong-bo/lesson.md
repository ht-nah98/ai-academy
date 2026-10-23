# N13 — Lưu tin nhắn & đồng bộ khi kết nối lại

> Sau N12, tin gửi qua REST đã nằm trong PostgreSQL, nhưng tin chat realtime (WebSocket, N04–N09) vẫn chỉ được chuyển tiếp rồi quên. Bài này nối hai nửa đó vào **một** app TeamPulse: tin WebSocket được lưu vào đúng bảng `messages` của N12 với id do server cấp, gửi lại không sinh tin đôi, người kết nối lại nhận bù đủ tin bị lỡ (không hở, không trùng), và tin POST qua REST của N11 cũng tới WebSocket ngay.

## 🎯 Mục tiêu

Sau buổi này (khoảng 4 giờ với người mới) bạn sẽ:

- Giải thích bằng lời thường ba mức **đảm bảo giao tin**: tối đa một lần, ít nhất một lần, và "hiệu quả đúng một lần".
- Mở rộng schema N12 bằng **một migration mới** (`003_message_sync.sql`), không sửa file cũ, không tạo bảng riêng.
- Lưu tin bằng một câu `INSERT` chống trùng, dựa trên chỉ mục duy nhất `(channel_id, user_id, client_msg_id)`.
- Dùng **id do server cấp** làm thứ tự và làm con trỏ `lastSeenId`.
- **Gửi bù** tin bị lỡ khi client kết nối lại rồi mới chuyển sang tin trực tiếp, và chặn được lỗi **hở** lẫn **trùng** xảy ra đúng lúc chuyển.
- Cho REST (N11) và WebSocket dùng chung một chỗ lưu, một luồng phát tin.
- **Kết quả đo được:** `chat-store.ts` qua **12 test**, `npm run typecheck` sạch; `npm run demo` cho thấy gửi lại không tạo dòng mới và Binh offline nhận bù đúng tin bị lỡ.

> 📖 Từ lạ ở trên (đảm bảo giao tin, ack, migration, chỉ mục duy nhất, gap…) được giải nghĩa ở mục *Hiểu trước khi làm*, ngay đầu phần kiến thức nền. Bài giả định bạn đã làm N10 (TypeScript), N11 (Express + zod), N12 (PostgreSQL, `Db`, migration).

## 📋 Đề bài

**Mở thư mục:** workspace của bài `N13-luu-tin-dong-bo`. Đây là app TeamPulse của N11–N12 cộng thêm phần chat. Đã có sẵn, không cần sửa:

| File | Từ đâu |
|---|---|
| `db.ts`, `migrate.ts`, `types.ts`, `store.ts`, `migrations/001_init.sql`, `002_channel_topic.sql` | N12, nguyên vẹn (lời giải N12) |
| `app.ts` | App REST của N11, chỉ đổi chỗ import `ChatStore` sang `types.ts` (như N12) |
| `migrations/003_message_sync.sql` | **Mới** — thêm cột chống trùng cho bảng `messages` của N12 |
| `server.ts`, `migrate-cli.ts`, `client.ts`, `demo.ts` | `npm start`, `npm run migrate`, `npm run client`, `npm run demo` |

> ⚠️ Các file N11/N12 ở đây là lời giải của hai bài đó. Làm xong N11, N12 trước khi mở bài này.

| Viết (trong `chat-store.ts`) | Làm gì |
|---|---|
| `saveMessage(db, {channelId, author, clientMsgId, text})` | Lưu tin; gửi lại cùng `clientMsgId` → `{message: tin cũ, duplicate: true}` |
| `messagesAfter(db, channelId, afterId, limit)` | Tin của kênh có `id > afterId`, id tăng dần |
| `attachChat(wss, db)` | WebSocket: `hello` → gửi bù → `synced`; `chat` → lưu → `ack` → phát cho kênh |
| `withBroadcast(store, hub)` | Bọc `ChatStore`: tin POST qua REST cũng được phát cho WebSocket |

**Xong khi:** `# pass 12`, `npm run typecheck` không báo lỗi, và `npm run demo` in đúng các dòng ở Bước 7.

## 🤔 Tại sao? (kiến thức nền)

### Hiểu trước khi làm

**Bối cảnh.** Server chat ở N04–N09 chuyển tin từ người này sang người kia rồi quên. Tải lại trang thì màn hình trống. Tắt laptop đi họp 30 phút thì mất hẳn mọi tin trong lúc đó. Mạng chập chờn còn gây lỗi ngược lại: điện thoại gửi lại một tin vì không chắc server đã nhận, và cả nhóm thấy tin đó hai lần.

**Ví dụ đời thường.** Quầy lấy số ở ngân hàng, nhưng cho tin nhắn. Mỗi tin vào sổ được đóng **số thứ tự** 1, 2, 3… do quầy cấp. Người gửi viết lên phiếu một **mã phiếu** riêng; nộp lại cùng phiếu thì thủ quỹ tra mã, thấy đã ghi rồi, đưa lại biên nhận cũ, không ghi lần hai. Bạn đi vắng về, nói "tôi đọc tới số 41" — thủ quỹ đọc cho bạn từ số 42 trở đi, rồi bạn ngồi nghe tiếp tin mới. Và chỉ có **một** quyển sổ: tin nộp ở quầy (REST) hay gọi điện báo (WebSocket) đều ghi vào đó.

**Bạn đã gặp nó ở đâu.**
- Zalo, Messenger: mở máy sau một đêm, tin bị lỡ hiện đủ, đúng thứ tự.
- Telegram: mất sóng trong thang máy, tin hiện đồng hồ, có sóng thì gửi tiếp, người nhận không thấy hai lần.
- Ngân hàng điện tử: bấm "Chuyển tiền" hai lần do mạng chậm mà chỉ bị trừ tiền một lần.
- Slack: gửi tin từ app điện thoại hay từ một bot qua API, người đang mở máy tính đều thấy ngay.

| Câu hỏi | Trả lời |
|---|---|
| **What** — là gì | Lưu mỗi tin chat thành một dòng trong bảng `messages` của N12, id tăng dần do server cấp; client gửi kèm mã riêng để chống trùng; khi kết nối lại thì báo "đã thấy tới id X" để nhận bù. |
| **Why** — vì sao cần | Không lưu thì tải lại trang mất lịch sử và người offline lỡ tin; không chống trùng thì gửi lại sau mạng chập chờn sinh tin đôi. |
| **When** — khi nào dùng | Mọi tin cần còn lại sau khi gửi: chat, thông báo, lệnh đặt hàng, sự kiện cần xử lý. |
| **When not** — khi nào không | Dữ liệu chỉ có giá trị tức thời: "đang gõ…", vị trí con trỏ chuột, ai đang online. |
| **Where** — ở đâu | Trong server WebSocket: lưu **trước** khi phát; khi client gửi `hello` thì đọc bù từ bảng `messages`; route REST của N11 ghi vào cùng bảng và phát qua cùng đường. |
| **How** — chạy thế nào | `chat` → lưu (chống trùng) → `ack` có id → phát `message`; `hello{lastSeenId}` → đọc tin `id > lastSeenId` tăng dần → gửi bù → `synced` → tin trực tiếp. |

```mermaid
sequenceDiagram
    participant A as An
    participant S as Server
    participant D as PostgreSQL
    participant B as Binh (vừa kết nối lại)
    A->>S: chat, clientMsgId an-7, text
    S->>D: lưu, chống trùng theo an-7
    D-->>S: id 42
    S-->>A: ack id 42
    S-->>B: message id 42 (nếu Binh đang online)
    B->>S: hello, lastSeenId 40
    S->>D: tin có id lớn hơn 40, tăng dần
    D-->>S: tin 41, 42
    S-->>B: message 41, message 42, rồi synced
```

**Từ mới trong bài** (đã gặp: idempotent ở N06; migration, `ON CONFLICT`, `RETURNING`, PGlite ở N12; con trỏ phân trang ở N11)

| Từ | Nghĩa đời thường |
|---|---|
| **Ack** (acknowledgement) | Biên nhận "tôi đã nhận và ghi rồi", kèm id server cấp |
| **Đảm bảo giao tin** (delivery guarantee) | Lời hứa của hệ thống: một tin có thể tới 0, 1 hay nhiều lần |
| **At-most-once** · **at-least-once** | Tối đa một lần (có thể mất) · ít nhất một lần (có thể trùng) |
| **Exactly-once effect** | "Hiệu quả đúng một lần": tin có thể tới nhiều lần nhưng chỉ được **làm** một lần |
| **Khóa chống trùng** (idempotency key) | Mã riêng client gắn vào yêu cầu để server nhận ra yêu cầu lặp |
| **`clientMsgId`** · **UUID** | Khóa chống trùng của một tin, client tạo trước lần gửi đầu · chuỗi ngẫu nhiên 128 bit gần như không bao giờ trùng (`crypto.randomUUID()`) |
| **Chỉ mục duy nhất** (`UNIQUE INDEX`) | Luật của bảng: không cho hai dòng cùng giá trị ở các cột này |
| **Identity** · **sequence** | Cột id Postgres tự điền 1, 2, 3… (`GENERATED ALWAYS AS IDENTITY` ở N12) · bộ đếm cấp số đó |
| **Commit** | Thời điểm thay đổi được ghi chắc, người khác bắt đầu đọc thấy |
| **`lastSeenId`** | Id tin cuối cùng client đã nhận — "tôi đọc tới số mấy" |
| **Gửi bù** (catch-up) · **`synced`** | Gửi lại các tin bị lỡ · tin báo "đã bù xong, từ giờ là trực tiếp" |
| **Hub** (`ChatHub`) | Chỗ giữ danh sách kết nối theo kênh; `hub.broadcast(tin)` gửi tin cho mọi kết nối của kênh đó |
| **Hở** (gap) · **trùng** (duplicate) | Lỡ mất một tin ở giữa · nhận một tin hai lần |
| **Tranh chấp** (race condition) | Kết quả đúng hay sai tùy việc nào xong trước, chỉ cách nhau vài phần nghìn giây |
| **Bọc** (wrapper, decorator) | Object mới cùng "hình dạng" với object cũ, chuyển việc cho object cũ và làm thêm một việc |

### Nối tiếp N12: thêm một migration, không bảng mới

Bài này dùng **đúng** bảng `users`, `channels`, `messages` của `001_init.sql` (N12). Thứ còn thiếu cho chat realtime chỉ là chỗ ghi mã chống trùng. Quy tắc của N12 ("migration đã chạy thì không sửa nữa") nên thêm file thứ ba:

| `migrations/003_message_sync.sql` | Vì sao |
|---|---|
| Cột `messages.client_msg_id text` (cho phép `NULL`) | Mã chống trùng do client tạo. Tin gửi qua REST của N11 không có mã → `NULL` |
| `UNIQUE (channel_id, user_id, client_msg_id)` | Cùng một người, cùng kênh, cùng mã → chỉ một dòng. Hai người tình cờ trùng mã vẫn là hai tin khác. Postgres coi các `NULL` là khác nhau, nên tin REST không bao giờ vướng luật này |
| **Không** thêm cột thứ tự | `messages.id` (identity của N12) đã do server cấp, tăng dần — chính là thứ tự và là `lastSeenId`. Giữ kiểu `integer` của N12: `pg` trả nó là number (kiểu `bigint` thì `pg` trả chuỗi, xem N12) |
| Đọc bù "tin của kênh sau id X" | Dùng lại chỉ mục `(channel_id, id DESC)` của 001 — Postgres đọc chỉ mục theo chiều nào cũng được |

Vì sao **server** cấp id, không để client gửi số thứ tự hay giờ? Đồng hồ mỗi điện thoại một khác, và hai người gửi cùng lúc không tự thống nhất được ai trước. Chỉ một chỗ đếm — database — thì thứ tự là một. `created_at` chỉ để hiển thị, không dùng để sắp xếp.

**Cùng một database qua các bài.** `migrate` ghi tên file đã áp vào `schema_migrations`, nên database nào đã chạy 001 + 002 ở N12 thì ở bài này chỉ áp thêm 003, dữ liệu cũ còn nguyên:

| Bạn chạy N12 với | Ở N13 | Kết quả `npm run migrate` |
|---|---|---|
| PGlite (không đặt `DATABASE_URL`) | Workspace N13 có thư mục `.pgdata/` **riêng** | `PGlite ./.pgdata: đã áp 001_init.sql, 002_channel_topic.sql, 003_message_sync.sql` |
| Postgres thật (`DATABASE_URL` còn đặt từ N12) | **Cùng** database `teampulse` | `PostgreSQL 127.0.0.1:5432: đã áp 003_message_sync.sql` — kênh, tin của N12 vẫn còn |

Cả hai đều đúng. Muốn chuyển từ Postgres thật về PGlite thì bỏ biến: bash `unset DATABASE_URL`, PowerShell `Remove-Item Env:DATABASE_URL`. Ở N14 sẽ có thêm `004_auth.sql` theo đúng cách này.

### Ba mức đảm bảo giao tin

Mạng có thể làm rơi **tin** hoặc rơi **biên nhận**. Người gửi chỉ thấy "không nhận được ack", không biết là tin rơi hay ack rơi. Từ đó có ba lựa chọn:

| Mức | Người gửi làm gì | Hậu quả | Gặp ở đâu |
|---|---|---|---|
| **At-most-once** — tối đa một lần | Gửi một lần, không gửi lại | Có thể **mất** tin, không bao giờ trùng | Chat ở N04 (không lưu, không ack); số liệu đo nhiệt độ mỗi giây |
| **At-least-once** — ít nhất một lần | Gửi lại tới khi có ack | Không mất, nhưng có thể **trùng** (tin tới nơi, ack rơi, gửi lại) | Hàng đợi tin (RabbitMQ, SQS), ack của Socket.IO ở N06 |
| **Exactly-once effect** — hiệu quả đúng một lần | At-least-once **+** bên nhận chống trùng bằng khóa | Không mất, không làm hai lần | Chuyển tiền, đặt hàng, bài này |

"Giao đúng một lần" theo nghĩa đen là không làm được qua mạng không tin cậy; thứ làm được là **gửi nhiều lần, làm một lần**. Ví dụ đơn cà phê, lần gửi thứ hai tới nơi nhưng ack rơi nên người gửi gửi lại:

**Cách 1 — vòng lặp for, tự dò trong mảng**

```ts
const attempts = [
  { orderId: 'cafe-1', ackLost: false },
  { orderId: 'cafe-2', ackLost: true },  // tới nơi, mất ack
  { orderId: 'cafe-2', ackLost: false }, // gửi lại
  { orderId: 'cafe-3', ackLost: false },
];

// Bên nhận không nhớ gì → làm mọi thứ nhận được
const madeA: string[] = [];
for (const a of attempts) {
  madeA.push(a.orderId);
}
console.log('Không chống trùng:', madeA);

// Bên nhận nhớ mã đã làm
const doneList: string[] = [];
for (const a of attempts) {
  let seen = false;
  for (const id of doneList) {
    if (id === a.orderId) {
      seen = true;
      break;
    }
  }
  if (seen) continue; // trùng → chỉ trả ack lại, không làm lần hai
  doneList.push(a.orderId);
}
console.log('Cách 1 (mảng)    :', doneList);
```

**Cách 2 — `Set`**

```ts
const doneSet = new Set<string>();
for (const a of attempts) {
  if (doneSet.has(a.orderId)) continue;
  doneSet.add(a.orderId);
}
console.log('Cách 2 (Set)     :', [...doneSet]);
```
```output
Không chống trùng: [ 'cafe-1', 'cafe-2', 'cafe-2', 'cafe-3' ]
Cách 1 (mảng)    : [ 'cafe-1', 'cafe-2', 'cafe-3' ]
Cách 2 (Set)     : [ 'cafe-1', 'cafe-2', 'cafe-3' ]
```

> ⚖️ **So sánh:** Cách 1 dò cả mảng cho mỗi đơn → O(n) mỗi lần, O(n²) cho n đơn. `Set.has` là O(1) → O(n) tổng. Cả hai chỉ nhớ **trong bộ nhớ**: server khởi động lại là quên, và hai server không thấy `Set` của nhau. Vì vậy bài này để **database** nhớ, bằng chỉ mục duy nhất — cùng ý tưởng `Set.has`, nhưng bền và dùng chung.

### Lưu một tin, chống trùng trong một câu SQL

Ví dụ cùng kỹ thuật trên miền khác — máy quét kiện hàng gửi lại lần quét khi mạng lỗi:

```ts
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.query(`CREATE TABLE scans (
  id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scan_id text NOT NULL UNIQUE,
  parcel  text NOT NULL
)`);
const sql = `INSERT INTO scans (scan_id, parcel) VALUES ($1, $2)
             ON CONFLICT (scan_id) DO NOTHING
             RETURNING id`;
for (const [scanId, parcel] of [['s-1', 'Hộp A'], ['s-2', 'Hộp B'], ['s-2', 'Hộp B'], ['s-3', 'Hộp C']]) {
  const r = await db.query<{ id: number }>(sql, [scanId, parcel]);
  console.log(scanId, '→ RETURNING', JSON.stringify(r.rows));
}
const all = await db.query<{ id: number; scan_id: string }>('SELECT id, scan_id FROM scans ORDER BY id');
console.log('Bảng:', all.rows.map((r) => `${r.id}:${r.scan_id}`).join('  '));
await db.close();
```
```output
s-1 → RETURNING [{"id":1}]
s-2 → RETURNING [{"id":2}]
s-2 → RETURNING []
s-3 → RETURNING [{"id":4}]
Bảng: 1:s-1  2:s-2  4:s-3
```

Ba điều đọc được từ output:

1. Lần quét lặp `s-2` không lỗi, không thêm dòng; `RETURNING` trả **mảng rỗng** → đó là tín hiệu "đã có rồi". Muốn trả lại biên nhận cũ thì đọc lại dòng đó.
2. Một câu SQL làm cả "kiểm tra đã có chưa" lẫn "ghi". Viết thành hai câu (`SELECT` trước, thấy chưa có thì `INSERT`) bị tranh chấp: hai lần gửi lại tới **cùng lúc**, cả hai `SELECT` đều thấy "chưa có", cả hai cùng `INSERT`. Chỉ mục duy nhất là thứ chặn chắc; `ON CONFLICT` biến lỗi vi phạm thành "bỏ qua".
3. Id nhảy từ 2 sang **4**: lần ghi bị bỏ qua vẫn tiêu một số của sequence. Id **tăng dần nhưng có lỗ** — đừng bao giờ suy "tin sau tin 2 là tin 3".

Ở bảng `messages`, khác với `scans` ở hai chỗ: chỉ mục duy nhất gồm **ba** cột (xem 003), và tên người gửi nằm ở bảng `users` — `addMessage` của N12 (`store.ts`) đã cho thấy cách tạo hoặc dùng lại người gửi theo tên.

> ⚠️ **Lỗi hay gặp:** phát tin cho cả kênh **trước** khi lưu xong. Nếu lưu lỗi (mất kết nối DB, vi phạm ràng buộc), người khác đã thấy một tin không hề được lưu — tải lại trang là tin biến mất, và tin đó không có id để làm `lastSeenId`. Thứ tự đúng: lưu xong (đã commit) → ack → phát.

> ⚠️ **Thứ tự id khi có nhiều kết nối ghi song song.** Id được cấp lúc `INSERT` bắt đầu, nhưng hai giao dịch có thể commit ngược thứ tự (id 11 commit trước id 10). Người đọc `id > 9` đúng lúc đó thấy 11 mà chưa thấy 10, lấy `lastSeenId = 11` và lỡ mất 10. Test của bài dùng PGlite (một kết nối) nên không gặp; chạy với `DATABASE_URL` (`pg.Pool`, nhiều kết nối) thì **có thể** gặp — chỉ là nằm ngoài phạm vi bài. Cách thường dùng ở production: cấp số thứ tự theo kênh trong cùng giao dịch (`UPDATE channels SET last_seq = last_seq + 1 ... RETURNING last_seq`), hoặc chỉ đọc bù tới mốc "chắc chắn đã commit hết".

### Kết nối lại: gửi bù rồi mới trực tiếp

Client nhớ id của tin cuối cùng đã nhận. Mở lại kết nối, việc đầu tiên là gửi `{type: "hello", channelId, user, lastSeenId}`. Server làm ba việc theo thứ tự: gửi bù mọi tin `id > lastSeenId` (tăng dần) → gửi `{type: "synced", lastId}` → từ đó gửi tin trực tiếp. Bù có thể là hàng nghìn tin, nên đọc theo trang (100 tin một lần) tới khi một trang trả ít hơn 100 dòng.

Chỗ khó nằm ở **lúc chuyển** từ "đọc bù" sang "nhận trực tiếp". Đọc bù là một câu `SELECT` mất vài mili giây; trong lúc đó người khác vẫn đang gửi tin. Hai cách viết ngây thơ đều sai:

| Cách viết | Tin mới `#43` được lưu trong lúc `SELECT` bù đang chạy | Hậu quả |
|---|---|---|
| Đọc bù xong **rồi mới** đưa kết nối vào kênh | `SELECT` đã chụp xong dữ liệu trước khi có `#43`; lúc `#43` được phát, kết nối chưa ở trong kênh | **Hở**: `#43` không bao giờ tới |
| Đưa vào kênh **trước**, tin trực tiếp gửi ngay | `#43` tới client **trước** các tin bù `#41`, `#42`; nếu `SELECT` chạy sau khi `#43` commit thì `#43` còn tới **hai lần** | **Sai thứ tự**, **trùng** |

Cách đúng — vào kênh ngay, nhưng **xếp hàng** tin trực tiếp cho tới khi bù xong:

```mermaid
sequenceDiagram
    participant B as Binh
    participant S as Server
    participant D as PostgreSQL
    participant A as An
    B->>S: hello, lastSeenId 40
    Note over S: Binh vào kênh, trạng thái ĐANG ĐỒNG BỘ, hàng đợi rỗng
    S->>D: SELECT id lớn hơn 40
    A->>S: chat
    S->>D: INSERT, được id 43
    Note over S: Phát 43, Binh đang đồng bộ nên 43 vào hàng đợi
    D-->>S: 41, 42
    S-->>B: 41, 42
    Note over S: Xả hàng đợi, bỏ tin có id nhỏ hơn hoặc bằng id đã gửi
    S-->>B: 43, rồi synced
    Note over S: Binh chuyển sang TRỰC TIẾP
```

Quy tắc "bỏ tin có id ≤ id cuối đã gửi" xử lý luôn trường hợp `SELECT` chạy **sau** khi `#43` commit: `#43` có trong kết quả bù **và** trong hàng đợi, nhưng chỉ được gửi một lần. Vì id tăng dần, so một số là đủ — không cần `Set` các id đã gửi.

> 🧠 **Ghi nhớ:** client cũng phải tự chống trùng theo `id` (vd. khi kết nối lại giữa lúc đang nhận bù). Server làm đúng phần của mình; client vẫn bỏ qua tin có `id` đã hiển thị. Hai lớp phòng thủ, mỗi lớp rẻ.

### Một chỗ lưu cho cả REST và WebSocket

App REST của N11 nhận một `ChatStore` và không biết gì về WebSocket. Muốn tin POST qua REST cũng tới người đang mở WebSocket mà **không sửa** `app.ts`, ta **bọc** store: object mới cùng interface, chuyển mọi việc cho store thật, riêng `addMessage` làm thêm một việc sau khi lưu xong. Ví dụ miền khác — kệ sách có bảng tin:

```ts
interface Shelf {
  count(): number;
  add(title: string): string;
}

function createShelf(): Shelf {
  const books: string[] = [];
  return {
    count: () => books.length,
    add(title) {
      books.push(title);
      return `#${books.length} ${title}`;
    },
  };
}

// Bọc: cùng interface, thêm một việc SAU khi add xong — code dùng Shelf không phải sửa
function withNotice(shelf: Shelf, notify: (text: string) => void): Shelf {
  return {
    count: () => shelf.count(),
    add(title) {
      const saved = shelf.add(title);
      notify(`Sách mới: ${saved}`);
      return saved;
    },
  };
}

const shelf = withNotice(createShelf(), (text) => console.log('  [bảng tin]', text));
console.log('add →', shelf.add('Dế Mèn phiêu lưu ký'));
console.log('add →', shelf.add('Số đỏ'));
console.log('count →', shelf.count());
```
```output
  [bảng tin] Sách mới: #1 Dế Mèn phiêu lưu ký
add → #1 Dế Mèn phiêu lưu ký
  [bảng tin] Sách mới: #2 Số đỏ
add → #2 Số đỏ
count → 2
```

`createChatServer` (có sẵn) ghép mọi thứ: một `http.Server`, WebSocket ở `/ws` gắn `attachChat`, và app N11 nhận store đã bọc. REST và WebSocket chung cổng, chung database, chung luồng phát:

```mermaid
flowchart LR
    R[POST /channels/:id/messages] --> AP[app.ts N11] --> WB[withBroadcast] --> PG[(messages)]
    W[WebSocket chat] --> AC[attachChat] --> PG
    WB --> HUB[hub.broadcast]
    AC --> HUB
    HUB --> C[Mọi kết nối trong kênh]
```

Lịch sử khi mở màn hình chat vẫn là `GET /channels/:id/messages?limit=&before=` của N11 (phân trang bằng con trỏ, mới → cũ, `{items, nextBefore}`, lỗi `validation_failed`). Client hiển thị trang đó, lấy id lớn nhất làm `lastSeenId` rồi mở WebSocket.

## 🛠️ Làm

### Bước 1 — Chuẩn bị

```bash
cd academy/courses/node-realtime/workspace/N13-luu-tin-dong-bo
npm run typecheck   # sạch ngay từ đầu — giữ nó sạch sau mỗi bước
npm test            # 12 fail vì TODO — bình thường
```

Chạy riêng test của hàm đang làm (cờ phải đứng **trước** đường dẫn; dùng y hệt trên PowerShell):

```bash
node --test --test-name-pattern="saveMessage" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

`tsconfig.json` của bài bật thêm `noUncheckedIndexedAccess`: `rows[0]` có kiểu `Row | undefined`, nên TypeScript bắt bạn xử lý trường hợp "không có dòng nào" — đúng chỗ `RETURNING` trả mảng rỗng khi trùng.

### Bước 2 — Đọc migration 003, áp vào database

Mở `migrations/003_message_sync.sql`, đối chiếu với bảng ở mục "Nối tiếp N12". Rồi:

```bash
npm run migrate
npm run migrate
```

```output
PGlite ./.pgdata: đã áp 001_init.sql, 002_channel_topic.sql, 003_message_sync.sql
PGlite ./.pgdata: không có migration mới
```

Nếu `DATABASE_URL` còn đặt từ N12, dòng đầu là `PostgreSQL ...: đã áp 003_message_sync.sql` — đúng như thiết kế (xem bảng "Cùng một database qua các bài"). Không cần viết gì ở bước này.

### Bước 3 — Lưu, chống trùng → `saveMessage`

Yêu cầu nằm đủ trong docstring. Những điểm cần đạt:

- Người gửi được tạo hoặc dùng lại trong `users` theo tên.
- Ghi tin bằng **một** câu, để chỉ mục duy nhất của 003 quyết định "đã có chưa" — không `SELECT` kiểm trước.
- Trùng → trả tin **cũ** (lần gửi lại có thể mang text khác, vẫn giữ lần đầu), `duplicate: true`.
- `author` trong kết quả là **tên** người gửi, không phải `user_id`. Đổi dòng qua `rowToChatMessage` (có sẵn); `CHAT_MESSAGE_COLUMNS` là danh sách cột dùng khi đọc kèm `users`.
- Kênh không tồn tại: để lỗi `23503` của Postgres ném ra (đừng bắt).

```bash
node --test --test-name-pattern="saveMessage" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

### Bước 4 — Đọc tin sau một id → `messagesAfter`

Tin của **một** kênh, id lớn hơn `afterId`, thứ tự tăng dần, không quá `limit` dòng, gồm cả tin REST. Thiếu sắp xếp thì Postgres không hứa thứ tự nào. Viết điều kiện id theo dạng `id > $n` (test nhận ra câu đọc bù nhờ dạng đó). Đổi từng dòng bằng vòng `for` (hoặc `.map(rowToChatMessage)` — cùng O(n), chỉ gọn hơn).

```bash
node --test --test-name-pattern="messagesAfter" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

### Bước 5 — WebSocket → `attachChat`

Làm từng phần theo khung chú thích trong starter. `attachChat` nhận một `WebSocketServer` đã tạo sẵn (ở bài này `createChatServer` tạo nó ở `/ws`; N14 sẽ tạo nó sau bước kiểm đăng nhập) và gắn xử lý cho mọi kết nối. Trạng thái của từng kết nối để trên chính object `ws` (kiểu `ChatSocket` có sẵn các trường).

#### Bước 5a — Đọc tin client

JSON hỏng hoặc không khớp `HelloMsg` / `ChatMsg` → `bad_message`. `chat` khi kết nối chưa vào kênh nào → `hello_first`. Lỗi bất ngờ trong lúc xử lý (DB lỗi) → `server_error`, tiến trình không được sập.

```bash
node --test --test-name-pattern="bad_message" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

#### Bước 5b — `chat`: lưu → ack → phát

Kênh và tên người gửi lấy từ kết nối (đã có từ `hello`), không từ tin client. Lưu xong mới gửi ack cho người gửi; không trùng thì phát cho mọi kết nối OPEN cùng kênh, gồm cả người gửi. Trùng → chỉ ack.

```bash
node --test --test-name-pattern="chat → lưu" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

#### Bước 5c — `hello`: gửi bù → `synced`

Tên người gửi: nếu kết nối đã có sẵn `ws.user` thì giữ (N14 gán nó từ phiên đăng nhập), không thì lấy từ `hello`. Kênh không tồn tại → `channel_not_found`. Đọc bù theo trang tới khi hết, rồi `synced` với id tin cuối đã gửi.

```bash
node --test --test-name-pattern="lastSeenId|100 tin|ws.user" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

#### Bước 5d — Không hở, không trùng lúc chuyển

Theo sơ đồ ở trên: kết nối vào kênh ở trạng thái "đang đồng bộ" **trước** khi đọc bù; trong lúc đó tin phát tới đi vào hàng đợi của kết nối. Mọi đường gửi tin đi qua **một** hàm "giao" bỏ tin có id ≤ id đã gửi. Bù xong thì xả hàng đợi theo id tăng dần, tắt trạng thái đồng bộ, rồi `synced`.

Hai test cuối dùng một `Db` bọc ngoài, **giữ** câu đọc bù lại đúng lúc An gửi tin mới — tái hiện tranh chấp vài mili giây một cách chắc chắn, không cần may rủi.

```bash
node --test --test-name-pattern="gap|trùng" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

> ⚠️ **Lỗi hay gặp:** đưa kết nối vào kênh ở **cuối** `hello` (sau khi bù xong) → test "gap" đỏ: tin mới được phát lúc Binh chưa ở trong kênh. Gửi tin trực tiếp ngay trong lúc đang bù → test "trùng" đỏ.

### Bước 6 — REST tới WebSocket → `withBroadcast`

Trả một `ChatStore` mới: bốn hàm đọc/tạo kênh chuyển thẳng cho store gốc; `addMessage` lưu qua store gốc, **xong** rồi mới gọi `hub.broadcast` với tin vừa lưu (thêm `clientMsgId: null`), và trả đúng tin đó. Lưu lỗi thì không phát.

```bash
node --test --test-name-pattern="withBroadcast" "../../curriculum/N13-luu-tin-dong-bo/tests/*.test.js"
```

### Bước 7 — Chạy kịch bản

```bash
npm run demo
```

```output
migrate         → 001_init.sql, 002_channel_topic.sql, 003_message_sync.sql
migrate lần 2   → (không có gì mới)
An hello(0)     → bù: []
An gửi an-1     → ack id=1 duplicate=false
An gửi an-2     → ack id=2 duplicate=false
An gửi an-2     → ack id=2 duplicate=true (gửi lại, không lưu thêm)
Binh hello(1)   → bù: [ '#2 Build #41 xanh' ] (lỡ khi offline)
Binh trực tiếp  ← message #4 An: Ai review PR 7? (clientMsgId an-3)
REST POST       → 201 | Binh ← message #5 Chi: Mình review (clientMsgId null)
REST GET ?limit=2 → [ 5, 4 ] nextBefore = 4 (mới → cũ, như N11)
Bảng messages   → 4 dòng (5 lần gửi, 1 lần trùng)
```

Tin sau `#2` là `#4`: lần gửi trùng đã tiêu số 3 của sequence (đúng như ví dụ quét kiện hàng). Tin `#5` đi vào bằng REST mà Binh vẫn nhận qua WebSocket.

**Chạy server thật.** `npm start` (cổng 3113, PGlite `./.pgdata` hoặc `DATABASE_URL`), rồi ở terminal thứ hai mở client gõ tay — `npm run client -- <tên> <channelId> <lastSeenId>`, dùng y hệt trên PowerShell:

```bash
npm start
```

```output
DB: PGlite ./.pgdata; migration vừa áp: (không có — DB đã đủ)
REST: http://127.0.0.1:3113/channels/1/messages?limit=20
WS:   ws://127.0.0.1:3113/ws — thử: npm run client -- an 1 0
```

```bash
npm run client -- an 1 0
```

Gõ `Xin chào` rồi Enter, sau đó gõ `/lai` (gửi lại đúng tin vừa rồi, cùng `clientMsgId`):

```output
→ hello (an, kênh 1, lastSeenId 0). Gõ tin rồi Enter; /lai = gửi lại; Ctrl+C = thoát
← {"type":"synced","lastId":0}
← {"type":"ack","clientMsgId":"a33a50e0-27fd-4da3-abab-972638c2723d","id":1,"duplicate":false}
← {"type":"message","id":1,"channelId":1,"author":"an","clientMsgId":"a33a50e0-27fd-4da3-abab-972638c2723d","text":"Xin chào","createdAt":"2026-10-23T02:42:16.079Z"}
← {"type":"ack","clientMsgId":"a33a50e0-27fd-4da3-abab-972638c2723d","id":1,"duplicate":true}
```

Tắt server (Ctrl+C), chạy lại `npm start`, rồi `npm run client -- binh 1 0`: Binh nhận bù tin `#1` — dữ liệu còn sau khi khởi động lại. Cổng 3113 bận (`EADDRINUSE`) → bash `PORT=3013 npm start`, PowerShell `$env:PORT=3013; npm start` (client: `PORT=3013 npm run client -- an 1 0` / `$env:PORT=3013; npm run client -- an 1 0`).

**Chạy với PostgreSQL thật (tùy chọn, cần Docker).** Container `tp-postgres` của N12 còn chạy (`docker ps` thấy tên nó) thì dùng luôn: cùng `DATABASE_URL` → cùng database, migrate chỉ áp 003, kênh và tin của N12 vẫn còn và được gửi bù. Đã dừng thì chạy lại đúng lệnh `docker run` của N12 — container đó tạo với `--rm` nên dữ liệu cũ đã mất, migrate sẽ áp lại cả 001→003.

```bash
export DATABASE_URL=postgres://teampulse:teampulse@127.0.0.1:5432/teampulse
npm run migrate
npm start
```

```powershell
$env:DATABASE_URL="postgres://teampulse:teampulse@127.0.0.1:5432/teampulse"
npm run migrate
npm start
```

```output
PostgreSQL 127.0.0.1:5432: đã áp 003_message_sync.sql
DB: PostgreSQL 127.0.0.1:5432; migration vừa áp: (không có — DB đã đủ)
```

Xong thì `docker stop tp-postgres` (container `--rm`: dừng là xoá luôn dữ liệu) và bỏ biến nếu muốn quay về PGlite: bash `unset DATABASE_URL`, PowerShell `Remove-Item Env:DATABASE_URL`.

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc trong thư mục workspace của bài:

```bash
npm test
npm run typecheck
```

Mục tiêu: `# pass 12` và typecheck không in lỗi. Test chạy PostgreSQL thật trong tiến trình (PGlite) với đủ migration 001→003, một database cho cả file, mỗi test dùng kênh riêng.

## 🎤 Câu hỏi phỏng vấn

> 🎯 **Phỏng vấn hay hỏi:** "Làm sao để tin chat không mất, không trùng, đúng thứ tự khi mạng chập chờn?" — Không mất: lưu vào database **trước** khi phát, client gửi lại tới khi có ack (at-least-once). Không trùng: client gắn `clientMsgId` (UUID) cho mỗi tin; database có chỉ mục duy nhất trên (kênh, người gửi, clientMsgId) và server ghi bằng `INSERT ... ON CONFLICT DO NOTHING RETURNING`, trùng thì trả lại ack cũ → hiệu quả đúng một lần (exactly-once effect), vì "giao đúng một lần" theo nghĩa đen là không làm được qua mạng. Đúng thứ tự: id do server cấp, tăng dần (có lỗ), không dựa vào đồng hồ client. Kết nối lại: client gửi `lastSeenId`, server đọc bù `id > lastSeenId` theo trang rồi mới chuyển sang trực tiếp; trong lúc bù, tin trực tiếp vào hàng đợi và mọi tin đi qua bộ lọc `id > lastSentId`, nên không hở, không trùng. Client vẫn tự lọc theo id như lớp thứ hai. Schema thay đổi bằng migration nối tiếp, không sửa file đã chạy.
