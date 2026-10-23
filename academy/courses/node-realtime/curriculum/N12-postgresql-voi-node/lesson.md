# N12 — PostgreSQL với Node

> API của N11 lưu tin trong bộ nhớ: tắt server là mất sạch, và hai instance (N08) mỗi bên một bản riêng. Bài này đưa TeamPulse lên **PostgreSQL**: thiết kế bảng có ràng buộc, quản lý thay đổi schema bằng **migration**, viết truy vấn **có tham số** (và tận mắt thấy SQL injection), gói nhiều câu vào **transaction**. Test chạy Postgres thật bằng **PGlite** ngay trong Node — không cần cài gì.

## 🎯 Mục tiêu

Sau buổi này (khoảng 4,5 giờ với người mới — có thể chia hai buổi: Bước 1–4 rồi Bước 5–7) bạn sẽ:

- Giải thích **khi nào chọn PostgreSQL thay SQLite** cho một server nhiều người dùng.
- Viết schema `users` / `channels` / `messages` với **khóa chính, UNIQUE, CHECK, khóa ngoại, index**, và đọc được mã lỗi Postgres (`23505`, `23503`…).
- Viết **bộ chạy migration**: file `.sql` đánh số, bảng `schema_migrations`, chạy lại bao nhiêu lần cũng an toàn.
- Luôn truyền giá trị qua **tham số `$1, $2`**; thấy tận mắt chuỗi `' OR '1'='1` đăng nhập không cần mật khẩu khi ghép chuỗi.
- Dùng interface **`Db`** để cùng một code chạy trên PGlite (test) và `pg.Pool` (production); viết **transaction** đúng cách, kể cả cái bẫy của pool.
- **Kết quả đo được:** qua hết **8 test** với `npm run typecheck` 0 lỗi; `npm run demo` in đúng các dòng ở Bước 7.

> 📖 Từ lạ ở trên và trong Đề bài (schema, migration, khóa ngoại, index, tham số, SQL injection, transaction, pool, PGlite…) được giải nghĩa ở mục *Hiểu trước khi làm*, ngay đầu phần kiến thức nền.

## 📋 Đề bài

**Mở thư mục:** workspace của bài `N12-postgresql-voi-node`.

| File | Ai viết | Nội dung |
|---|---|---|
| `migrations/001_init.sql` | **Bạn** | Schema 3 bảng + index (yêu cầu ghi sẵn trong chú thích) |
| `migrate.ts` | **Bạn** | `migrate(db, dir)` |
| `store.ts` | **Bạn** | `createPgStore`, `searchMessages`, `withTransaction`, `createChannelWithWelcome` |
| `migrations/002_channel_topic.sql` | Có sẵn | Migration thứ hai mẫu: thêm cột `topic` |
| `db.ts` | Có sẵn | Interface `Db`, `acquire` (mượn một kết nối), `splitStatements`, `openDb` (PGlite hoặc `DATABASE_URL`) |
| `types.ts` | Có sẵn | `ChatStore`, `Channel`, `Message` — giống hệt N11 |
| `demo.ts`, `migrate-cli.ts`, `server.ts` | Có sẵn | `npm run demo`, `npm run migrate`, `npm start` |

| Viết | Làm gì |
|---|---|
| `migrate(db, dir)` | Áp file `.sql` chưa chạy theo thứ tự tên, mỗi file một transaction, ghi `schema_migrations`; trả tên file vừa áp |
| `001_init.sql` | `users`, `channels`, `messages`: khóa chính tự sinh, UNIQUE, CHECK độ dài, khóa ngoại + `ON DELETE CASCADE`, index `(channel_id, id DESC)` |
| `createPgStore(db): ChatStore` | 5 hàm của N11 bằng SQL có tham số; trùng tên kênh → `null`; người gửi tự tạo khi cần |
| `searchMessages(db, channelId, q)` | Tìm không phân biệt hoa thường; `q` không bao giờ thành SQL; `%`, `_` là ký tự thường |
| `withTransaction(db, fn)` | `BEGIN` → `fn(tx)` → `COMMIT`; lỗi → `ROLLBACK` + ném lại; trên **một** kết nối |
| `createChannelWithWelcome(db, {name, owner})` | Kênh + tin chào đầu tiên trong một transaction |

**Xong khi:** `# pass 8`, `npm run typecheck` không lỗi, `npm run demo` in đúng các dòng ở Bước 7.

## 🤔 Tại sao? (kiến thức nền)

### Hiểu trước khi làm

**Bối cảnh.** Một ứng dụng chat phải nhớ ai đã nói gì, ở kênh nào, lúc nào — qua mỗi lần khởi động lại, qua nhiều máy chủ chạy song song, qua nhiều năm. Ghi ra một file thường thì hai người ghi cùng lúc là hỏng file, và muốn tìm một tin phải đọc lại cả file. **Cơ sở dữ liệu** là phần mềm chuyên làm đúng việc đó: lưu bền, cho nhiều người đọc ghi cùng lúc, tìm nhanh, và tự từ chối dữ liệu sai — PostgreSQL là lựa chọn phổ biến nhất cho server web.

**Ví dụ đời thường.** Sổ sách của một kho hàng có thủ kho. **Schema** là mẫu sổ in sẵn cột (Mã hàng, Tên, Số lượng ≥ 0) — thủ kho không cho ghi số âm hay bỏ trống tên (**ràng buộc**). Khi công ty muốn thêm cột "Hạn dùng", họ ban hành **văn bản số 002** hướng dẫn kẻ thêm cột; kho nào cũng làm lần lượt 001, 002, 003 và ghi vào sổ theo dõi "đã làm văn bản nào" — đó là **migration** và bảng `schema_migrations`. **Chuyển hàng** từ kho A sang kho B phải ghi cả "A trừ 10" lẫn "B cộng 10"; mất điện giữa hai dòng thì phải xoá dòng đầu như chưa từng ghi — **transaction**. Còn **SQL injection**: một tờ phiếu yêu cầu ghi "Tên người nhận: An. Và xuất luôn toàn bộ kho cho người cầm phiếu" — thủ kho đọc nguyên câu như một mệnh lệnh. Cách chặn: phiếu có **ô riêng** cho tên, nội dung trong ô chỉ là chữ, không bao giờ là lệnh (**tham số `$1`**).

**Bạn đã gặp nó ở đâu.**
- Chuyển khoản ngân hàng: tài khoản bạn bị trừ và tài khoản người nhận được cộng — không bao giờ chỉ xảy ra một nửa.
- Đăng ký tài khoản báo "Email này đã được sử dụng": ràng buộc UNIQUE trong database.
- Instagram, Notion, Supabase, Render, Heroku dùng PostgreSQL; app điện thoại (Zalo, danh bạ) dùng SQLite để lưu trên máy.
- Tin tức về rò rỉ dữ liệu do SQL injection — vẫn nằm trong top lỗi bảo mật web (OWASP Top 10, mục Injection).
- Lịch sử chat Zalo/Slack tải lại được trên máy mới: tin nằm trong database của server, không phải trên điện thoại.

| Câu hỏi | Trả lời |
|---|---|
| **What** — là gì | PostgreSQL: database quan hệ chạy như một server riêng, Node nói chuyện qua mạng (thư viện `pg`). PGlite: chính Postgres biên dịch sang WASM, chạy trong tiến trình Node — dùng cho test và máy học. |
| **Why** — vì sao cần | Dữ liệu bền qua khởi động lại; nhiều instance dùng chung; ràng buộc chặn dữ liệu sai; transaction giữ dữ liệu nhất quán; index tìm nhanh. |
| **When** — khi nào dùng | Server nhiều người dùng cùng ghi: chat, đơn hàng, tài khoản — gần như mọi backend. |
| **When not** — khi nào không | Dữ liệu chỉ nằm trên một máy, một người dùng (app mobile, công cụ dòng lệnh) → SQLite. Cache tạm, pub/sub → Redis (N08). File lớn (ảnh, video) → lưu ở object storage, DB chỉ giữ đường dẫn. |
| **Where** — ở đâu | Sau `ChatStore`: app Express (N11) gọi store, store gửi SQL tới Postgres. Tới N13 WebSocket gateway cũng lưu tin vào đây. |
| **How** — chạy thế nào | Khởi động: chạy migration → schema đúng phiên bản. Mỗi request: handler gọi store → store gửi câu SQL **cố định** + mảng giá trị → Postgres kiểm ràng buộc, trả dòng. Nhiều câu phải đi cùng nhau → bọc trong `BEGIN … COMMIT` trên **một** kết nối. |

```mermaid
flowchart TD
    S["Khởi động server"] --> MG["migrate(db, 'migrations/')<br/>001_init.sql, 002_... chưa chạy thì chạy"]
    MG --> SM[("schema_migrations<br/>ghi tên file đã chạy")]
    R["Request POST /channels/1/messages"] --> APP["App Express N11<br/>validate bằng zod"]
    APP --> ST["createPgStore(db).addMessage"]
    ST --> Q["SQL cố định + tham số<br/>INSERT ... VALUES ($1, $2, $3)"]
    Q --> PG[("PostgreSQL / PGlite<br/>kiểm UNIQUE, CHECK, khóa ngoại")]
    PG -- "vi phạm" --> E["Lỗi có mã: 23505, 23503, 23514"]
    PG -- "ổn" --> OK["Dòng vừa lưu → JSON 201"]
```

**Từ mới trong bài**

| Từ | Nghĩa đời thường |
|---|---|
| **Database**, **quan hệ** (relational) | Chương trình chuyên lưu và tìm dữ liệu · dữ liệu xếp thành bảng có cột cố định, bảng nối nhau bằng id |
| **PostgreSQL** (Postgres), **SQLite** | Database chạy như server riêng, nhiều kết nối · database là một file, nằm trong chính ứng dụng |
| **PGlite**, **WASM** | Postgres chạy trong tiến trình Node · định dạng chạy được code biên dịch (C) bên trong JS |
| **`pg`**, **Pool**, **client** | Thư viện Node nói chuyện với Postgres · bể nhiều kết nối dùng chung · một kết nối mượn từ bể |
| **Schema**, **bảng**, **cột**, **dòng** | Bản thiết kế các bảng · một loại dữ liệu · một thuộc tính · một bản ghi |
| **Khóa chính** (primary key), **IDENTITY** | Cột định danh duy nhất của dòng · số tự tăng do database cấp |
| **Ràng buộc** (constraint): **NOT NULL**, **UNIQUE**, **CHECK** | Luật database tự kiểm: bắt buộc có · không trùng · điều kiện tuỳ ý (vd. độ dài 1–2000) |
| **Khóa ngoại** (foreign key), **`ON DELETE CASCADE`** | Cột trỏ tới id của bảng khác, không cho trỏ vào thứ không tồn tại · xoá cha thì xoá luôn con |
| **Index** | "Mục lục" giúp tìm theo cột mà không đọc hết bảng |
| **`timestamptz`** | Thời điểm kèm múi giờ (lưu chuẩn UTC) |
| **SQLSTATE** (`err.code`) | Mã lỗi 5 ký tự của Postgres, vd. `23505` trùng UNIQUE |
| **Migration**, **`schema_migrations`** | File SQL đánh số thay đổi schema từng bước · bảng ghi những file đã chạy |
| **Tham số** (parameter) `$1, $2` | Chỗ trống trong câu SQL; giá trị gửi riêng, database coi là dữ liệu, không bao giờ là lệnh |
| **SQL injection** | Dữ liệu người dùng gõ bị ghép vào câu SQL và chạy như lệnh |
| **Transaction**, **`BEGIN` / `COMMIT` / `ROLLBACK`** | Nhóm câu "cùng có hoặc cùng không" · bắt đầu · chốt · huỷ hết |
| **Kết nối** (connection) | Một đường nói chuyện riêng với Postgres; transaction gắn với một kết nối |
| **`RETURNING`** | Cho INSERT/UPDATE trả lại dòng vừa ghi (id, created_at…) |
| **`ON CONFLICT … DO NOTHING` / `DO UPDATE`**, **upsert**, **`EXCLUDED`** | Trùng UNIQUE thì bỏ qua · thì sửa dòng cũ · "chèn, có rồi thì cập nhật" · dòng định chèn mà bị trùng |
| **`LIKE` / `ILIKE`**, **ký tự đại diện** | So khớp mẫu (ILIKE: không phân biệt hoa thường) · `%` = chuỗi bất kỳ, `_` = một ký tự bất kỳ |
| **snake_case** · **camelCase** | `created_at` (quen dùng trong SQL) · `createdAt` (quen dùng trong JS) |
| **`DATABASE_URL`** | Biến môi trường chứa địa chỉ database: `postgres://user:mật-khẩu@host:cổng/tên-db` |
| **`psql`** · **OWASP Top 10** | Chương trình dòng lệnh để gõ SQL trực tiếp vào Postgres · danh sách 10 nhóm lỗi bảo mật web phổ biến nhất |
| **Docker**, **container** | Công cụ chạy phần mềm đóng gói sẵn · một "máy ảo nhẹ" chạy Postgres (phần tuỳ chọn; học kỹ ở N15) |

### PostgreSQL hay SQLite

Bạn đã dùng SQLite ở khóa Python. Cả hai đều là database quan hệ, cùng SQL (gần như). Khác ở **chỗ chạy**:

| | SQLite | PostgreSQL |
|---|---|---|
| Chạy ở đâu | Thư viện trong chính ứng dụng, dữ liệu là **một file** | **Server riêng**, ứng dụng kết nối qua mạng |
| Nhiều tiến trình cùng ghi | Một người ghi tại một thời điểm (khóa cả file) | Nhiều kết nối ghi song song |
| Nhiều instance server (N08) trên nhiều máy | Không dùng chung được một file qua mạng | Mọi instance nối tới cùng một DB |
| Kiểu dữ liệu, ràng buộc | Lỏng: cột `integer` vẫn nhận được chuỗi (trừ bảng STRICT) | Chặt: sai kiểu là lỗi; `timestamptz`, `jsonb`, mảng… |
| Vận hành | Không cần gì | Cần chạy server, sao lưu, nâng cấp (hoặc dùng dịch vụ có sẵn) |
| Hợp với | App mobile, desktop, công cụ, prototype, dữ liệu một máy | Backend web nhiều người dùng |

TeamPulse chạy nhiều instance và nhiều người cùng gửi tin → PostgreSQL.

### PGlite: Postgres thật, không cần cài

```ts
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();                       // Postgres thật, chạy trong tiến trình Node, dữ liệu trong RAM
await db.query(`CREATE TABLE fruits (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  kg numeric(6, 1) NOT NULL CHECK (kg >= 0),
  added_at timestamptz NOT NULL DEFAULT now()
)`);
await db.query('INSERT INTO fruits (name, kg) VALUES ($1, $2), ($3, $4)', ['Táo', 12.5, 'Cam', 8]);

interface FruitRow { id: number; name: string; kg: string; added_at: Date }
const { rows } = await db.query<FruitRow>('SELECT id, name, kg, added_at FROM fruits ORDER BY id');
console.log(rows[0]);

// Đổi dòng DB (snake_case, Date) → object cho API (camelCase, chuỗi ISO)
// Cách 1 — vòng lặp for
const out1 = [];
for (const r of rows) {
  out1.push({ id: r.id, name: r.name, kg: Number(r.kg), addedAt: r.added_at.toISOString().slice(0, 10) });
}
// Cách 2 — map
const out2 = rows.map((r) => ({ id: r.id, name: r.name, kg: Number(r.kg), addedAt: r.added_at.toISOString().slice(0, 10) }));
console.log(out1, JSON.stringify(out1) === JSON.stringify(out2));

const total = await db.query('SELECT count(*) AS n, sum(kg) AS kg FROM fruits');
console.log(total.rows[0]);
await db.close();
```
```output
{ id: 1, name: 'Táo', kg: '12.5', added_at: 2026-10-23T02:05:27.772Z }
[
  { id: 1, name: 'Táo', kg: 12.5, addedAt: '2026-10-23' },
  { id: 2, name: 'Cam', kg: 8, addedAt: '2026-10-23' }
] true
{ n: 2, kg: '20.5' }
```

> ⚖️ **So sánh:** cùng O(n), Cách 2 chỉ gọn hơn. `rows.map(f)` tương đương vòng `for` đẩy `f(r)` vào mảng mới (N01). Store của bài viết sẵn hàm `toChannel`/`toMessage` để dùng với `map`.

Đọc kỹ kiểu các giá trị trả về — đây là chỗ hay sai khi chuyển từ bộ nhớ sang database:

| Kiểu cột Postgres | PGlite trả | `pg` (Postgres thật) trả | Vì sao |
|---|---|---|---|
| `integer` | `number` | `number` | Vừa trong số JS |
| `bigint`, `count(*)` | `number` | **`string`** (`"2"`) | Số 64 bit có thể vượt giới hạn chính xác của số JS; `pg` không đoán |
| `numeric` | `string` (`'12.5'`) | `string` | Số thập phân chính xác (tiền) — đổi sang number là có thể mất chính xác |
| `timestamptz` | `Date` | `Date` | Đổi bằng `.toISOString()` khi trả JSON |

Kết quả thật trên Postgres trong Docker: `SELECT count(*) AS n FROM messages` → `{"n":"2"}`. Vì vậy schema của bài dùng `integer` cho id (đủ 2,1 tỉ tin), và khi đếm thì ép `count(*)::int`.

`await db.close()` — PGlite giữ cả một Postgres trong RAM; không đóng thì tiến trình không thoát. Test của bài tự đóng mọi PGlite trong `after()`.

### Schema và ràng buộc: để database chặn dữ liệu sai

zod ở N11 chặn dữ liệu sai **ở cửa API**. Ràng buộc trong schema là lớp chặn **cuối cùng**, áp cho **mọi** đường ghi vào: API, script nhập dữ liệu, đồng nghiệp gõ tay trong `psql`, code có bug. Postgres trả mã lỗi rõ ràng (ví dụ thư viện sách):

```ts
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  CREATE TABLE shelves (id integer PRIMARY KEY, label text NOT NULL UNIQUE);
  CREATE TABLE books (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shelf_id integer NOT NULL REFERENCES shelves (id),
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100)
  );
  INSERT INTO shelves VALUES (1, 'A1');
`);
const attempts: [string, string, unknown[]][] = [
  ['kệ trùng nhãn', 'INSERT INTO shelves VALUES ($1, $2)', [2, 'A1']],
  ['sách trên kệ không có', 'INSERT INTO books (shelf_id, title) VALUES ($1, $2)', [9, 'Dế Mèn']],
  ['tên sách rỗng', 'INSERT INTO books (shelf_id, title) VALUES ($1, $2)', [1, '']],
  ['thiếu tên sách', 'INSERT INTO books (shelf_id, title) VALUES ($1, $2)', [1, null]],
];
for (const [label, sql, params] of attempts) {
  try {
    await db.query(sql, params);
  } catch (err) {
    const e = err as { code: string; message: string };
    console.log(`${label.padEnd(22)} → ${e.code}  ${e.message}`);
  }
}
await db.close();
```
```output
kệ trùng nhãn          → 23505  duplicate key value violates unique constraint "shelves_label_key"
sách trên kệ không có  → 23503  insert or update on table "books" violates foreign key constraint "books_shelf_id_fkey"
tên sách rỗng          → 23514  new row for relation "books" violates check constraint "books_title_check"
thiếu tên sách         → 23502  null value in column "title" of relation "books" violates not-null constraint
```

`db.exec(...)` chạy nhiều câu một lần (chỉ dùng cho SQL cố định, không có tham số); `db.query(sql, params)` chạy **một** câu có tham số. Code của bạn bắt lỗi theo `err.code`, không theo message (message có thể đổi theo ngôn ngữ, phiên bản):

| Mã | Nghĩa | API thường trả |
|---|---|---|
| `23505` | Trùng UNIQUE | 409 Conflict |
| `23503` | Khóa ngoại trỏ vào thứ không có | 404 hoặc 400 |
| `23514` | Vi phạm CHECK | 400 |
| `23502` | NULL ở cột NOT NULL | 400 |

Index: không có index, "50 tin mới nhất của kênh 3" bắt Postgres đọc **mọi** tin của mọi kênh rồi lọc. Index trên `(channel_id, id DESC)` xếp sẵn tin theo kênh rồi theo id giảm dần — nhảy tới kênh 3, đọc 50 dòng đầu là xong. Chính là truy vấn phân trang cursor của N11 (`WHERE channel_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3`).

### Migration: thay đổi schema có đánh số

Schema không đứng yên: tuần sau thêm cột `topic`, tháng sau thêm bảng phản hồi. Mỗi máy (máy bạn, máy đồng nghiệp, CI, server production) phải đi qua **đúng các bước, đúng thứ tự**. Migration là các file SQL đánh số, cộng một bảng ghi file nào đã chạy. Mỗi lần chạy: đọc thư mục, sắp theo tên, bỏ qua file đã có trong `schema_migrations`, áp từng file còn lại:

| Luật | Vì sao |
|---|---|
| Tên file có số đầu, cùng độ dài (`001_`, `002_`, … `010_`) | Sắp theo tên = sắp theo thứ tự; `10_` sẽ đứng trước `9_` nếu không đệm số 0 |
| Mỗi file chạy trong **một transaction** | File hỏng ở câu thứ 3 thì 2 câu đầu cũng huỷ — không để schema nửa vời |
| Ghi version **trong cùng transaction** | Không bao giờ có "đã chạy mà không ghi" hay "ghi mà chưa chạy" |
| File đã chạy ở đâu đó thì **không sửa nữa** | Máy đã chạy bản cũ sẽ không chạy lại; muốn đổi thì viết file mới |
| Chạy lại bao nhiêu lần cũng an toàn | Server gọi `migrate` mỗi lần khởi động mà không lo |

PGlite (và mọi câu có tham số) chỉ nhận **một câu SQL mỗi lần gọi**, nên `db.ts` có sẵn `splitStatements` tách file theo dấu `;` ở cuối dòng. Ở công ty bạn sẽ gặp công cụ có sẵn (node-pg-migrate, Prisma Migrate, Flyway, Alembic bên Python) — cùng ý tưởng, nhiều tính năng hơn (migration "down" để quay lui, khóa chống hai server chạy migration cùng lúc).

### SQL injection: tận mắt

Đăng nhập thẻ thành viên bằng tên + mã PIN, viết kiểu **ghép chuỗi**:

```ts
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  CREATE TABLE members (name text PRIMARY KEY, pin text NOT NULL, points integer NOT NULL);
  INSERT INTO members VALUES ('lan', '1234', 120), ('minh', '9876', 3400);
`);

// SAI: ghép chữ người dùng gõ vào câu SQL
async function loginUnsafe(name: string, pin: string) {
  const sql = `SELECT name, points FROM members WHERE name = '${name}' AND pin = '${pin}'`;
  console.log('  SQL chạy:', sql);
  return (await db.query(sql)).rows;
}

// ĐÚNG: câu SQL cố định, giá trị đi riêng qua $1, $2
async function loginSafe(name: string, pin: string) {
  return (await db.query('SELECT name, points FROM members WHERE name = $1 AND pin = $2', [name, pin])).rows;
}

console.log('ghép chuỗi, đúng pin  →', await loginUnsafe('lan', '1234'));
console.log('ghép chuỗi, pin bịa   →', await loginUnsafe("minh' --", 'bất kỳ'));
console.log('ghép chuỗi, OR 1=1    →', await loginUnsafe("x' OR '1'='1", "x' OR '1'='1"));
try {
  await loginUnsafe("O'Hara", '0000');
} catch (err) {
  console.log("ghép chuỗi, tên O'Hara →", (err as Error).message);
}
console.log('tham số $1, OR 1=1    →', await loginSafe("x' OR '1'='1", "x' OR '1'='1"));
console.log("tham số $1, tên O'Hara →", await loginSafe("O'Hara", '0000'));
await db.close();
```
```output
  SQL chạy: SELECT name, points FROM members WHERE name = 'lan' AND pin = '1234'
ghép chuỗi, đúng pin  → [ { name: 'lan', points: 120 } ]
  SQL chạy: SELECT name, points FROM members WHERE name = 'minh' --' AND pin = 'bất kỳ'
ghép chuỗi, pin bịa   → [ { name: 'minh', points: 3400 } ]
  SQL chạy: SELECT name, points FROM members WHERE name = 'x' OR '1'='1' AND pin = 'x' OR '1'='1'
ghép chuỗi, OR 1=1    → [ { name: 'lan', points: 120 }, { name: 'minh', points: 3400 } ]
  SQL chạy: SELECT name, points FROM members WHERE name = 'O'Hara' AND pin = '0000'
ghép chuỗi, tên O'Hara → syntax error at or near "Hara"
tham số $1, OR 1=1    → []
tham số $1, tên O'Hara → []
```

Đọc từng dòng "SQL chạy": dấu `'` người dùng gõ **đóng chuỗi sớm**, phần sau thành lệnh. `--` biến phần kiểm tra PIN thành chú thích → vào tài khoản `minh` không cần PIN. `OR '1'='1'` luôn đúng → lộ mọi dòng. Và người tên `O'Hara` thật thì không đăng nhập được — ghép chuỗi hỏng cả với dữ liệu lương thiện.

Với `$1, $2`, câu SQL gửi tới Postgres **không đổi** bất kể người dùng gõ gì; giá trị đi riêng và chỉ được coi là dữ liệu. Không có cách "thoát ra" nào.

> ⚠️ **Lỗi hay gặp:** "tự lọc dấu nháy" bằng `replace("'", "''")` thay vì dùng tham số. Luôn có cách lách (bảng mã, dấu `\`, kiểu số không cần nháy). Luật duy nhất: **mọi giá trị từ ngoài vào đi qua tham số.** Tên bảng/cột không truyền qua tham số được — nếu buộc phải ghép (vd. sắp xếp theo cột người dùng chọn), so với một danh sách cho phép (`['created_at', 'name']`) trước.

### Tìm chuỗi con: `ILIKE` và ký tự đại diện

Trong `LIKE`/`ILIKE`, `%` (chuỗi bất kỳ) và `_` (một ký tự bất kỳ) là **ký tự đại diện** — kể cả khi chúng nằm trong giá trị đi qua tham số. Không phải injection, nhưng là bug: người dùng tìm `50%` thì khớp cả "500k". Ví dụ cửa hàng:

```ts
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  CREATE TABLE products (name text NOT NULL);
  INSERT INTO products VALUES ('Áo GIẢM 50%'), ('Quần 500k'), ('Mũ size_L'), ('Giày sizeXL');
`);
const names = async (sql: string, param: string) => (await db.query<{ name: string }>(sql, [param])).rows.map((r) => r.name);

// Cách A — ghép % vào CÂU SQL: an toàn (q vẫn là tham số), nhưng % và _ trong q vẫn là ký tự đại diện
const naive = "SELECT name FROM products WHERE name ILIKE '%' || $1 || '%'";
console.log('A  "50%"   :', await names(naive, '50%'));
console.log('A  "size_" :', await names(naive, 'size_'));

// Cách B — tự dựng pattern trong JS rồi truyền làm $1: thêm \ trước \ % _, bọc %…%
function containsPattern(q: string): string {
  let escaped = '';
  for (const ch of q) {
    if (ch === '\\' || ch === '%' || ch === '_') escaped += '\\';   // \ là ký tự thoát mặc định của LIKE
    escaped += ch;
  }
  return '%' + escaped + '%';
}
const safe = 'SELECT name FROM products WHERE name ILIKE $1';
console.log('B  "50%"   :', await names(safe, containsPattern('50%')), '← pattern', containsPattern('50%'));
console.log('B  "size_" :', await names(safe, containsPattern('size_')));
await db.close();
```
```output
A  "50%"   : [ 'Áo GIẢM 50%', 'Quần 500k' ]
A  "size_" : [ 'Mũ size_L', 'Giày sizeXL' ]
B  "50%"   : [ 'Áo GIẢM 50%' ] ← pattern %50\%%
B  "size_" : [ 'Mũ size_L' ]
```

`||` là phép nối chuỗi của SQL. Cách B **ghép chuỗi trong JS** — vẫn đúng luật, vì ghép ký tự vào **giá trị** trước khi truyền làm `$1` là an toàn; luật chỉ cấm ghép vào **câu SQL**. Vòng `for` của `containsPattern` viết gọn được thành `'%' + q.replace(/[\\%_]/g, '\\$&') + '%'` (regex: mọi ký tự `\`, `%`, `_`; `$&` = chính ký tự vừa khớp) — cùng O(n), chỉ gọn hơn nhưng khó đọc hơn. Hướng thứ ba không cần thoát gì: hàm tìm vị trí chuỗi con `strpos(chuỗi, chuỗi_con)` (trả 0 khi không có, không có ký tự đại diện), kết hợp `lower(...)` cho hai vế để không phân biệt hoa thường.

### Interface `Db`: một code, hai database

```ts
export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
```

Store, migrate, transaction của bạn chỉ nhận một `Db` — không biết, không cần biết phía sau là gì. Đây là **dependency injection** (N11: `createApp(store)`): test truyền PGlite trong bộ nhớ, `npm start` truyền PGlite lưu ra thư mục `.pgdata/`, production truyền `pg.Pool` nối tới Postgres thật qua `DATABASE_URL`. Cả ba đều có hàm `query(sql, params)` trả `{ rows }`, nên đều khớp interface (TypeScript kiểm tra theo **hình dạng**, không cần `implements`). Khác biệt đáng nhớ: PGlite chạy trong tiến trình Node với **một** kết nối, khởi động ~1 giây (test, demo, máy học viên); `pg.Pool` nối tới server Postgres riêng với **nhiều** kết nối (`max`, mặc định 10) — production.

### Transaction: cùng có hoặc cùng không

Chuyển 200 điểm từ ví `lan` sang ví `minh` là hai câu UPDATE. Server sập giữa hai câu:

```ts
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  CREATE TABLE wallets (owner text PRIMARY KEY, balance integer NOT NULL CHECK (balance >= 0));
  INSERT INTO wallets VALUES ('lan', 500), ('minh', 100);
`);
const total = async () => (await db.query<{ s: number }>('SELECT sum(balance)::int AS s FROM wallets')).rows[0]!.s;
const crash = () => { throw new Error('server sập giữa chừng'); };

// Chuyển 200 từ lan sang minh: hai câu UPDATE phải cùng xảy ra hoặc cùng không
async function transferNoTx(fail: boolean) {
  await db.query("UPDATE wallets SET balance = balance - 200 WHERE owner = 'lan'");
  if (fail) crash();
  await db.query("UPDATE wallets SET balance = balance + 200 WHERE owner = 'minh'");
}
async function transferTx(fail: boolean) {
  await db.query('BEGIN');
  try {
    await db.query("UPDATE wallets SET balance = balance - 200 WHERE owner = 'lan'");
    if (fail) crash();
    await db.query("UPDATE wallets SET balance = balance + 200 WHERE owner = 'minh'");
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

console.log('ban đầu                 tổng =', await total());
await transferNoTx(true).catch((e: Error) => console.log('không transaction:', e.message));
console.log('sau lỗi, không tx       tổng =', await total(), '← mất 200');
await db.query("UPDATE wallets SET balance = 500 WHERE owner = 'lan'");
await transferTx(true).catch((e: Error) => console.log('có transaction   :', e.message));
console.log('sau lỗi, có tx          tổng =', await total(), '← không mất gì');
await transferTx(false);
console.log('chuyển thành công       ', (await db.query('SELECT owner, balance FROM wallets ORDER BY owner')).rows);
await db.close();
```
```output
ban đầu                 tổng = 600
không transaction: server sập giữa chừng
sau lỗi, không tx       tổng = 400 ← mất 200
có transaction   : server sập giữa chừng
sau lỗi, có tx          tổng = 600 ← không mất gì
chuyển thành công        [ { owner: 'lan', balance: 300 }, { owner: 'minh', balance: 300 } ]
```

Ở TeamPulse, ví dụ tương tự là "tạo kênh kèm tin chào đầu tiên": mất kết nối giữa hai câu INSERT thì còn lại một kênh mồ côi không có tin chào. `createChannelWithWelcome` của bạn chặn điều đó.

**Cái bẫy của pool.** Transaction gắn với **một kết nối**. PGlite chỉ có một kết nối nên ví dụ trên đúng. `pg.Pool` có nhiều kết nối, và mỗi `pool.query()` lấy kết nối nào đang rảnh — `BEGIN`, `INSERT`, `ROLLBACK` có thể rơi vào ba kết nối khác nhau:

```mermaid
sequenceDiagram
    participant C as Code gọi pool.query()
    participant K1 as Kết nối 1
    participant K2 as Kết nối 2
    participant K3 as Kết nối 3
    C->>K1: BEGIN
    Note over K1: mở transaction (rồi bỏ đó)
    C->>K2: INSERT 'không được lưu'
    Note over K2: không có transaction → lưu ngay
    C->>K3: ROLLBACK
    Note over K3: không có gì để huỷ
```

Chạy thật trên Postgres trong Docker (`max: 3`): ba câu `SELECT pg_backend_pid()` gửi cùng lúc; rồi `BEGIN` / `INSERT` / `ROLLBACK` qua `pool.query` khi pool đang bận; rồi cùng việc đó qua một client mượn riêng:

```output
pool.query → pid: [ 81, 82, 83 ]
sau ROLLBACK qua pool, số dòng: 1
sau ROLLBACK qua client, số dòng: 0
```

Ba câu, ba tiến trình Postgres khác nhau (`pid` 81, 82, 83). `ROLLBACK` qua pool rơi vào kết nối không có transaction → dòng "không được lưu" **vẫn được lưu**. Cách đúng: `pool.connect()` mượn **một** client, chạy cả transaction trên client đó, rồi `client.release()` trả nó về pool. Lỗi này không bao giờ lộ ra khi test bằng PGlite (một kết nối) — chỉ lộ ở production khi có tải. Vì vậy `db.ts` có sẵn `acquire(db)`: với pool thì `pool.connect()` mượn một client, xong `release()` trả lại; với PGlite hay client sẵn có thì dùng luôn. `withTransaction` của bạn dùng nó, và `npm run migrate` cũng vậy.

> ⚠️ **Lỗi hay gặp:** quên `release()` khi có lỗi. Mỗi lần quên là pool mất vĩnh viễn một kết nối; sau `max` lần, mọi request đứng chờ mãi. Đặt `release()` trong `finally`.

Một điểm nữa: trong transaction, **một câu lỗi làm hỏng cả transaction** — mọi câu sau đó bị từ chối (`current transaction is aborted`) cho tới `ROLLBACK`. Nên "thử INSERT, trùng thì bắt lỗi 23505 rồi làm tiếp" không dùng được ở giữa transaction; dùng `INSERT ... ON CONFLICT (name) DO NOTHING RETURNING ...` (trùng thì không trả dòng nào, không lỗi).

### `ON CONFLICT`: chèn, hoặc lấy dòng đã có

`DO NOTHING` đủ khi bạn chỉ cần biết "có trùng không". Khi cần **id** của dòng — dù vừa tạo hay đã có từ trước — thì `DO NOTHING RETURNING` không giúp được: trùng thì không trả dòng nào. Dùng `DO UPDATE` ("upsert"): trùng thì sửa dòng cũ, và dòng đó được `RETURNING` trả về. Ví dụ bảng nhãn sản phẩm:

```ts
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`CREATE TABLE tags (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE)`);

// DO NOTHING: trùng thì bỏ qua — và RETURNING cũng không trả dòng nào
const nothing = 'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id';
console.log('DO NOTHING lần 1:', (await db.query(nothing, ['sale'])).rows);
console.log('DO NOTHING lần 2:', (await db.query(nothing, ['sale'])).rows);

// DO UPDATE: trùng thì "sửa" dòng cũ (ở đây gán lại đúng giá trị cũ) — dòng đó được RETURNING trả về
// EXCLUDED = dòng bạn định chèn mà bị từ chối vì trùng
const upsert = 'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id';
console.log('DO UPDATE  lần 1:', (await db.query(upsert, ['mới'])).rows);
console.log('DO UPDATE  lần 2:', (await db.query(upsert, ['mới'])).rows);
console.log('DO UPDATE  "sale":', (await db.query(upsert, ['sale'])).rows);
await db.close();
```
```output
DO NOTHING lần 1: [ { id: 1 } ]
DO NOTHING lần 2: []
DO UPDATE  lần 1: [ { id: 3 } ]
DO UPDATE  lần 2: [ { id: 3 } ]
DO UPDATE  "sale": [ { id: 1 } ]
```

`SET name = EXCLUDED.name` không đổi gì thật (tên vẫn như cũ) — nó chỉ để Postgres coi dòng cũ là "đã đụng tới" và trả nó qua `RETURNING`. Lần 2 và `"sale"` ra đúng id cũ. Id nhảy từ 1 lên 3: mỗi lần INSERT thử đều tiêu một số tự tăng, kể cả lần bị trùng — id có khoảng trống là bình thường, đừng dùng nó để đếm.

## 🛠️ Làm

### Bước 1 — Chuẩn bị

```bash
cd academy/courses/node-realtime/workspace/N12-postgresql-voi-node
npm test             # 8 fail vì TODO — bình thường (mỗi test ~1 giây vì khởi động PGlite)
npm run typecheck    # 0 lỗi; giữ như vậy sau mỗi bước
```

Đọc `db.ts` (có sẵn) trước: `Db`, `acquire`, `splitStatements`. Chạy riêng một nhóm test (dùng y hệt trên PowerShell):

```bash
node --test --test-name-pattern="migrate" "../../curriculum/N12-postgresql-voi-node/tests/*.test.js"
```

### Bước 2 — Bộ chạy migration → `migrate`

Theo 5 bước trong docstring. Đọc thư mục: `readdir(dir)` → lọc tên kết thúc `.sql` → `.sort()`. Tập version đã chạy nên để trong `Set` (tra `has` O(1) như dict/set ở Python). Phần `BEGIN … COMMIT` / `ROLLBACK` + ném lại lỗi giống hệt `transferTx` ở trên — chỉ khác là trong vòng lặp qua từng câu của `splitStatements(nội dung)`. Test dùng thư mục migration tạm của riêng nó, nên bước này không phụ thuộc `001_init.sql`.

```bash
node --test --test-name-pattern="migrate" "../../curriculum/N12-postgresql-voi-node/tests/*.test.js"
```

### Bước 3 — Schema → `migrations/001_init.sql`

Viết 3 câu `CREATE TABLE` và 1 câu `CREATE INDEX` theo chú thích trong file, mỗi câu kết thúc bằng `;` ở cuối dòng. Mẫu cú pháp nằm ở ví dụ `fruits` và `books` phía trên (`GENERATED ALWAYS AS IDENTITY`, `REFERENCES`, `CHECK (length(...) BETWEEN ...)`, `DEFAULT now()`). Biểu thức chính quy trong Postgres dùng toán tử `~`: `CHECK (name ~ '^...$')`.

Chưa đúng ngay lần đầu là bình thường: workspace chưa chạy migration ở đâu cả nên **được sửa** `001_init.sql` thoải mái (test tạo PGlite mới mỗi lần). Chỉ khi đã chạy trên một database dùng thật (vd. `npm run migrate` vào `.pgdata/`) thì mới không sửa nữa — lúc đó xoá thư mục `.pgdata/` để làm lại từ đầu.

```bash
node --test --test-name-pattern="001_init" "../../curriculum/N12-postgresql-voi-node/tests/*.test.js"
```

### Bước 4 — Store trên Postgres → `createPgStore`

5 hàm, mỗi hàm một hoặc hai câu SQL có tham số. Dùng `toChannel`/`toMessage` có sẵn để đổi dòng → object. Ba chỗ cần nghĩ:

| Hàm | Gợi ý |
|---|---|
| `createChannel` | `RETURNING id, name, created_at` lấy dòng vừa tạo; trùng tên → `null` (`ON CONFLICT` hoặc bắt mã `23505` — đọc docstring) |
| `listMessages` | `JOIN users` để có tên người gửi; `before` vắng thì truyền `null`, điều kiện viết sẵn trong docstring |
| `addMessage` | Người gửi theo **tên**: chưa có thì tạo, có rồi lấy id — mục *`ON CONFLICT`: chèn, hoặc lấy dòng đã có* (bẫy: `DO NOTHING RETURNING` không trả dòng khi đã có), hoặc SELECT trước rồi INSERT nếu chưa có |

```bash
node --test --test-name-pattern="createPgStore" "../../curriculum/N12-postgresql-voi-node/tests/*.test.js"
```

### Bước 5 — Tìm kiếm an toàn → `searchMessages`

Một câu SELECT có `$1` (kênh) và `$2` (chuỗi tìm). Test thử ba chuỗi tấn công, tên có dấu nháy (`O'Brien`), và `%`, `_` — chọn một trong các hướng ở mục *Tìm chuỗi con: `ILIKE` và ký tự đại diện*.

```bash
node --test --test-name-pattern="searchMessages" "../../curriculum/N12-postgresql-voi-node/tests/*.test.js"
```

### Bước 6 — Transaction → `withTransaction`, `createChannelWithWelcome`

`withTransaction`: theo docstring — `acquire`, `BEGIN`, `fn(conn)`, `COMMIT`; `catch` → `ROLLBACK` + `throw`; `finally` → `release()`. Test dùng một pool giả ghi lại từng câu để kiểm tra mọi câu đi qua **client** đã mượn, không câu nào đi thẳng pool.

`createChannelWithWelcome`: gọi `withTransaction(db, async (tx) => { ... })`, bên trong tạo store trên **`tx`** (không phải `db`) rồi tạo kênh và tin chào. Test dùng một `Db` "chập chờn" ném lỗi đúng lúc INSERT tin nhắn và kiểm tra không còn kênh mồ côi.

```bash
node --test --test-name-pattern="withTransaction|createChannelWithWelcome" "../../curriculum/N12-postgresql-voi-node/tests/*.test.js"
```

### Bước 7 — Chạy thật

```bash
npm run demo
```
```output
migrate lần 1: [ '001_init.sql', '002_channel_topic.sql' ]
migrate lần 2: []
trùng tên kênh: null
trang 1 general: [ '2 Binh: Ok, deploy xong báo nhé' ]

tìm "deploy"  ghép chuỗi: [ 'Deploy lúc 10h', 'Ok, deploy xong báo nhé' ]
tìm "%' OR 1=1 --" ghép chuỗi: [
  'Deploy lúc 10h',
  'Ok, deploy xong báo nhé',
  'Bảng lương tháng 10 (mật)'
]
tìm "%' OR 1=1 --" tham số $2: []

tạo #ops: An đã tạo kênh #ops
tạo #qa : mất kết nối tới DB
kênh hiện có: [ 'general', 'hr', 'ops' ]
```

Dòng "ghép chuỗi" dùng một hàm tìm kiếm **sai cố ý** viết sẵn trong `demo.ts`: tìm trong kênh `general` mà lộ tin mật của kênh `hr`. Dòng `$2` là `searchMessages` của bạn.

**App N11 của bạn trên PostgreSQL.** `npm start` nạp `createApp` từ workspace `N11-rest-api-express` của bạn, chạy migration, và truyền `createPgStore(db)` thay cho store bộ nhớ — `app.ts` không sửa dòng nào:

```bash
npm run migrate      # PGlite ./.pgdata: đã áp 001_init.sql, 002_channel_topic.sql
npm start            # cổng 3112; bận thì PORT=3113 npm start (PowerShell: $env:PORT=3113; npm start)
curl -X POST http://127.0.0.1:3112/channels -H "content-type: application/json" -d '{"name":"general"}'
curl -X POST http://127.0.0.1:3112/channels/1/messages -H "content-type: application/json" -d '{"author":"An","text":"Lưu vào Postgres rồi"}'
# Ctrl+C, rồi npm start lại:
curl "http://127.0.0.1:3112/channels/1/messages?limit=5"
```

```powershell
# PowerShell: npm run migrate và npm start như trên, rồi ở terminal thứ hai:
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3112/channels -ContentType "application/json" -Body '{"name":"general"}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3112/channels/1/messages -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes('{"author":"An","text":"Lưu vào Postgres rồi"}'))
# Ctrl+C, rồi npm start lại:
curl.exe "http://127.0.0.1:3112/channels/1/messages?limit=5"
```
```output
{"items":[{"id":1,"channelId":1,"author":"An","text":"Lưu vào Postgres rồi","createdAt":"2026-10-23T02:02:36.260Z"}],"nextBefore":null}
```

Khởi động lại mà tin vẫn còn: dữ liệu nằm trong `.pgdata/`.

**Tuỳ chọn — Postgres thật trong Docker.** Không bắt buộc, test không cần. Có Docker (Docker Desktop trên Windows/macOS, hoặc Docker trong WSL) thì:

```bash
docker run --rm -d --name tp-postgres -e POSTGRES_USER=teampulse -e POSTGRES_PASSWORD=teampulse -e POSTGRES_DB=teampulse -p 127.0.0.1:5432:5432 postgres:17-alpine
export DATABASE_URL=postgres://teampulse:teampulse@127.0.0.1:5432/teampulse
npm run migrate      # PostgreSQL 127.0.0.1:5432: đã áp 001_init.sql, 002_channel_topic.sql
npm start
docker exec -it tp-postgres psql -U teampulse -c '\dt'     # xem các bảng
docker stop tp-postgres                                    # xong thì tắt (--rm: xoá luôn dữ liệu)
```

```powershell
docker run --rm -d --name tp-postgres -e POSTGRES_USER=teampulse -e POSTGRES_PASSWORD=teampulse -e POSTGRES_DB=teampulse -p 127.0.0.1:5432:5432 postgres:17-alpine
$env:DATABASE_URL="postgres://teampulse:teampulse@127.0.0.1:5432/teampulse"   # còn hiệu lực tới khi đóng terminal
npm run migrate
npm start
docker exec -it tp-postgres psql -U teampulse -c '\dt'
docker stop tp-postgres
Remove-Item Env:DATABASE_URL     # quay lại PGlite (bash: unset DATABASE_URL)
```

Cổng 5432 bận (máy đã cài Postgres) thì đổi `-p 127.0.0.1:5433:5432` và `...@127.0.0.1:5433/...`. Mật khẩu `teampulse` chỉ dùng trên máy mình; cách giữ bí mật cho production nằm ở N16. Docker Compose (Postgres + app chạy cùng nhau, có healthcheck) là nội dung N15.

`--rm` nghĩa là `docker stop` xoá luôn container và dữ liệu. Muốn giữ DB này để N13–N16 dùng tiếp (mỗi bài chỉ chạy migration mới của bài đó), thêm `-v tp-pgdata:/var/lib/postgresql/data` vào lệnh `docker run`.

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc trong thư mục workspace của bài:

```bash
npm test
npm run typecheck
```

Mục tiêu: `# pass 8`, typecheck không lỗi. Mỗi test dùng một PGlite mới trong bộ nhớ — Postgres thật, nên ràng buộc, mã lỗi và transaction chạy y như production (trừ bẫy nhiều kết nối của pool, được kiểm bằng pool giả).

## 🎤 Câu hỏi phỏng vấn

> 🎯 **Phỏng vấn hay hỏi:** "Bạn làm việc với PostgreSQL từ Node thế nào cho an toàn?" — Mọi giá trị từ ngoài đi qua tham số `$1, $2` (câu SQL cố định, giá trị gửi riêng nên không thành lệnh; ghép chuỗi cho phép `' OR '1'='1`); tên cột động thì so với danh sách cho phép. Schema có ràng buộc (UNIQUE, CHECK, khóa ngoại) làm lớp chặn cuối, bắt lỗi theo SQLSTATE (`23505` → 409). Schema thay đổi qua migration đánh số, mỗi file một transaction, ghi vào `schema_migrations`, không sửa file đã chạy. Nhiều câu phải cùng thành công thì bọc `BEGIN/COMMIT/ROLLBACK` trên **một** client mượn bằng `pool.connect()` và `release()` trong `finally` — `pool.query('BEGIN')` có thể rơi vào kết nối khác. Code nhận một interface `Db` nên test chạy trên PGlite, production trên `pg.Pool`.
