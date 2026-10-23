/**
 * TeamPulse — báo cáo tin nhắn trong ngày (code "kế thừa" của đội).
 *
 * File này ĐÃ VIẾT SẴN nhưng có 3 lỗi. Cả 3 đều làm chương trình sai hoặc sập khi chạy,
 * và cả 3 đều bị `npm run typecheck` chỉ ra TRƯỚC khi chạy (4 dòng báo lỗi: lỗi ở dòng 49 báo hai lần). Việc của bạn: chạy typecheck,
 * đọc từng lỗi, sửa cho hết lỗi — không tắt `strict`, không dùng `any`, `@ts-ignore`, `@ts-expect-error`.
 *
 * Yêu cầu của summarize (test kiểm tra đúng những điều này):
 * - `total`    — số tin.
 * - `byUser`   — tên người gửi → số tin. Tin có `userId` không còn trong `users` (người đã bị xoá)
 *                được tính cho tên `'(không rõ)'`.
 * - `longest`  — `{ from, length }` của tin có `text` dài nhất (bằng nhau thì lấy tin xuất hiện trước);
 *                không có tin → `null`.
 * - `firstAt`  — giờ:phút UTC của tin đầu tiên, dạng `'08:05'`; không có tin → `null`.
 */
import type { StoredMessage, User } from './types.ts';

export interface Summary {
  total: number;
  byUser: Record<string, number>;
  longest: { from: string; length: number } | null;
  firstAt: string | null;
}

export const UNKNOWN_USER = '(không rõ)';

function pad2(value: string): string {
  return value.padStart(2, '0');
}

function nameOf(users: User[], userId: number): string {
  return users.find((u) => u.id === userId).name;
}

export function summarize(messages: StoredMessage[], users: User[]): Summary {
  const byUser: Record<string, number> = {};
  let longest: Summary['longest'] = null;
  for (const msg of messages) {
    const from = nameOf(users, msg.userId);
    byUser[from] = (byUser[from] ?? 0) + 1;
    if (longest === null || msg.txt.length > longest.length) {
      longest = { from, length: msg.text.length };
    }
  }
  let firstAt: string | null = null;
  const first = messages[0];
  if (first !== undefined) {
    const date = new Date(first.ts);
    firstAt = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }
  return { total: messages.length, byUser, longest, firstAt };
}
