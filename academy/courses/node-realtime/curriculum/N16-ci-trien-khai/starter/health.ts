// BẠN viết: hai endpoint cho máy (load balancer, Docker, nền tảng deploy) hỏi thăm app.
import type { Express } from 'express';
import type { Db } from './db.ts';

export interface HealthDeps {
  db: Db;
  /** true từ lúc bắt đầu tắt (SIGTERM) — xem createShutdown. */
  isShuttingDown: () => boolean;
  /** Thời gian tối đa chờ DB trả lời trong /ready (mặc định 1000 ms). */
  readyTimeoutMs?: number;
}

/**
 * Đăng ký `GET /health` và `GET /ready` lên `app`.
 *
 * Yêu cầu (test chấm kiểm tra):
 * - `GET /health` (liveness — "tiến trình còn sống không?"): luôn `200 { status: 'ok' }`.
 *   KHÔNG gọi DB: DB chậm/chết không phải lý do khởi động lại app.
 * - `GET /ready` (readiness — "có nhận người dùng mới được không?"), kiểm theo thứ tự:
 *   1. `isShuttingDown()` đúng → `503 { status: 'shutting_down' }` (không cần hỏi DB);
 *   2. chạy `db.query('SELECT 1')`; lỗi (reject) HOẶC quá `readyTimeoutMs` mà chưa xong → `503 { status: 'db_unavailable' }`;
 *   3. còn lại → `200 { status: 'ready' }`.
 * - Cả hai trả header `Cache-Control: no-store` (không proxy nào được cache kết quả kiểm tra sức khoẻ).
 * - /ready bị timeout phải trả lời ngay khi hết `readyTimeoutMs`, không chờ query treo; nhớ `clearTimeout`.
 */
export function registerHealthRoutes(app: Express, deps: HealthDeps): void {
  throw new Error('TODO: registerHealthRoutes');
}
