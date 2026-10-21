// Test tự chấm cho bài N09 — phần chat.test.js do BẠN viết.
// Chạy chat.test.js của bạn 5 lần trong tiến trình con: với server đúng (phải pass hết, ≥ 5 test)
// và với 4 server có lỗi cố ý (mỗi lần phải có ít nhất 1 test fail).
// Mỗi server là một file tạm tên ngẫu nhiên, mã nguồn giống hệt nhau, env giống hệt nhau: bài chấm giả định
// học viên làm bài trung thực — test phải phân biệt server đúng/sai qua HÀNH VI.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = join(process.cwd(), 'chat.test.js');
const IMPORT_LINE = "const { createChatServer } = await import(process.env.CHAT_SERVER ?? './chat-server.js');";

const BROKEN = [
  ['only-sender', 'server chỉ gửi lại cho người gửi, người khác không nhận'],
  ['skip-sender', 'server gửi cho mọi người TRỪ người gửi'],
  ['close-on-bad-json', 'server đóng kết nối khi nhận JSON hỏng, không gửi error'],
  ['drop-others', 'khi một người rời đi, server xoá nhầm cả những người còn lại khỏi danh sách'],
];

// ---------- Chép server ra file tạm tên trung tính ----------
const tmp = mkdtempSync(join(tmpdir(), 'tp-n09-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const wsUrl = pathToFileURL(createRequire(import.meta.url).resolve('ws')).href;
const makeSrc = readFileSync(new URL('./fixtures/_make.js', import.meta.url), 'utf8')
  .replace("import { WebSocketServer } from 'ws';", `import WS from '${wsUrl}';\nconst { WebSocketServer } = WS;`);

// Mọi file tạm có mã nguồn GIỐNG HỆT nhau; chế độ lỗi nằm trong file JSON đi kèm (cùng tên + ".json").
const serverSrc = `import { readFileSync } from 'node:fs';\n${makeSrc}
const MODE = JSON.parse(readFileSync(new URL(import.meta.url + '.json'), 'utf8')).mode;
export const createChatServer = () => makeServer(MODE);
`;

function serverFile(bug) {
  const path = join(tmp, `srv-${randomBytes(6).toString('hex')}.mjs`);
  writeFileSync(path, serverSrc);
  writeFileSync(`${path}.json`, JSON.stringify({ mode: bug }));
  return pathToFileURL(path).href;
}

// ---------- Dòng import server gốc phải còn nguyên (bài chấm đổi server qua nó) ----------
function sourceProblem() {
  const src = readFileSync(file, 'utf8');
  if (!src.includes(IMPORT_LINE)) return 'Không tìm thấy dòng import server gốc trong chat.test.js — đừng sửa dòng đó.';
  return null;
}

/** Giết cả nhóm tiến trình (node --test và các tiến trình con của nó). */
function killTree(child) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
    else process.kill(-child.pid, 'SIGKILL');
  } catch { /* đã thoát */ }
}

/** Chạy `node --test chat.test.js` với CHAT_SERVER = file tạm; trả { code, pass, fail, output }. */
function runStudentTests(bug) {
  return new Promise((resolve) => {
    const env = { ...process.env, CHAT_SERVER: serverFile(bug) };
    delete env.NODE_TEST_CONTEXT; // để tiến trình con chạy như một lần `node --test` độc lập
    const child = spawn(process.execPath, ['--test', '--test-force-exit', '--test-reporter=tap', file], {
      cwd: process.cwd(), env, detached: process.platform !== 'win32',
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => killTree(child), 15000);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (process.platform !== 'win32') killTree(child); // dọn tiến trình cháu nếu còn
      const num = (k) => Number((output.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1] ?? 0);
      resolve({ code, pass: num('pass'), fail: num('fail'), output });
    });
  });
}

const problem = existsSync(file) ? sourceProblem() : 'Không thấy chat.test.js trong thư mục bài';
const runs = problem ? null : Promise.all([runStudentTests('none'), ...BROKEN.map(([b]) => runStudentTests(b))]);

const hung = (r) => r.code === null ? ' — tiến trình treo: còn timer/kết nối chưa đóng (dọn trong t.after)' : '';

test('chat.test.js: chạy pass hết với server đúng (ít nhất 5 test)', async () => {
  assert.equal(problem, null, problem ?? '');
  const [good] = await runs;
  assert.notEqual(good.code, null, 'Tiến trình node --test chat.test.js bị treo quá 15 giây — còn timer/kết nối chưa đóng (dọn trong t.after) hoặc có test không bao giờ kết thúc');
  const firstFail = (good.output.match(/^not ok \d+ - (.*)$/m) || [])[1];
  assert.equal(good.fail, 0, `Với server đúng, test của bạn phải pass hết; đang fail ${good.fail} test${firstFail ? ` (đầu tiên: "${firstFail}")` : ''}${hung(good)}`);
  assert.ok(good.pass >= 5, `Cần ít nhất 5 test pass (ví dụ + 4 test bạn viết), đang có ${good.pass}${hung(good)}`);
  assert.equal(good.code, 0, `node --test chat.test.js phải thoát với mã 0 khi server đúng${hung(good)}`);
});

for (const [i, [, bug]] of BROKEN.entries()) {
  test(`chat.test.js: bắt được lỗi "${bug}"`, async () => {
    assert.equal(problem, null, problem ?? '');
    const all = await runs;
    const r = all[i + 1];
    assert.ok(all[0].fail === 0 && all[0].pass >= 5 && all[0].code === 0, 'Trước hết test của bạn phải pass hết với server đúng');
    assert.ok(r.fail >= 1 && r.code !== 0, `Với server có lỗi "${bug}", phải có ít nhất 1 test của bạn FAIL — hiện tất cả đều pass${hung(r)}`);
  });
}
