// Test tự chấm cho bài N16 — loadConfig (config.ts).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { loadConfig } = await import(pathToFileURL(join(process.cwd(), 'config.ts')).href);

/** Gọi loadConfig, trả message lỗi (hoặc null nếu không ném). */
function errorOf(env) {
  try {
    loadConfig(env);
    return null;
  } catch (err) {
    return String(err?.message ?? err);
  }
}

describe('loadConfig', () => {
  test('loadConfig: env rỗng → đủ 6 trường với giá trị mặc định', () => {
    assert.deepEqual(loadConfig({}), {
      nodeEnv: 'development', port: 3116, host: '127.0.0.1', databaseUrl: undefined, shutdownTimeoutMs: 8000, allowedOrigins: [],
    }, 'loadConfig({}) phải trả đúng mặc định trong bảng của docstring (đúng 6 trường)');
  });

  test('loadConfig: đổi chuỗi sang số và danh sách, chuỗi rỗng = chưa đặt, bỏ qua biến lạ', () => {
    const c = loadConfig({
      NODE_ENV: 'test', PORT: '8080', HOST: '0.0.0.0', DATABASE_URL: 'postgresql://u:p@db:5432/x',
      SHUTDOWN_TIMEOUT_MS: '2500', ALLOWED_ORIGINS: ' https://teampulse.example.vn, http://localhost:8080,', PATH: '/usr/bin', HOME: '/home/an',
    });
    assert.deepEqual(c, {
      nodeEnv: 'test', port: 8080, host: '0.0.0.0', databaseUrl: 'postgresql://u:p@db:5432/x', shutdownTimeoutMs: 2500,
      allowedOrigins: ['https://teampulse.example.vn', 'http://localhost:8080'],
    }, "PORT '8080' phải thành số 8080; ALLOWED_ORIGINS tách theo dấu phẩy, bỏ khoảng trắng và mục rỗng; biến lạ (PATH, HOME) không xuất hiện");
    assert.equal(loadConfig({ PORT: '' }).port, 3116, "PORT='' phải coi như chưa đặt → mặc định 3116");
    assert.deepEqual(loadConfig({ ALLOWED_ORIGINS: '' }).allowedOrigins, [], "ALLOWED_ORIGINS='' → []");
    assert.equal(loadConfig({ PORT: '0' }).port, 0, 'PORT=0 hợp lệ (cổng ngẫu nhiên)');
  });

  test('loadConfig: chỉ đọc tham số env, không đọc process.env', () => {
    const old = process.env.PORT;
    process.env.PORT = '1234';
    try {
      assert.equal(loadConfig({}).port, 3116, 'loadConfig({}) không được lấy PORT từ process.env');
    } finally {
      if (old === undefined) delete process.env.PORT;
      else process.env.PORT = old;
    }
  });

  test('loadConfig: sai → ném lỗi "Cấu hình không hợp lệ" nêu MỌI biến sai', () => {
    const msg = errorOf({ PORT: 'abc', SHUTDOWN_TIMEOUT_MS: '-5', NODE_ENV: 'staging', ALLOWED_ORIGINS: 'https://teampulse.example.vn/' });
    assert.notEqual(msg, null, 'PORT=abc phải làm loadConfig ném lỗi');
    assert.match(msg, /^Cấu hình không hợp lệ/, 'message phải bắt đầu bằng "Cấu hình không hợp lệ"');
    for (const name of ['PORT', 'SHUTDOWN_TIMEOUT_MS', 'NODE_ENV', 'ALLOWED_ORIGINS']) {
      assert.ok(msg.includes(name), `message phải nêu ${name} (nêu mọi biến sai, không dừng ở lỗi đầu): ${msg}`);
    }
    assert.notEqual(errorOf({ PORT: '70000' }), null, 'PORT=70000 (> 65535) phải bị từ chối');
    assert.notEqual(errorOf({ PORT: '80.5' }), null, 'PORT=80.5 (không nguyên) phải bị từ chối');
    assert.notEqual(errorOf({ SHUTDOWN_TIMEOUT_MS: '50' }), null, 'SHUTDOWN_TIMEOUT_MS=50 (< 100) phải bị từ chối');
    assert.notEqual(errorOf({ ALLOWED_ORIGINS: 'teampulse.example.vn' }), null, 'ALLOWED_ORIGINS thiếu http(s):// phải bị từ chối');
    assert.notEqual(errorOf({ ALLOWED_ORIGINS: 'https://teampulse.example.vn/chat' }), null, 'origin không có đường dẫn — "/chat" phải bị từ chối');
  });

  test('loadConfig: production bắt buộc DATABASE_URL dạng postgres://', () => {
    const missing = errorOf({ NODE_ENV: 'production' });
    assert.notEqual(missing, null, 'NODE_ENV=production mà thiếu DATABASE_URL phải ném lỗi');
    assert.ok(missing.includes('DATABASE_URL'), `lỗi phải nêu DATABASE_URL: ${missing}`);
    const wrong = errorOf({ DATABASE_URL: 'mysql://u:p@db/x' });
    assert.ok(wrong && wrong.includes('DATABASE_URL'), 'DATABASE_URL không bắt đầu bằng postgres:// phải bị từ chối');
    const ok = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db:5432/x' });
    assert.equal(ok.databaseUrl, 'postgres://u:p@db:5432/x', 'production có DATABASE_URL hợp lệ thì chạy được');
  });
});
