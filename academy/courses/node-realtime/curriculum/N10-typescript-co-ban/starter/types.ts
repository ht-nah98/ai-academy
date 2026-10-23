/**
 * TeamPulse — kiểu dữ liệu của giao thức tin nhắn (cùng giao thức JSON với N04).
 * File này CÓ SẴN, chỉ chứa kiểu: Node xoá hết khi chạy, tsc dùng để kiểm tra.
 *
 *   Client → server                 Server → client
 *   {type:"join", name}             {type:"welcome", name, users}
 *   {type:"chat", text}             {type:"joined",  name, users}
 *                                   {type:"left",    name, users}
 *                                   {type:"chat",    from, text, ts}
 *                                   {type:"error",   error}
 */

export const MAX_NAME = 20;
export const MAX_TEXT = 500;

/** Tin client gửi lên — union phân biệt theo trường `type`. */
export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'chat'; text: string };

/** Mã lỗi khi đọc tin client. Union các chuỗi cố định (thay cho enum). */
export type ParseError = 'invalid_json' | 'unknown_type' | 'invalid_name' | 'invalid_text';

/** Kết quả đọc tin: thành công có `msg`, thất bại có `error` — `ok` là trường phân biệt. */
export type ParseResult =
  | { ok: true; msg: ClientMessage }
  | { ok: false; error: ParseError };

export interface WelcomeMessage {
  type: 'welcome';
  name: string;
  users: string[];
}

export interface PresenceMessage {
  type: 'joined' | 'left';
  name: string;
  users: string[];
}

export interface ChatMessage {
  type: 'chat';
  from: string;
  text: string;
  /** mili giây Unix, như Date.now() */
  ts: number;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

/** Mọi tin server gửi xuống. */
export type ServerMessage = WelcomeMessage | PresenceMessage | ChatMessage | ErrorMessage;

/** Bản ghi tin đã lưu (dùng trong report.ts). */
export interface StoredMessage {
  id: number;
  userId: number;
  text: string;
  ts: number;
}

export interface User {
  id: number;
  name: string;
  /** không bắt buộc: người dùng chưa đặt thì không có trường này */
  title?: string;
}
