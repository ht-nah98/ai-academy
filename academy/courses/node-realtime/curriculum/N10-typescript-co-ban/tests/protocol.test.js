// Test tự chấm cho bài N10. Đọc thông báo lỗi tiếng Việt để biết cần sửa gì.
// Node tự xoá kiểu khi import file .ts; test "report.ts" chạy thêm tsc để kiểm kiểu cả workspace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const load = (file) => import(pathToFileURL(join(process.cwd(), file)).href);
const { parseClientMessage, describeServerMessage, groupBy } = await load('protocol.ts');
const { MAX_NAME, MAX_TEXT } = await load('types.ts');

// ---------- parseClientMessage ----------

test('parseClientMessage: join/chat hợp lệ → msg đã trim, bỏ khóa thừa', () => {
  assert.deepEqual(parseClientMessage('{"type":"join","name":"  An "}'),
    { ok: true, msg: { type: 'join', name: 'An' } }, 'join: name phải được trim');
  assert.deepEqual(parseClientMessage('{"type":"chat","text":" Chào ","x":1,"from":"Giả"}'),
    { ok: true, msg: { type: 'chat', text: 'Chào' } }, 'chat: chỉ giữ type và text (bỏ x, from)');
  assert.deepEqual(parseClientMessage(JSON.stringify({ type: 'join', name: 'a'.repeat(MAX_NAME) })),
    { ok: true, msg: { type: 'join', name: 'a'.repeat(MAX_NAME) } }, 'name dài đúng MAX_NAME vẫn hợp lệ');
  assert.equal(parseClientMessage(JSON.stringify({ type: 'chat', text: 'x'.repeat(MAX_TEXT) })).ok, true,
    'text dài đúng MAX_TEXT vẫn hợp lệ');
});

test('parseClientMessage: dữ liệu sai → mã lỗi, không ném lỗi', () => {
  const cases = [
    ['{hỏng', 'invalid_json'], ['null', 'invalid_json'], ['[1,2]', 'invalid_json'], ['42', 'invalid_json'], ['"chat"', 'invalid_json'],
    ['{}', 'unknown_type'], ['{"type":"typing"}', 'unknown_type'], ['{"type":"JOIN","name":"An"}', 'unknown_type'],
    ['{"type":"join"}', 'invalid_name'], ['{"type":"join","name":42}', 'invalid_name'], ['{"type":"join","name":"   "}', 'invalid_name'],
    [JSON.stringify({ type: 'join', name: 'a'.repeat(MAX_NAME + 1) }), 'invalid_name'],
    ['{"type":"chat"}', 'invalid_text'], ['{"type":"chat","text":["a"]}', 'invalid_text'], ['{"type":"chat","text":""}', 'invalid_text'],
    [JSON.stringify({ type: 'chat', text: 'x'.repeat(MAX_TEXT + 1) }), 'invalid_text'],
  ];
  for (const [raw, error] of cases) {
    let result;
    assert.doesNotThrow(() => { result = parseClientMessage(raw); }, `parseClientMessage(${raw.slice(0, 30)}) không được ném lỗi`);
    assert.deepEqual(result, { ok: false, error }, `${raw.slice(0, 40)} → { ok: false, error: '${error}' }`);
  }
});

// ---------- describeServerMessage ----------

test('describeServerMessage: mỗi loại tin một dòng đúng định dạng', () => {
  const ts = Date.UTC(2026, 9, 20, 9, 5, 42);
  assert.equal(describeServerMessage({ type: 'welcome', name: 'An', users: ['An', 'Binh'] }),
    'Chào An! Đang online: An, Binh', 'welcome');
  assert.equal(describeServerMessage({ type: 'joined', name: 'Chi', users: ['An', 'Binh', 'Chi'] }),
    '+ Chi vào phòng (3 online)', 'joined: số online = users.length');
  assert.equal(describeServerMessage({ type: 'left', name: 'Binh', users: ['An'] }),
    '- Binh rời phòng (1 online)', 'left');
  assert.equal(describeServerMessage({ type: 'chat', from: 'An', text: 'Chào cả nhà', ts }),
    '[09:05] An: Chào cả nhà', 'chat: [giờ:phút UTC] tên: nội dung');
  assert.equal(describeServerMessage({ type: 'chat', from: 'Binh', text: 'ok', ts: Date.UTC(2026, 0, 1, 0, 7) }),
    '[00:07] Binh: ok', 'chat: giờ và phút luôn 2 chữ số');
  assert.equal(describeServerMessage({ type: 'error', error: 'name_taken' }), '! Lỗi: name_taken', 'error');
});

// ---------- groupBy ----------

test('groupBy: gom theo khóa, giữ thứ tự, không sửa mảng gốc', () => {
  const users = [{ n: 'An', r: 'dev' }, { n: 'Binh', r: 'ops' }, { n: 'Chi', r: 'dev' }, { n: 'Dung', r: 'dev' }];
  const copy = structuredClone(users);
  const groups = groupBy(users, (u) => u.r);
  assert.deepEqual(groups, { dev: [users[0], users[2], users[3]], ops: [users[1]] }, 'Mỗi khóa → mảng phần tử theo thứ tự xuất hiện');
  assert.equal(groups.dev[0], users[0], 'Giữ nguyên object gốc trong nhóm (không sao chép)');
  assert.deepEqual(users, copy, 'Không được sửa mảng truyền vào');
  assert.deepEqual(groupBy([], (x) => String(x)), {}, 'Mảng rỗng → {}');
  assert.deepEqual(groupBy([3, 1, 4, 1, 5], (x) => (x % 2 === 0 ? 'chẵn' : 'lẻ')), { lẻ: [3, 1, 1, 5], chẵn: [4] },
    'Dùng được cho mảng số (generic)');
});

// ---------- report.ts ----------

function runTsc() {
  const req = createRequire(join(process.cwd(), 'package.json'));
  const tscBin = join(dirname(req.resolve('typescript/package.json')), 'bin', 'tsc');
  return spawnSync(process.execPath, [tscBin, '--noEmit', '-p', process.cwd()], { encoding: 'utf8', timeout: 15000 });
}

test('report.ts: tsc --noEmit không còn lỗi, strict vẫn bật, không lách bằng any/@ts-ignore', () => {
  const tsconfig = JSON.parse(readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf8'));
  assert.equal(tsconfig.compilerOptions?.strict, true, 'tsconfig.json phải giữ "strict": true');
  const source = readFileSync(join(process.cwd(), 'report.ts'), 'utf8');
  assert.doesNotMatch(source, /\/[/*]\s*@ts-(ignore|expect-error|nocheck)/, 'Không dùng @ts-ignore / @ts-expect-error / @ts-nocheck trong report.ts');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bany\b/, 'Không dùng kiểu any trong report.ts');
  const r = runTsc();
  const out = (r.stdout + r.stderr).trim();
  assert.equal(r.status, 0, `npm run typecheck còn lỗi:\n${out.split('\n').slice(0, 6).join('\n')}`);
});

test('report.ts: summarize chạy đúng, kể cả tin của người đã bị xoá', async () => {
  const { summarize, UNKNOWN_USER } = await load('report.ts');
  assert.equal(UNKNOWN_USER, '(không rõ)', 'Giữ nguyên UNKNOWN_USER');
  const users = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh', title: 'Ops' }];
  const messages = [
    { id: 1, userId: 1, text: 'Deploy lúc 10h', ts: Date.UTC(2026, 9, 20, 8, 5) },
    { id: 2, userId: 2, text: 'Ok, mình trực ca này', ts: Date.UTC(2026, 9, 20, 8, 7) },
    { id: 3, userId: 9, text: 'Tin cũ', ts: Date.UTC(2026, 9, 20, 8, 9) },
    { id: 4, userId: 1, text: 'Xong rồi, cảm ơn cả đội', ts: Date.UTC(2026, 9, 20, 9, 30) },
  ];
  assert.deepEqual(summarize(messages, users), {
    total: 4,
    byUser: { An: 2, Binh: 1, '(không rõ)': 1 },
    longest: { from: 'An', length: 23 },
    firstAt: '08:05',
  }, 'summarize(4 tin) sai — xem docstring trong report.ts');
  const tie = [
    { id: 1, userId: 2, text: 'abc', ts: Date.UTC(2026, 9, 20, 23, 59) },
    { id: 2, userId: 1, text: 'xyz', ts: Date.UTC(2026, 9, 20, 23, 59) },
  ];
  assert.deepEqual(summarize(tie, users).longest, { from: 'Binh', length: 3 }, 'Dài bằng nhau → lấy tin xuất hiện trước');
  assert.deepEqual(summarize([], users), { total: 0, byUser: {}, longest: null, firstAt: null }, 'Không có tin → total 0, longest/firstAt null');
});
