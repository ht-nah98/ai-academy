// BẠN viết: đọc cấu hình từ biến môi trường bằng zod, sai là dừng ngay (fail fast). server.ts (main) gọi loadConfig(process.env).
import { z } from 'zod';

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string | undefined;
  shutdownTimeoutMs: number;
  allowedOrigins: string[];
}

/**
 * Đọc và kiểm tra cấu hình từ `env` (truyền `process.env` khi chạy thật; test truyền object riêng).
 *
 * | Biến                  | Kiểu, giới hạn                                              | Mặc định      | → trường            |
 * |-----------------------|-------------------------------------------------------------|---------------|---------------------|
 * | `NODE_ENV`            | `development` \| `test` \| `production`                     | `development` | `nodeEnv`           |
 * | `PORT`                | số nguyên 0–65535 (0 = cổng ngẫu nhiên)                      | `3116`        | `port`              |
 * | `HOST`                | chuỗi không rỗng                                            | `127.0.0.1`   | `host`              |
 * | `DATABASE_URL`        | bắt đầu bằng `postgres://` hoặc `postgresql://`              | không có      | `databaseUrl`       |
 * | `SHUTDOWN_TIMEOUT_MS` | số nguyên 100–60000                                         | `8000`        | `shutdownTimeoutMs` |
 * | `ALLOWED_ORIGINS`     | danh sách cách nhau bằng dấu phẩy (bỏ khoảng trắng hai đầu   | `[]`          | `allowedOrigins`    |
 * |                       | mỗi mục, bỏ mục rỗng); mỗi mục là một origin dạng            |               |                     |
 * |                       | `http(s)://tên-máy[:cổng]` — không có `/` ở cuối hay đường dẫn |             |                     |
 *
 * Yêu cầu (test chấm kiểm tra):
 * - Chỉ đọc từ tham số `env`, không đọc `process.env` bên trong hàm. Biến lạ trong `env` bị bỏ qua.
 * - Giá trị là chuỗi (biến môi trường luôn là chuỗi): `'8080'` → `8080`. Chuỗi rỗng `''` coi như không đặt (dùng mặc định).
 * - `NODE_ENV=production` thì bắt buộc có `DATABASE_URL` (production không được chạy DB trong bộ nhớ / trên đĩa container).
 * - Sai bất kỳ chỗ nào → `throw new Error(...)` với message bắt đầu bằng `Cấu hình không hợp lệ` và nêu tên
 *   **mọi** biến sai (không dừng ở lỗi đầu tiên), vd. `Cấu hình không hợp lệ:\n- PORT: ...\n- DATABASE_URL: ...`.
 * - Trả object đúng 6 trường như interface `Config` (không thừa, không thiếu).
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  throw new Error('TODO: loadConfig');
}
