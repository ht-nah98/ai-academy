/** Interface ChatStore — giống hệt store.ts của N11. File này CÓ SẴN. */

export interface Channel {
  id: number;
  name: string;
  /** ISO 8601, vd. "2026-10-20T08:00:00.000Z" */
  createdAt: string;
}

export interface Message {
  id: number;
  channelId: number;
  author: string;
  text: string;
  createdAt: string;
}

export interface NewMessage {
  channelId: number;
  author: string;
  text: string;
}

export interface ChatStore {
  listChannels(): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  /** Trả `null` nếu tên kênh đã tồn tại. */
  createChannel(name: string): Promise<Channel | null>;
  /** Tin của kênh, MỚI NHẤT TRƯỚC (id giảm dần), chỉ tin có `id < before` (nếu có), tối đa `limit` tin. */
  listMessages(channelId: number, opts: { limit: number; before?: number }): Promise<Message[]>;
  addMessage(input: NewMessage): Promise<Message>;
}
