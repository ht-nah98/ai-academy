// Test tự chấm cho bài N16 — .github/workflows/ci.yml.
// Không có thư viện YAML: bài chấm đọc file như văn bản và kiểm các khoá/lệnh bắt buộc bằng biểu thức chính quy.
// Luật đọc (ghi cả trong chú thích của starter ci.yml):
//   - Dòng bắt đầu bằng # bị bỏ qua; chú thích cuối dòng ("test:   # job chính") được phép.
//   - Lệnh là giá trị của "run:": một dòng ("- run: npm ci") hoặc khối nhiều dòng ("run: |" rồi mỗi dòng thụt sâu hơn
//     là một lệnh). Thứ tự lệnh tính theo dòng xuất hiện đầu tiên.
// Đây là kiểm tra "có đủ thành phần", không thay được việc chạy thật trên GitHub (xem Bước 5 của bài).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.cwd(), '.github', 'workflows', 'ci.yml');
const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';

/** Bỏ chú thích: cả dòng "# ..." và phần " # ..." ở cuối dòng (khi # không nằm trong dấu nháy). */
function stripComment(line) {
  if (/^\s*#/.test(line)) return '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && i > 0 && /\s/.test(line[i - 1])) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

const lines = raw.split(/\r?\n/).map(stripComment);
const yml = lines.join('\n');

/** Mọi lệnh trong các "run:" — { cmd, line }. */
const commands = [];
for (let i = 0; i < lines.length; i += 1) {
  const m = lines[i].match(/^(\s*(?:-\s+)?)run:\s*(.*)$/);
  if (!m) continue;
  const value = m[2].trim();
  if (/^[|>][-+]?\d*$/.test(value)) {
    const keyIndent = m[1].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() === '') continue;
      const indent = lines[j].match(/^\s*/)[0].length;
      if (indent <= keyIndent) break;
      commands.push({ cmd: lines[j].trim(), line: j });
    }
  } else if (value !== '') {
    commands.push({ cmd: value.replace(/^(["'])(.*)\1$/, '$2'), line: i });
  }
}

function need(re, msg) {
  assert.ok(existsSync(file), 'Không thấy .github/workflows/ci.yml');
  assert.match(yml, re, msg);
}

/** Dòng của lệnh đầu tiên khớp re (−1 nếu không có). */
const cmdLine = (re, from = 0) => commands.find((c) => c.line >= from && re.test(c.cmd))?.line ?? -1;
function needCmd(re, msg, from = 0) {
  assert.ok(existsSync(file), 'Không thấy .github/workflows/ci.yml');
  assert.ok(cmdLine(re, from) !== -1, msg);
}
/** Dòng đầu tiên của file (đã bỏ chú thích) khớp re (−1 nếu không có). */
const lineOf = (re) => lines.findIndex((l) => re.test(l));

describe('ci.yml', () => {
  test('ci.yml: chạy khi push và pull_request; job test trên ubuntu; thụt lề không dùng tab', () => {
    assert.ok(existsSync(file), 'Không thấy .github/workflows/ci.yml');
    assert.ok(!raw.includes('\t'), 'YAML cấm ký tự tab — thụt lề bằng dấu cách');
    need(/^on:/m, 'Cần khoá "on:" ở đầu dòng (sự kiện kích hoạt workflow)');
    need(/^\s+push:|^on:.*\bpush\b/m, 'Workflow phải chạy khi push');
    need(/^\s+pull_request:|^on:.*\bpull_request\b/m, 'Workflow phải chạy khi có pull_request');
    need(/^jobs:/m, 'Cần khoá "jobs:" ở đầu dòng');
    need(/^\s+test:\s*$/m, 'Cần một job tên "test"');
    need(/runs-on:\s*ubuntu-/, 'Job phải chạy trên ubuntu (runs-on: ubuntu-latest)');
  });

  test('ci.yml: checkout → setup-node 22 (cache npm) → npm ci → typecheck → test:mine → docker build, đúng thứ tự', () => {
    need(/uses:\s*actions\/checkout@v\d+/, 'Cần bước uses: actions/checkout@v<số>');
    need(/uses:\s*actions\/setup-node@v\d+/, 'Cần bước uses: actions/setup-node@v<số>');
    need(/node-version:\s*['"]?22\b/, 'setup-node phải dùng node-version: 22');
    need(/cache:\s*['"]?npm\b/, 'setup-node nên bật cache: npm');
    needCmd(/^npm ci\b/, 'Cần lệnh npm ci trong một run: (cài đúng theo package-lock.json)');
    needCmd(/^npm run typecheck\b/, 'Cần lệnh npm run typecheck trong một run:');
    needCmd(/^npm run test:mine\b/, 'Cần lệnh npm run test:mine trong một run: (npm test là bài chấm, không có trong repo của bạn)');
    needCmd(/^docker build\b/, 'Cần lệnh docker build ... trong một run: (chắc chắn image build được)');
    const order = [
      ['actions/checkout', lineOf(/uses:\s*actions\/checkout@/)],
      ['actions/setup-node', lineOf(/uses:\s*actions\/setup-node@/)],
      ['npm ci', cmdLine(/^npm ci\b/)],
      ['npm run typecheck', cmdLine(/^npm run typecheck\b/)],
      ['npm run test:mine', cmdLine(/^npm run test:mine\b/)],
    ];
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(order[i - 1][1] < order[i][1], `Sai thứ tự: ${order[i - 1][0]} phải đứng trước ${order[i][0]}`);
    }
  });

  test('ci.yml: service postgres có healthcheck; npm run migrate với DATABASE_URL trỏ tới localhost:5432', () => {
    need(/^\s+services:\s*$/m, 'Job test cần khoá services:');
    need(/^\s+postgres:\s*$/m, 'services cần một service tên postgres');
    need(/image:\s*['"]?postgres:\d+/, 'Service postgres dùng image postgres:<phiên bản>, vd. postgres:17-alpine');
    need(/POSTGRES_PASSWORD:/, 'Service postgres cần POSTGRES_PASSWORD (image postgres bắt buộc)');
    need(/--health-cmd\s+['"]?pg_isready/, 'Service postgres cần options --health-cmd "pg_isready ..." để job chờ DB sẵn sàng');
    need(/['"]?5432:5432['"]?/, 'Service postgres cần mở cổng 5432:5432 để bước migrate gọi được localhost:5432');
    needCmd(/^npm run migrate\b/, 'Cần lệnh npm run migrate trong một run: (chạy migration trên Postgres thật)');
    need(/DATABASE_URL:\s*['"]?postgres(ql)?:\/\/[^\s'"]*@localhost:5432\//, 'Bước migrate cần env DATABASE_URL: postgres://...@localhost:5432/<db>');
    assert.ok(cmdLine(/^npm run test:mine\b/) < cmdLine(/^npm run migrate\b/), 'migrate nên chạy sau test:mine');
  });

  test('ci.yml: job deploy sau test, chỉ trên main, URL deploy lấy từ secrets', () => {
    need(/^\s+deploy:\s*$/m, 'Cần một job tên "deploy"');
    const start = lineOf(/^\s+deploy:\s*$/);
    const deploy = lines.slice(start).join('\n');
    assert.match(deploy, /needs:\s*\[?\s*['"]?test\b/, 'Job deploy cần needs: test (chỉ deploy khi test xanh)');
    assert.match(deploy, /if:.*github\.ref\s*==\s*['"]refs\/heads\/main['"]/, "Job deploy cần if: github.ref == 'refs/heads/main'");
    assert.match(deploy, /\$\{\{\s*secrets\.DEPLOY_HOOK_URL\s*\}\}/, 'URL deploy phải lấy từ ${{ secrets.DEPLOY_HOOK_URL }}');
    assert.ok(cmdLine(/^curl\b/, start) !== -1, 'Job deploy gọi deploy hook bằng lệnh curl trong một run:');
    assert.doesNotMatch(yml, /curl[^\n]*https?:\/\//, 'Không ghi URL thật sau curl — URL deploy hook là bí mật, để trong secrets');
    assert.doesNotMatch(raw, /nvapi-|ghp_[A-Za-z0-9]{10,}|srv-[a-z0-9]{10,}/, 'Không ghi khoá/token thật trong workflow');
  });
});
