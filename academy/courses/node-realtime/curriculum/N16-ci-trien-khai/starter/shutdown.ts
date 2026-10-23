// BẠN viết: tắt êm (graceful shutdown) khi nhận SIGTERM/SIGINT.
import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';

export interface ShutdownDeps {
  server: Server;
  wss: WebSocketServer;
  /** Đóng DB (pool Postgres / PGlite). Gọi SAU khi HTTP và WebSocket đã xong. */
  closeDb: () => Promise<void>;
  /** Chờ request/kết nối đang dở tối đa bao lâu trước khi cắt ngang. */
  timeoutMs: number;
  /** Gọi ngay đầu quá trình tắt (server.ts truyền running.beginShutdown → /ready trả 503). */
  onStart?: () => void;
  log?: (msg: string) => void;
}

/**
 * Tạo hàm `shutdown(reason)` cho server.ts gắn vào `process.on('SIGTERM')`.
 *
 * Yêu cầu (test chấm kiểm tra) — `shutdown(reason)` làm theo thứ tự:
 * 1. Gọi `onStart?.()` và `log?.(...)` có `reason`.
 * 2. Ngừng nhận kết nối mới: `server.close(cb)` — `cb` chạy khi MỌI kết nối đã đóng.
 *    Request đang chạy dở vẫn được trả lời xong (không cắt ngang).
 * 3. Mọi client WebSocket trong `wss.clients` nhận `ws.close(1001, 'server_shutdown')` (1001 = "server đang đi").
 * 4. `server.closeIdleConnections()`: đóng các kết nối keep-alive đang rảnh để `server.close` không chờ chúng.
 * 5. Chờ `cb` của bước 2, nhưng tối đa `timeoutMs`: hết giờ → `server.closeAllConnections()` và
 *    `ws.terminate()` mọi client còn lại, rồi đi tiếp. Nhớ `clearTimeout` nếu xong sớm.
 * 6. `await closeDb()` — đúng MỘT lần, sau khi HTTP/WS đã xong.
 * - Gọi `shutdown` lần hai (vd. SIGTERM rồi Ctrl+C) trả lại CÙNG Promise của lần đầu, không làm lại từ đầu.
 */
export function createShutdown(deps: ShutdownDeps): (reason: string) => Promise<void> {
  throw new Error('TODO: createShutdown');
}
