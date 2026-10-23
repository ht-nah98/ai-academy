# N16 — CI và triển khai

> App vẫn là **TeamPulse bạn đã xây ở N11–N14** (`app.ts`, `store.ts`, `db.ts`, `migrate.ts`, `chat-store.ts`, `auth.ts`, `server.ts`) cùng bộ test tích hợp và Docker của N15. Bài cuối P3 đưa nó tới mức "giao cho người khác vận hành được": cấu hình sai thì dừng ngay, nền tảng hỏi được app còn sống và sẵn sàng chưa, deploy không cắt ngang người đang chat, và mỗi lần đẩy code máy tự kiểm tra.

## 🎯 Mục tiêu

Sau buổi này (khoảng 4 giờ; có thể chia hai buổi: Bước 1–4 phần app, Bước 5–7 phần CI và triển khai) bạn sẽ:

- Viết **`loadConfig`**: đọc biến môi trường bằng zod, sai là dừng ngay (**fail fast**), báo đủ mọi biến sai.
- Viết **`/health`** (liveness) và **`/ready`** (readiness) — hai câu hỏi khác nhau mà load balancer và Docker đặt cho app.
- Viết **`createShutdown`**: tắt êm khi nhận **SIGTERM** — ngừng nhận mới, đóng WebSocket mã **1001**, làm nốt request đang dở, đóng DB.
- Viết **workflow GitHub Actions** `ci.yml`: cài → kiểm kiểu → test → migrate trên Postgres thật → build image; deploy từ nhánh `main` bằng **secret**.
- So sánh **Render / Fly.io / Railway / VPS** cho app WebSocket, và có **checklist trước khi deploy**.
- **Kết quả đo được:** chấm bài qua **18 test**, ~2 giây (Windows: 17 + 1 bỏ qua). `docker compose stop app` khi có người đang chat: trước (N15) client WebSocket bị cắt mã **1006**, không có `/ready`; sau bài này client nhận **1001**, `docker compose ps` báo app **(healthy)** qua `/ready`, container vẫn thoát mã 0 trong dưới nửa giây.

> 📖 Từ lạ ở trên và trong Đề bài (CI, SIGTERM, liveness, readiness, secret…) được giải nghĩa ở mục *Hiểu trước khi làm*, ngay đầu phần kiến thức nền.

## 📋 Đề bài

**Mở thư mục:** workspace của bài `N16-ci-trien-khai`.

| File | Ai viết | Nội dung |
|---|---|---|
| `config.ts` | **Bạn** | `loadConfig(env)` |
| `health.ts` | **Bạn** | `registerHealthRoutes(app, deps)` — `server.ts` gắn nó vào app |
| `shutdown.ts` | **Bạn** | `createShutdown(deps)` — `server.ts` gắn vào SIGTERM/SIGINT |
| `.github/workflows/ci.yml` | **Bạn** | Workflow CI (starter chỉ có chú thích yêu cầu và luật chấm) |
| `server.ts` | Có sẵn | `server.ts` của N14/N15 + phần vận hành: `main()` gọi `loadConfig` → `openDb` → `prepareDb` → `startServer` → `createShutdown`; `startServer` gắn `/health`, `/ready` **trước** lớp kiểm đăng nhập, trả thêm `wss` và `beginShutdown()` |
| `auth.ts` | Có sẵn | `auth.ts` của N14 + 2 tuỳ chọn không bắt buộc cho `createAuthServer`: `wss` (để tắt êm đóng được mọi WebSocket) và `publicRoutes` (route không cần đăng nhập) |
| `app.ts`, `store.ts`, `types.ts`, `db.ts`, `migrate.ts`, `migrate-cli.ts`, `chat-store.ts`, `demo.ts`, `migrations/001…004` | Có sẵn, không đổi | Giống hệt N14 |
| `testkit.ts`, `integration.test.ts` | Có sẵn (N15) | Test tích hợp + 1 test `/health`, `/ready` — CI chạy bằng `npm run test:mine` |
| `Dockerfile`, `.dockerignore`, `compose.yaml` | Có sẵn | Như N15, cổng 3116; `compose.yaml` thêm healthcheck gọi `/ready` |

| Viết | Làm gì |
|---|---|
| `loadConfig(env)` | `NODE_ENV`, `PORT`, `HOST`, `DATABASE_URL`, `SHUTDOWN_TIMEOUT_MS`, `ALLOWED_ORIGINS` → object 6 trường; sai → `Error('Cấu hình không hợp lệ: …')` nêu mọi biến |
| `registerHealthRoutes` | `/health` luôn 200; `/ready` 200 \| 503 `shutting_down` \| 503 `db_unavailable` (có timeout) |
| `createShutdown` | `shutdown(reason)`: `onStart` → `server.close` → WS 1001 → chờ tối đa `timeoutMs` → `closeDb` một lần |
| `ci.yml` | push/PR: `npm ci`, `typecheck`, `test:mine`, `migrate` trên service postgres, `docker build`; job `deploy` chỉ từ `main` |

**Xong khi:** `# pass 18` ở `npm test` (Windows: `pass 17`, `skipped 1` — xem Tự kiểm tra), `npm run test:mine` và `npm run typecheck` xanh.

## 🤔 Tại sao? (kiến thức nền)

### Hiểu trước khi làm

**Bối cảnh.** Tới giờ mọi việc diễn ra trên máy bạn: bạn chạy test khi nhớ ra, bạn bật tắt server bằng Ctrl+C. Khi app chạy cho người khác dùng, những việc đó do **máy** làm: một máy chạy test mỗi lần có người đẩy code; nền tảng hosting tự khởi động app, hỏi định kỳ "còn sống không?", và khi có bản mới thì **tắt bản cũ** để chạy bản mới — nhiều lần mỗi ngày. App phải trả lời được các câu hỏi đó và tắt sao cho người đang dùng không bị cắt ngang.

**Ví dụ đời thường.** **CI** giống bộ phận kiểm tra chất lượng ở cuối dây chuyền: mọi sản phẩm đi qua, không ai được "bỏ qua lần này". **/health** giống hỏi nhân viên "anh còn tỉnh không?"; **/ready** giống hỏi "anh nhận khách mới được chưa?" — một người đang thay ca vẫn tỉnh nhưng không nhận khách mới. **Tắt êm** giống quán ăn đóng cửa: treo biển "ngừng nhận khách" (ngừng nhận kết nối), báo khách đang ngồi "quán sắp đóng" (WS 1001), phục vụ nốt bàn đang ăn (request dở), rồi mới khoá bếp (đóng DB). Tắt kiểu `SIGKILL` là cúp điện cả quán giữa bữa.

**Bạn đã gặp nó ở đâu.**
- Dấu tick xanh / x đỏ cạnh mỗi commit trên GitHub: GitHub Actions vừa chạy workflow.
- Ứng dụng ngân hàng, Grab, Shopee cập nhật server nhiều lần mỗi ngày mà bạn không bị đăng xuất.
- Trang trạng thái kiểu `githubstatus.com`: dựa trên health check tự động.
- Render, Railway, Vercel tự deploy mỗi khi bạn đẩy lên nhánh `main`.

| Câu hỏi | Trả lời |
|---|---|
| **What** — là gì | CI: máy tự chạy cài đặt, kiểm kiểu, test mỗi lần có push/PR. CD: tự deploy khi CI xanh. Health/ready: endpoint cho máy hỏi trạng thái app. Graceful shutdown: tắt theo thứ tự để không mất việc dở. |
| **Why** — vì sao cần | Lỗi bị chặn trước khi tới người dùng; deploy nhiều lần mỗi ngày mà không cắt ngang ai; nền tảng không gửi người dùng tới instance chưa sẵn sàng. |
| **When** — khi nào dùng | Mọi dự án có hơn một người hoặc chạy cho người khác dùng. Health/ready/tắt êm: mọi server chạy sau load balancer hay trong container. |
| **When not** — khi nào không | Script chạy một lần trên máy bạn không cần CI hay `/ready`. Không đưa bước chậm, hay hỏng vì mạng (gọi API thật bên ngoài) vào CI mỗi push. |
| **Where** — ở đâu | `.github/workflows/ci.yml` trong repo; `/health`, `/ready` trong app; xử lý SIGTERM ở `server.ts`; cấu hình ở biến môi trường của nền tảng. |
| **How** — chạy thế nào | Push → GitHub dựng máy ảo Ubuntu → chạy từng bước → xanh thì job deploy gọi nền tảng → nền tảng build image, chạy bản mới, chờ `/ready` 200, gửi SIGTERM cho bản cũ. |

```mermaid
flowchart TD
    P["git push / pull request"] --> CI["GitHub Actions: npm ci → typecheck → test<br/>→ migrate trên Postgres → docker build"]
    CI -- "đỏ" --> F["Dừng: không deploy, báo người đẩy code"]
    CI -- "xanh + nhánh main" --> D["Job deploy: gọi deploy hook (secret)"]
    D --> N["Nền tảng chạy bản mới"]
    N --> R{"/ready = 200?"}
    R -- "có" --> S["Chuyển người dùng sang bản mới;<br/>gửi SIGTERM cho bản cũ"]
    S --> G["Bản cũ tắt êm: ngừng nhận → WS 1001<br/>→ làm nốt request → đóng DB → thoát 0"]
```

**Từ mới trong bài**

| Từ | Nghĩa đời thường |
|---|---|
| **CI** (Continuous Integration) | Mỗi lần đẩy code, máy tự cài và chạy kiểm tra |
| **CD** (Continuous Delivery/Deployment) | CI xanh thì tự đưa bản mới lên server |
| **Pull request** (PR) | Đề nghị gộp một nhánh code vào nhánh chính; CI chạy trước khi gộp |
| **Pipeline** | Chuỗi bước tự động: cài → test → build → deploy |
| **GitHub Actions** · **workflow** | Dịch vụ CI của GitHub · một file YAML mô tả việc cần chạy |
| **Job** · **step** · **runner** | Nhóm bước chạy trên một máy · một lệnh · máy ảo chạy job |
| **YAML** | Định dạng cấu hình dùng thụt lề (dấu cách) để lồng nhau |
| **Service container** | Container phụ (vd. Postgres) GitHub chạy cạnh job |
| **Secret** | Giá trị bí mật lưu trên GitHub/nền tảng, không nằm trong code, bị che trong log |
| **Deploy hook** | URL bí mật; ai gọi nó thì nền tảng deploy bản mới |
| **Fail fast** | Gặp lỗi cấu hình thì dừng ngay lúc khởi động, không chạy nửa vời |
| **Tín hiệu** (signal) · **SIGTERM** · **SIGINT** · **SIGKILL** | Thông báo hệ điều hành gửi tiến trình · "hãy tắt" · Ctrl+C · "chết ngay", không xử lý được |
| **Graceful shutdown** (tắt êm) | Tắt theo thứ tự, làm nốt việc dở rồi mới thoát |
| **Mã thoát** (exit code) | Số tiến trình trả khi kết thúc: 0 = bình thường; 137 = bị SIGKILL |
| **Mã đóng 1001** · **1006** | WebSocket "bên kia đang đi" (có lời chào, client biết để kết nối lại) · kết nối bị cắt, không có lời chào |
| **Liveness** · **readiness** | "Tiến trình còn sống?" · "Nhận người dùng mới được chưa?" |
| **Load balancer** | Máy chia người dùng cho nhiều instance; hỏi `/ready` để biết gửi tới đâu |
| **Kubernetes** | Hệ thống chạy và điều phối rất nhiều container trên nhiều máy (nhắc để so sánh thời gian chờ) |
| **Keep-alive** | Giữ kết nối HTTP mở để dùng lại cho request sau |
| **Reverse proxy** (nginx) | Server đứng trước app, nhận request rồi chuyển tiếp vào trong |
| **PaaS** · **VPS** | Nền tảng lo hết phần chạy (Render, Fly, Railway) · máy chủ ảo bạn tự quản lý |
| **Let's Encrypt** | Nơi cấp chứng chỉ HTTPS miễn phí (công cụ `certbot` xin và gia hạn tự động) |
| **Log có cấu trúc** | Mỗi dòng log là một object JSON để máy lọc theo trường |

### CI: GitHub Actions đọc từng dòng

Workflow tối giản cho một thư viện tính điểm (miền khác, không có DB):

```yaml
name: CI                          # tên hiện trên tab Actions
on:                               # khi nào chạy
  push:                           #   mỗi lần push lên bất kỳ nhánh nào
  pull_request:                   #   mỗi pull request
jobs:
  test:                           # tên job (tuỳ đặt)
    runs-on: ubuntu-latest        # máy ảo GitHub cấp, xoá sau khi xong
    steps:
      - uses: actions/checkout@v5         # "uses": dùng action có sẵn — tải code repo về máy ảo
      - uses: actions/setup-node@v5       # cài Node
        with:
          node-version: 22
          cache: npm                       # cache thư mục tải của npm giữa các lần chạy
      - run: npm ci                        # "run": lệnh shell
      - run: |                             # nhiều lệnh trong một bước: "|" rồi mỗi dòng một lệnh
          npm run lint
          npm test
```

`@v5` là bản chính của action (v5 lúc soạn bài; bản cũ v4 chạy trên Node 20 mà GitHub đang ngừng hỗ trợ). Xem trang release của action để biết bản mới nhất.

| Khoá | Ý nghĩa |
|---|---|
| `on` | Sự kiện kích hoạt: `push`, `pull_request`, lịch (`schedule`), bấm tay (`workflow_dispatch`) |
| `jobs.<tên>` | Một job; các job chạy **song song** trên máy riêng, trừ khi có `needs` |
| `runs-on` | Hệ điều hành của máy ảo |
| `steps` | Chạy lần lượt; một bước lỗi (mã thoát ≠ 0) → job đỏ, các bước sau bỏ qua |
| `uses` / `with` | Gọi action người khác viết, truyền tham số |
| `run` / `env` | Lệnh shell (một dòng, hoặc khối `\|` nhiều dòng), và biến môi trường riêng cho bước đó |
| `services` | Container phụ chạy cạnh job (DB, Redis) |
| `needs` | Job này chờ job kia xanh |
| `if` | Điều kiện, vd. chỉ chạy trên nhánh `main` |

`services` với ví dụ Redis (cú pháp giống hệt cho Postgres):

```yaml
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379                     # máy runner gọi được localhost:6379
        options: >-                       # tham số docker run: job chờ tới khi healthy
          --health-cmd "redis-cli ping"
          --health-interval 2s
```

> ⚠️ **Lỗi hay gặp:** các bước `run:` chạy **trực tiếp trên máy runner**, không trong container, nên gọi service qua `localhost:<cổng>` (cần `ports:`). Chỉ khi job khai báo `container:` thì mới gọi bằng tên service — khác với Docker Compose ở N15.

> 💡 **Mẹo:** test của TeamPulse dùng PGlite, đủ nhanh để chạy mỗi push. Bước `npm run migrate` (`migrate-cli.ts` của N12) trên **Postgres thật** (service) bù chỗ PGlite có thể khác production: SQL nào chỉ chạy được trên PGlite sẽ đỏ ở CI, không đợi tới lúc deploy.

### `env` và `secrets`

| | `env:` trong YAML | `${{ secrets.TÊN }}` |
|---|---|---|
| Lưu ở đâu | Trong file, ai đọc repo cũng thấy | Settings → Secrets and variables → Actions, mã hoá |
| Trong log | In ra bình thường | Bị thay bằng `***` |
| PR từ fork | Có | **Không** được cấp (chống người lạ đọc trộm) |
| Dùng cho | Cổng, `NODE_ENV`, mật khẩu của Postgres **dùng một lần** trong CI | Deploy hook, token nền tảng, `DATABASE_URL` production (chứa mật khẩu DB) |

Mật khẩu của service Postgres trong CI không phải bí mật: container sinh ra cho một lần chạy rồi bị xoá, không ai ngoài job kết nối được. URL deploy hook thì khác: ai có nó là deploy được. Phiên đăng nhập của N14 **không** cần khoá bí mật nào: id phiên là chuỗi ngẫu nhiên lưu trong bảng `sessions`, không phải chữ ký.

### Fail fast: cấu hình sai thì dừng ngay

`Number(process.env.PORT) || 3114` (N14) không kiểm gì: `PORT=abc` lặng lẽ thành cổng mặc định; production thiếu `DATABASE_URL` thì `openDb()` vui vẻ dùng PGlite trên đĩa của container và **mất dữ liệu mỗi lần deploy** mà không ai biết. Cấu hình nên được kiểm **một lần, lúc khởi động**, sai thì in rõ và thoát mã 1 — nền tảng thấy deploy hỏng ngay, bản cũ vẫn chạy.

Ví dụ: cấu hình một máy pha cà phê. Biến môi trường luôn là **chuỗi**.

**Cách 1 — if/else, gom lỗi vào một mảng**

```ts
function loadCoffeeConfigManual(e: Record<string, string | undefined>) {
  const errors: string[] = [];
  const cups = Number(e.CUPS_PER_HOUR ?? '10');
  if (!Number.isInteger(cups) || cups < 1) errors.push('CUPS_PER_HOUR: phải là số nguyên ≥ 1');
  const mode = e.MODE ?? 'normal';
  if (mode !== 'normal' && mode !== 'eco') errors.push('MODE: chỉ nhận normal | eco');
  if (errors.length > 0) throw new Error(`Cấu hình máy pha cà phê sai:\n- ${errors.join('\n- ')}`);
  return { cupsPerHour: cups, mode };
}
```

**Cách 2 — zod: khai báo hình dạng, `safeParse` trả mọi lỗi một lần**

```ts
import { z } from 'zod';

const CoffeeEnv = z.object({
  CUPS_PER_HOUR: z.coerce.number().int().min(1).default(10),
  MODE: z.enum(['normal', 'eco']).default('normal'),
});

function loadCoffeeConfigZod(e: Record<string, string | undefined>) {
  const r = CoffeeEnv.safeParse(e);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Cấu hình máy pha cà phê sai:\n- ${lines.join('\n- ')}`);
  }
  return { cupsPerHour: r.data.CUPS_PER_HOUR, mode: r.data.MODE };
}

// Chạy cả hai cách với cùng một env sai, rồi một env đúng
const env = { CUPS_PER_HOUR: '12x', MODE: 'turbo' };
for (const load of [loadCoffeeConfigManual, loadCoffeeConfigZod]) {
  try {
    load(env);
  } catch (err) {
    console.log(`[${load.name}] ${(err as Error).message}`);
  }
  console.log(`[${load.name}] env đúng →`, load({ CUPS_PER_HOUR: '30', MODE: 'eco' }));
}
```
```output
[loadCoffeeConfigManual] Cấu hình máy pha cà phê sai:
- CUPS_PER_HOUR: phải là số nguyên ≥ 1
- MODE: chỉ nhận normal | eco
[loadCoffeeConfigManual] env đúng → { cupsPerHour: 30, mode: 'eco' }
[loadCoffeeConfigZod] Cấu hình máy pha cà phê sai:
- CUPS_PER_HOUR: Invalid input: expected number, received NaN
- MODE: Invalid option: expected one of "normal"|"eco"
[loadCoffeeConfigZod] env đúng → { cupsPerHour: 30, mode: 'eco' }
```

`.map((i) => ...)` ở Cách 2 tương đương vòng `for (const i of issues) lines.push(...)`. `z.coerce.number()` = `Number(chuỗi)` rồi kiểm; `.default(10)` dùng khi biến **không có** (`undefined`).

> ⚖️ **So sánh:** cùng O(số biến), cùng kết quả. Cách 1 dễ đọc khi có 2–3 biến nhưng mỗi biến thêm 2–3 dòng if, dễ quên một nhánh; Cách 2 khai báo một chỗ, kiểu TypeScript suy ra từ schema, gom lỗi sẵn — dùng cho TeamPulse (6 biến, một quy tắc phụ thuộc giữa hai biến). Lưu ý `Number('')` là `0` chứ không phải `NaN`: biến đặt rỗng (`PORT=`) sẽ lọt qua cả hai cách nếu không xử lý riêng — yêu cầu "chuỗi rỗng = chưa đặt" trong docstring nhắm đúng chỗ này.

### Tín hiệu và tắt êm

Khi nền tảng (Docker, Render, Kubernetes) muốn dừng app, nó gửi **SIGTERM**, chờ một khoảng (Docker: 10 giây), rồi gửi **SIGKILL**. Ví dụ server đặt pizza, mỗi đơn mất 1 giây; gửi SIGTERM khi có một đơn đang làm:

```ts
// pizza.ts — server đặt pizza: mỗi đơn mất 1 giây. Chạy: node pizza.ts [graceful]
import http from 'node:http';

const graceful = process.argv[2] === 'graceful';
const server = http.createServer((req, res) => {
  console.log('nhận đơn', req.url);
  setTimeout(() => res.end(`pizza ${req.url} xong\n`), 1000);
});
server.listen(3990, '127.0.0.1', () => console.log(`mở cửa (graceful=${graceful}), pid ${process.pid}`));

if (graceful) {
  process.on('SIGTERM', () => {
    console.log('SIGTERM: ngừng nhận đơn mới, làm nốt đơn đang dở');
    server.close(() => {
      console.log('hết đơn dở, đóng cửa');
      process.exit(0);
    });
  });
}
```
```output
--- node pizza.ts           (curl đặt đơn, 0,3 giây sau kill -TERM)
mở cửa (graceful=false), pid 3605997
nhận đơn /margherita
server exit=143
curl exit=52                ← khách nhận "Empty reply": đơn mất
--- node pizza.ts graceful
mở cửa (graceful=true), pid 3606008
nhận đơn /margherita
SIGTERM: ngừng nhận đơn mới, làm nốt đơn đang dở
hết đơn dở, đóng cửa
server exit=0
curl exit=0                 ← khách nhận "pizza /margherita xong"
```

Không có handler, Node chết ngay khi nhận SIGTERM (mã 143 = 128 + 15) — trừ khi nó là **tiến trình số 1** của container: Linux không áp hành vi mặc định đó cho tiến trình số 1, SIGTERM bị lờ đi, Docker chờ đủ 10 giây rồi SIGKILL (mã 137 = 128 + 9). `docker run --init` hoặc `init: true` trong `compose.yaml` thêm một tiến trình số 1 nhỏ chuyển tín hiệu cho app — đỡ được trường hợp quên handler, nhưng không thay được việc tắt êm.

`server.ts` của N14 **đã có** handler: SIGTERM → `close()` → thoát 0 (N15 đo: 0,33 giây). Nhưng `close()` là kiểu "cắt cho nhanh", viết cho test: hủy socket WebSocket (client thấy **1006**, không biết là server chủ động đi), `closeAllConnections()` cắt luôn request đang chạy dở, và `/ready` chưa có nên nền tảng vẫn gửi người dùng mới tới bản đang tắt. WebSocket là kết nối **không bao giờ tự xong** như một request: `server.close()` chờ mọi kết nối đóng, nên phải chủ động đóng WebSocket. Thứ tự tắt êm:

| Bước | Việc | Vì sao |
|---|---|---|
| 1 | `onStart()` → `/ready` trả 503 | Load balancer ngừng gửi người mới tới instance này |
| 2 | `server.close(cb)` | Ngừng nhận kết nối mới; `cb` chạy khi mọi kết nối đã đóng |
| 3 | Mỗi client: `ws.close(1001, 'server_shutdown')` | Client (N05) thấy 1001 → kết nối lại, load balancer đưa sang instance khác; N13 gửi bù tin bị lỡ nhờ `lastSeenId` |
| 4 | `server.closeIdleConnections()` | Kết nối keep-alive đang rảnh không giữ `server.close` chờ |
| 5 | Chờ `cb`, tối đa `timeoutMs` → quá giờ: `closeAllConnections()`, `terminate()` | Request treo không được chặn việc tắt mãi; phải xong trước khi SIGKILL tới |
| 6 | `closeDb()` | Request đang dở có thể còn cần DB — đóng sau cùng |

> ⚠️ **Lỗi hay gặp:** đóng DB trước khi HTTP xong — request đang dở lỗi "pool đã đóng" ngay lúc tắt. Và đặt `SHUTDOWN_TIMEOUT_MS` lớn hơn thời gian nền tảng chờ (Docker 10 s, Fly.io mặc định 5 s, Kubernetes 30 s): SIGKILL tới trước khi bạn dọn xong. Sau một load balancer cập nhật danh sách chậm (Kubernetes), nhiều đội còn chờ thêm vài giây giữa bước 1 và bước 2 để request đã được định tuyến tới kịp vào — bài này không cần.

### `/health` khác `/ready`

| | `/health` (liveness) | `/ready` (readiness) |
|---|---|---|
| Hỏi gì | Tiến trình còn sống, còn trả lời được không? | Gửi người dùng mới tới đây được không? |
| Ai hỏi | Probe "liveness" (yêu cầu kiểm tra nền tảng tự gửi định kỳ, hỏi "còn sống không?") của nền tảng (Kubernetes, Fly checks…) | Load balancer, nền tảng khi deploy bản mới, **healthcheck của `compose.yaml` bài này** |
| Sai thì nền tảng làm gì | **Khởi động lại** container | **Ngừng gửi** người mới, không khởi động lại |
| Gọi DB? | **Không** | Có: `SELECT 1`, có timeout |
| Khi đang tắt | 200 | 503 |

Vì sao `/health` không gọi DB: DB chập chờn 30 giây thì mọi instance cùng "chết" theo liveness, nền tảng khởi động lại tất cả cùng lúc — đang chập chờn thành sập hẳn. Sự cố DB là việc của `/ready`. `/ready` cần **timeout** vì một query treo làm chính request kiểm tra treo theo, nền tảng chờ mãi không có câu trả lời.

Vì sao `compose.yaml` hỏi `/ready`: healthcheck của Docker Compose **không** tự khởi động lại container unhealthy; nó chỉ cho biết trạng thái (`docker compose ps`) và cho service khác `depends_on: condition: service_healthy` chờ — đúng nghĩa "sẵn sàng". Cả hai route nằm **trước** lớp kiểm đăng nhập của `auth.ts` (qua `publicRoutes`): máy hỏi thăm không có cookie.

### Chọn nơi triển khai

| | Render | Fly.io | Railway | VPS + nginx |
|---|---|---|---|---|
| Kiểu | PaaS, deploy từ GitHub hoặc Dockerfile | PaaS chạy container gần người dùng, nhiều vùng | PaaS, deploy từ GitHub, giao diện đơn giản | Máy chủ ảo (DigitalOcean, Vultr, Viettel IDC…) bạn tự lo |
| WebSocket | Có | Có | Có | Có, phải cấu hình nginx (Đọc thêm bên dưới) |
| Tắt khi deploy | SIGTERM rồi chờ (cấu hình được) | SIGINT/SIGTERM, mặc định chờ 5 s (`kill_timeout`) | SIGTERM rồi chờ | Do bạn: `docker stop -t` |
| Hợp với | Người mới, ít việc vận hành | Người dùng ở nhiều nước, cần độ trễ thấp | Prototype nhanh | Muốn kiểm soát hết, chi phí cố định, chịu học vận hành |

Thông số (gói miễn phí, giá, thời gian chờ mặc định) thay đổi theo thời gian — kiểm tài liệu hiện hành của nền tảng trước khi chọn. Gói miễn phí của nhiều PaaS cho app "ngủ" khi không ai dùng: kết nối WebSocket bị cắt, lần mở sau chờ khởi động.

### Đọc thêm: nginx trước app WebSocket (VPS)

WebSocket bắt đầu bằng một request HTTP có header `Upgrade: websocket` (N03); nginx mặc định **không** chuyển tiếp header đó. Cấu hình tối thiểu:

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
  listen 80;
  location / {
    proxy_pass http://app:3116;
    proxy_http_version 1.1;                          # WebSocket cần HTTP/1.1
    proxy_set_header Upgrade $http_upgrade;          # chuyển tiếp yêu cầu "nâng cấp lên websocket"
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;                        # mặc định 60 s: kết nối chat im lặng 1 phút sẽ bị cắt
  }
}
```
```output
--- thiếu hai dòng Upgrade/Connection: /ready {"status":"ready"}
WebSocket → HTTP 404 {"error":"not_found"}
--- đủ: /ready {"status":"ready"}
WebSocket ← {"type":"synced","lastId":0}
```

Thử thật bằng `nginx:1.27-alpine` đứng trước TeamPulse trong Docker, client có cookie đăng nhập: thiếu hai dòng `Upgrade`/`Connection` thì REST vẫn chạy nhưng app nhận `GET /ws` như request thường và trả 404 — lỗi kiểu "REST được, chat không được" rất hay gặp khi deploy lần đầu. `proxy_read_timeout` dài hơn chu kỳ heartbeat (N05). HTTPS (`wss://`): nginx + chứng chỉ Let's Encrypt; PaaS làm sẵn việc này.

## 🛠️ Làm

### Bước 1 — Chuẩn bị

```bash
cd academy/courses/node-realtime/workspace/N16-ci-trien-khai
npm test           # 18 fail vì TODO — bình thường
npm run test:mine  # fail: startServer gọi registerHealthRoutes (Bước 3) còn TODO
```

Chạy riêng test của hàm đang làm (dùng y hệt trên PowerShell). Đọc dòng `fail` (phải là 0): số `pass` còn đếm cả nhóm `describe` và các file test không có tên khớp, nên lớn hơn số test thật. Muốn số gọn thì chạy đúng một file, vd. `node --test "../../curriculum/N16-ci-trien-khai/tests/config.test.js"` (`config`, `health`, `shutdown`, `ci`).

```bash
node --test --test-name-pattern="loadConfig" "../../curriculum/N16-ci-trien-khai/tests/*.test.js"
```

### Bước 2 — Cấu hình kiểm tra lúc khởi động → `loadConfig`

Bảng biến, mặc định và giới hạn ở docstring `config.ts`. Theo khuôn Cách 2 của ví dụ máy pha cà phê, thêm bốn việc ví dụ chưa có: chuỗi rỗng coi như chưa đặt (zod có `z.preprocess(fn, schema)` để đổi giá trị trước khi kiểm); `ALLOWED_ORIGINS` là **một chuỗi** phải tách thành mảng rồi kiểm từng mục (cũng `preprocess`, rồi `z.array(...)`); quy tắc "production bắt buộc `DATABASE_URL`" (một điều kiện giữa **hai** biến: `.superRefine` trên cả object, hoặc kiểm sau khi parse nhưng nhớ gộp vào **cùng** thông báo lỗi); và đổi tên khoá `PORT` → `port`.

```bash
node --test --test-name-pattern="loadConfig" "../../curriculum/N16-ci-trien-khai/tests/*.test.js"
```

### Bước 3 — `/health` và `/ready` → `registerHealthRoutes`

Hai `app.get(...)` như N11. `/ready` theo đúng thứ tự trong docstring; timeout cho `SELECT 1` là `Promise.race` giữa query và một Promise reject sau `readyTimeoutMs` (như `withTimeout` ở N01) — nhớ `clearTimeout` ở mọi lối ra. Không cần nghĩ tới đăng nhập: `startServer` đã gắn hàm của bạn trước lớp kiểm phiên. Vì đứng trước app N11, `/health` này (`{status:'ok'}`) thay route `/health` cũ của N11 (`{ok:true}`). Lý do: cùng dạng body với `/ready` (`{status:'ready'}`); probe chỉ xem mã 200 nên không ai phụ thuộc body cũ.

```bash
node --test --test-name-pattern="registerHealthRoutes" "../../curriculum/N16-ci-trien-khai/tests/*.test.js"
npm run test:mine   # giờ phải xanh 5/5 (có test GET /health và /ready)
```

### Bước 4 — Tắt êm → `createShutdown`

Làm theo bảng 6 bước ở phần kiến thức nền và docstring. Khuôn chung: `createShutdown` trả một hàm; hàm đó giữ Promise của lần chạy đầu trong một biến ở ngoài, lần gọi sau trả lại biến đó. Chờ "`server.close` xong hoặc hết giờ" là `Promise.race` như Bước 3.

```bash
node --test --test-name-pattern="createShutdown" "../../curriculum/N16-ci-trien-khai/tests/*.test.js"
```

Test cuối của nhóm này chạy **`server.ts` thật** trong tiến trình con: hỏi `/ready` không cookie, đăng ký + đăng nhập qua route N14, mở WebSocket bằng cookie, gửi `hello`, rồi gửi SIGTERM và kiểm client nhận 1001, tiến trình thoát mã 0. Tự thử (cần `config.ts`, `health.ts`, `shutdown.ts` đã xong):

```bash
node server.ts &                    # chạy nền (gọi node trực tiếp: tín hiệu tới thẳng app, giống CMD trong Dockerfile)
curl -si http://127.0.0.1:3116/health
curl -s http://127.0.0.1:3116/ready
kill -TERM %1                       # gửi SIGTERM cho tiến trình chạy nền
```
```powershell
# Cửa sổ 1: node server.ts   — dừng bằng Ctrl+C (SIGINT; server.ts xử lý giống hệt SIGTERM)
# Cửa sổ 2:
curl.exe -si http://127.0.0.1:3116/health
Invoke-RestMethod http://127.0.0.1:3116/ready
```

Kết quả thật (có thêm một client WebSocket đã đăng nhập đang mở):

```output
$ curl -si http://127.0.0.1:3116/health
HTTP/1.1 200 OK
Cache-Control: no-store
{"status":"ok"}
$ curl -s http://127.0.0.1:3116/ready
{"status":"ready"}
ws ← {"type":"synced","lastId":0}
ws đóng: 1001
server exit=0 sau 40 ms
--- log của server.ts
{"time":"2026-10-23T03:25:07.696Z","msg":"db sẵn sàng","db":"PGlite ./.pgdata","migrations":["001_init.sql","002_channel_topic.sql","003_message_sync.sql","004_auth.sql"]}
{"time":"2026-10-23T03:25:07.697Z","msg":"TeamPulse nghe ở http://127.0.0.1:3116","env":"development"}
{"time":"2026-10-23T03:25:09.834Z","msg":"shutdown: bắt đầu (SIGTERM)"}
{"time":"2026-10-23T03:25:09.849Z","msg":"shutdown: đã đóng DB"}
{"time":"2026-10-23T03:25:09.849Z","msg":"đã tắt êm","signal":"SIGTERM"}
```

Và fail fast khi cấu hình sai:

```bash
NODE_ENV=production npm start
PORT=abc SHUTDOWN_TIMEOUT_MS=50 ALLOWED_ORIGINS=teampulse.vn npm start
```
```powershell
$env:NODE_ENV='production'; npm start; Remove-Item Env:NODE_ENV
$env:PORT='abc'; $env:SHUTDOWN_TIMEOUT_MS='50'; $env:ALLOWED_ORIGINS='teampulse.vn'; npm start; Remove-Item Env:PORT, Env:SHUTDOWN_TIMEOUT_MS, Env:ALLOWED_ORIGINS
```
```output
Cấu hình không hợp lệ:
- DATABASE_URL: bắt buộc khi NODE_ENV=production
exit=1
Cấu hình không hợp lệ:
- PORT: Đầu vào không hợp lệ: mong đợi số, nhận được NaN
- SHUTDOWN_TIMEOUT_MS: Quá nhỏ: mong đợi number >=100
- ALLOWED_ORIGINS.0: mỗi mục phải là origin dạng http(s)://tên-máy[:cổng]
exit=1
```

Thông báo của TeamPulse là tiếng Việt vì `app.ts` (N11) đã bật `z.config(z.locales.vi())` cho mọi schema zod trong tiến trình; ví dụ máy pha cà phê chạy riêng nên vẫn tiếng Anh.

> 💡 **Mẹo:** `server.ts` ghi log mỗi dòng một object JSON (`time`, `msg`, các trường khác). Render, Fly, Railway đều lọc được theo trường (`msg = "shutdown: bắt đầu (SIGTERM)"`) — log chữ tự do thì chỉ tìm được bằng chuỗi.

### Bước 5 — Workflow CI → `ci.yml`

Mở `.github/workflows/ci.yml`: phần chú thích liệt kê mọi thứ cần có. Dựng từ workflow tối giản ở phần kiến thức nền, thêm:

| Thêm | Gợi ý |
|---|---|
| Service `postgres` | Như ví dụ Redis, đổi sang image `postgres:17-alpine`: đặt user/mật khẩu/tên DB qua `env:` (tên biến xem trang image), mở cổng 5432, healthcheck bằng `pg_isready` (xem ⚠️ bên dưới) |
| Các bước | `npm ci` → `npm run typecheck` → `npm run test:mine` → `npm run migrate` (bước này có `env: DATABASE_URL: postgres://<user>:<pass>@localhost:5432/<db>`) → `docker build -t teampulse .` |
| Job `deploy` | Chỉ chạy khi job `test` xanh và đang ở nhánh `main` (khoá `needs`, `if` — bảng CI ở trên); một bước `curl` gửi `POST` tới deploy hook, URL lấy từ secret `DEPLOY_HOOK_URL` qua `env:` (mục `env` và `secrets`), không ghi URL thật |

Trong workspace, `npm test` là **bài chấm** (trỏ ra `../../curriculum`, không có trong repo của bạn) nên CI chạy `npm run test:mine`.

> ⚠️ **Lỗi hay gặp:** `pg_isready` không có `-h` hỏi qua socket nội bộ của container, và trả "sẵn sàng" ngay lúc Postgres còn chạy bản khởi tạo tạm (chưa mở cổng TCP). Trên máy soạn bài: healthcheck `pg_isready -U teampulse` → job đi tiếp ngay, `npm run migrate` lỗi `Connection terminated unexpectedly` 2/2 lần; thêm `-h 127.0.0.1` → 2/2 lần chạy được. `compose.yaml` của N15/N16 dùng cùng cách sửa.

```bash
node --test --test-name-pattern="ci.yml" "../../curriculum/N16-ci-trien-khai/tests/*.test.js"
```

Bài chấm không có thư viện YAML: nó đọc file như văn bản, theo luật ghi ở đầu `ci.yml` — dòng `#` bị bỏ qua, chú thích cuối dòng được phép (`test:   # job chính`), lệnh là giá trị của `run:` viết một dòng hoặc khối `run: |` nhiều dòng, thứ tự tính theo dòng xuất hiện. Nó kiểm đủ khoá, lệnh, thứ tự, không có tab, không có URL/token thật; nó **không** kiểm được thụt lề có lồng đúng không. Kiểm tra cuối cùng là chạy thật (tuỳ chọn): tạo repo GitHub riêng từ thư mục bài, push, xem tab **Actions**; job `deploy` sẽ đỏ ở bước curl khi chưa có secret — đúng như mong đợi.

Trên máy soạn bài, các bước của job `test` được chạy lại ngoài GitHub (bản sao sạch, Postgres 17 trong Docker ở cổng 55432):

```output
yaml ok; on = ['push', 'pull_request'] ; jobs = ['test', 'deploy'] ; steps = 7
$ npm run test:mine
# pass 5
$ DATABASE_URL=postgres://teampulse:ci_only_password@localhost:55432/teampulse npm run migrate   (2 lần)
PostgreSQL localhost:55432: đã áp 001_init.sql, 002_channel_topic.sql, 003_message_sync.sql, 004_auth.sql
PostgreSQL localhost:55432: không có migration mới
```

Chạy `npm run migrate` lần hai báo "không có migration mới": bằng chứng **sổ `schema_migrations`** (N12) đã ghi đủ 001→004 nên không áp lại — các file SQL không viết kiểu `IF NOT EXISTS`, sổ ghi mới là thứ giữ cho chạy lại an toàn.

### Bước 6 — Chạy thật: tắt êm trong Docker (tuỳ chọn)

Cần Docker như N15 (Windows: Docker Desktop đang chạy, `docker version` thấy cả `Server`). `compose.yaml` của bài thêm `healthcheck` gọi `/ready` bằng `node -e "fetch(...)"` (image `node:22-slim` không có `curl`), `ALLOWED_ORIGINS` và `SHUTDOWN_TIMEOUT_MS: "8000"` (< 10 giây Docker chờ).

```bash
docker compose up --build -d
docker compose ps                  # app phải "(healthy)" — Docker đã hỏi /ready
time docker compose stop app       # đo thời gian (mở một client WebSocket trước, như N15)
docker compose ps -a               # xem mã thoát
docker compose logs app
docker compose run --rm -e DATABASE_URL= app   # thử fail fast: production thiếu DATABASE_URL
docker compose down -v
```
```powershell
docker compose up --build -d
docker compose ps
Measure-Command { docker compose stop app }   # TotalSeconds = thời gian dừng
docker compose ps -a
docker compose logs app
docker compose run --rm -e DATABASE_URL= app
docker compose down -v
```

Kết quả thật trên máy soạn bài:

```output
$ docker compose ps
app Up 8 seconds (healthy)
db Up 10 seconds (healthy)
$ time docker compose stop app
real 0.33 s
ws ← {"type":"synced","lastId":0}
ws đóng: 1001                      ← N15: 1006
$ docker compose ps -a
app Exited (0)
$ docker compose logs app
app-1  | {"time":"2026-10-23T03:25:32.370Z","msg":"TeamPulse nghe ở http://0.0.0.0:3116","env":"production"}
app-1  | {"time":"2026-10-23T03:25:41.497Z","msg":"shutdown: bắt đầu (SIGTERM)"}
app-1  | {"time":"2026-10-23T03:25:41.503Z","msg":"shutdown: đã đóng DB"}
app-1  | {"time":"2026-10-23T03:25:41.503Z","msg":"đã tắt êm","signal":"SIGTERM"}
$ docker compose run --rm -e DATABASE_URL= app
Cấu hình không hợp lệ:
- DATABASE_URL: bắt buộc khi NODE_ENV=production
```

So với N15 (cùng lệnh, cùng một client WebSocket đang mở): thời gian dừng như nhau (0,33 s cả hai lần) và đều `Exited (0)` — khác biệt nằm ở **cách** dừng: client nhận **1001** thay vì **1006**, log ghi đủ các bước, và từ lúc bắt đầu tắt `/ready` trả 503 (test cuối của `integration.test.ts` kiểm điều này). Dòng cuối: image đặt `NODE_ENV=production` (Dockerfile), quên `DATABASE_URL` thì container dừng ngay với thông báo rõ — thay vì chạy PGlite trên đĩa container và mất dữ liệu.

### Bước 7 — Checklist trước khi deploy

Không deploy thật trong bài. Trước lần deploy đầu tiên lên bất kỳ nền tảng nào, đi qua từng dòng:

| # | Kiểm | TeamPulse sau P3 |
|---|---|---|
| 1 | CI xanh trên nhánh deploy; deploy chỉ chạy khi CI xanh (`needs`) | `ci.yml` |
| 2 | Mọi cấu hình từ biến môi trường, được kiểm lúc khởi động | `loadConfig` |
| 3 | Bí mật chỉ ở secret của nền tảng/GitHub: `DATABASE_URL` production (chứa mật khẩu DB), URL deploy hook, token nền tảng (nếu sau này dùng JWT: cả khoá ký). `.env` trong `.gitignore` và `.dockerignore` | |
| 4 | App nghe `0.0.0.0` và đúng `PORT` nền tảng cấp | `HOST`, `PORT` |
| 5 | Migration chạy trước khi bản mới nhận người dùng, chạy lại không hỏng | `prepareDb` lúc khởi động, sổ `schema_migrations` |
| 6 | `/health` và `/ready` khai báo trong cấu hình health check của nền tảng | `registerHealthRoutes` |
| 7 | SIGTERM → tắt êm, timeout nhỏ hơn thời gian chờ của nền tảng | `createShutdown`, `SHUTDOWN_TIMEOUT_MS` |
| 8 | Proxy chuyển tiếp WebSocket (`Upgrade`, `Connection`), timeout đọc dài hơn heartbeat | nginx (Đọc thêm); PaaS làm sẵn |
| 9 | HTTPS/`wss://` (cookie `tp_session` có `Secure` — N14); `ALLOWED_ORIGINS` đúng tên miền thật | `ALLOWED_ORIGINS` |
| 10 | Nhiều instance: pub/sub giữa các instance (N08) hoặc chỉ chạy 1 instance (bộ đếm đăng nhập sai của N14 cũng nằm trong bộ nhớ từng instance) | |
| 11 | Postgres có backup tự động và đã thử khôi phục một lần | |
| 12 | Log có cấu trúc, xem được trên nền tảng; biết cách quay về bản trước (rollback) | log JSON |

## ✅ Tự kiểm tra

Bấm **Chạy test**, hoặc trong thư mục workspace của bài:

```bash
npm test
npm run test:mine
npm run typecheck
```

Mục tiêu: `# pass 18` — 5 test `loadConfig`, 4 test `registerHealthRoutes`, 5 test `createShutdown`, 4 test `ci.yml`. Test cuối của `createShutdown` chạy `server.ts` thật với SIGTERM; Windows không có tín hiệu POSIX (`child.kill('SIGTERM')` ở đó là giết cứng) nên test này **bỏ qua** trên Windows: kết quả là `pass 17`, `skipped 1` và app vẫn tính là xong.

## 🎤 Câu hỏi phỏng vấn

> 🎯 **Phỏng vấn hay hỏi:** "Bạn đưa một server Node có WebSocket lên production thế nào?" — CI trên mỗi push/PR: `npm ci` theo lockfile, type check, test (đơn vị + tích hợp), migration trên Postgres thật dạng service container (healthcheck qua TCP), build image; CD chỉ từ `main` khi CI xanh, thông tin deploy để trong secrets (bị che trong log, không cấp cho PR từ fork). App đọc cấu hình từ biến môi trường và validate lúc khởi động (fail fast). Có `/health` (liveness, không gọi DB — DB chập chờn không phải lý do khởi động lại) và `/ready` (readiness, `SELECT 1` có timeout, 503 khi đang tắt), cả hai không cần đăng nhập. Graceful shutdown khi SIGTERM: đánh dấu not ready → `server.close` ngừng nhận mới → đóng WebSocket mã 1001 để client kết nối lại instance khác (và đồng bộ lại bằng `lastSeenId`) → làm nốt request trong thời hạn nhỏ hơn grace period của nền tảng (Docker 10 s) → đóng pool DB → thoát 0. Sau nginx phải chuyển tiếp `Upgrade`/`Connection` và tăng `proxy_read_timeout`; chọn PaaS (Render, Fly.io, Railway) khi muốn ít vận hành, VPS khi cần kiểm soát và chịu tự lo backup, HTTPS, cập nhật.
