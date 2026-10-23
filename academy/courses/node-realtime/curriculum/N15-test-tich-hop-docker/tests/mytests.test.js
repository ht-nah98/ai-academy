// Test tự chấm cho bài N15 — phần integration.test.ts do BẠN viết.
// Chạy integration.test.ts của bạn 4 lần trong tiến trình con: với app đúng (phải pass hết, ≥ 4 test)
// và với 3 app có lỗi cố ý (mỗi lần phải có ít nhất 1 test fail).
// App = bản sao TeamPulse chuẩn (starter của bài: server.ts, auth.ts, chat-store.ts...) trong một thư mục tạm tên ngẫu nhiên.
// Bốn bản có mã nguồn giống hệt nhau, env giống hệt nhau; chế độ lỗi nằm trong file mode.json đi kèm.
// Bài chấm giả định học viên làm bài trung thực — test phải phân biệt app đúng/sai qua HÀNH VI.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testFile = join(process.cwd(), 'integration.test.ts');
const kitFile = join(process.cwd(), 'testkit.ts');
const IMPORT_EXPR = "process.env.TEAMPULSE_APP ?? './server.ts'";

const BROKEN = [
  ['ws-no-persist', 'tin gửi qua WebSocket được ack và phát cho mọi người nhưng KHÔNG lưu vào DB'],
  ['rest-no-broadcast', 'tin POST qua REST được lưu nhưng KHÔNG đẩy tới client WebSocket'],
  ['catchup-off-by-one', 'kết nối lại với lastSeenId nhận lặp lại cả tin lastSeenId'],
];

// ---------- Mã nguồn app: starter chuẩn của bài + 3 chỗ rẽ theo MODE (chỉ trong chat-store.ts) ----------
const CORE = fileURLToPath(new URL('../starter/', import.meta.url));
const LIBS = ['express', 'ws', 'zod', 'pg', '@electric-sql/pglite'];

function patch(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`bài chấm: không tìm thấy đúng một chỗ "${from.slice(0, 50)}" trong starter/chat-store.ts`);
  return src.replace(from, to);
}

function chatStoreSource() {
  let s = readFileSync(join(CORE, 'chat-store.ts'), 'utf8');
  s = patch(s, "import http from 'node:http';",
    "import http from 'node:http';\nimport { readFileSync } from 'node:fs';\nconst MODE: string = JSON.parse(readFileSync(new URL('./mode.json', import.meta.url), 'utf8')).mode;");
  s = patch(s, 'Promise<{ message: ChatMessage; duplicate: boolean }> {\n',
    `Promise<{ message: ChatMessage; duplicate: boolean }> {
  if (MODE === 'ws-no-persist') {
    const next = await db.query<{ id: number }>('SELECT coalesce(max(id), 0) + 1 AS id FROM messages');
    const message = { id: Number(next.rows[0]?.id), channelId: input.channelId, author: input.author, clientMsgId: input.clientMsgId, text: input.text, createdAt: new Date().toISOString() };
    return { message, duplicate: false };
  }
`);
  s = patch(s, 'hub.broadcast({ ...message, clientMsgId: null });',
    "if (MODE !== 'rest-no-broadcast') hub.broadcast({ ...message, clientMsgId: null });");
  s = patch(s, 'ws.lastSentId = hello.lastSeenId;',
    "ws.lastSentId = MODE === 'catchup-off-by-one' ? Math.max(0, hello.lastSeenId - 1) : hello.lastSeenId;");
  return s;
}

/** Thư viện trỏ thẳng vào node_modules của khóa (thư mục tạm nằm ngoài khóa). */
function withLibs(src) {
  for (const lib of LIBS) src = src.replaceAll(`from '${lib}';`, `from '${import.meta.resolve(lib)}';`);
  return src;
}

const tmp = mkdtempSync(join(tmpdir(), 'tp-n15-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const sources = {};
for (const f of readdirSync(CORE)) {
  if (f.endsWith('.ts') && f !== 'testkit.ts' && !f.endsWith('.test.ts')) sources[f] = readFileSync(join(CORE, f), 'utf8');
}
sources['chat-store.ts'] = chatStoreSource();

function appDir(bug) {
  const dir = join(tmp, `app-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir);
  for (const [name, src] of Object.entries(sources)) writeFileSync(join(dir, name), withLibs(src));
  cpSync(join(CORE, 'migrations'), join(dir, 'migrations'), { recursive: true });
  writeFileSync(join(dir, 'mode.json'), JSON.stringify({ mode: bug }));
  return pathToFileURL(join(dir, 'server.ts')).href;
}

function sourceProblem() {
  if (!existsSync(testFile)) return 'Không thấy integration.test.ts trong thư mục bài';
  if (!existsSync(kitFile)) return 'Không thấy testkit.ts trong thư mục bài';
  if (!readFileSync(kitFile, 'utf8').includes(IMPORT_EXPR)) {
    return 'Không tìm thấy dòng import app gốc trong testkit.ts (process.env.TEAMPULSE_APP ?? ...) — đừng sửa dòng đó.';
  }
  return null;
}

/** Giết cả nhóm tiến trình (node --test và các tiến trình con của nó). */
function killTree(child) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
    else process.kill(-child.pid, 'SIGKILL');
  } catch { /* đã thoát */ }
}

/** Chạy `node --test integration.test.ts` với TEAMPULSE_APP = bản app tạm; trả { code, pass, fail, output }. */
function runStudentTests(bug) {
  return new Promise((resolve) => {
    const env = { ...process.env, TEAMPULSE_APP: appDir(bug) };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--test', '--test-force-exit', '--test-reporter=tap', testFile], {
      cwd: process.cwd(), env, detached: process.platform !== 'win32',
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => killTree(child), 30000);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (process.platform !== 'win32') killTree(child);
      const num = (k) => Number((output.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] ?? 0);
      resolve({ code, pass: num('pass'), fail: num('fail'), output });
    });
  });
}

const problem = sourceProblem();
const runs = problem ? null : Promise.all([runStudentTests('none'), ...BROKEN.map(([b]) => runStudentTests(b))]);
const hung = (r) => r.code === null ? ' — quá 30 giây, tiến trình bị dừng: có test chờ mãi (thiếu timeout/await) hoặc server chưa đóng' : '';

test('integration.test.ts: chạy pass hết với app đúng (ít nhất 4 test)', async () => {
  assert.equal(problem, null, problem ?? '');
  const [good] = await runs;
  assert.notEqual(good.code, null, `node --test integration.test.ts quá 30 giây${hung(good)}`);
  const firstFail = (good.output.match(/^not ok \d+ - (.*)$/m) || [])[1];
  assert.equal(good.fail, 0, `Với app đúng, test của bạn phải pass hết; đang fail ${good.fail} test${firstFail ? ` (đầu tiên: "${firstFail}")` : ''}${hung(good)}`);
  assert.ok(good.pass >= 4, `Cần ít nhất 4 test pass (ví dụ + 3 test bạn viết), đang có ${good.pass}${hung(good)}`);
  assert.equal(good.code, 0, `node --test integration.test.ts phải thoát với mã 0 khi app đúng${hung(good)}`);
});

for (const [i, [, bug]] of BROKEN.entries()) {
  test(`integration.test.ts: bắt được lỗi "${bug}"`, async () => {
    assert.equal(problem, null, problem ?? '');
    const all = await runs;
    const r = all[i + 1];
    assert.ok(all[0].fail === 0 && all[0].pass >= 4 && all[0].code === 0, 'Trước hết test của bạn phải pass hết với app đúng');
    assert.ok(r.fail >= 1 && r.code !== 0, `Với app có lỗi "${bug}", phải có ít nhất 1 test của bạn FAIL — hiện tất cả đều pass${hung(r)}`);
  });
}
