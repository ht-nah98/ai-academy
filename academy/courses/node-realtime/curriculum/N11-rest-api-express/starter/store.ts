/**
 * TeamPulse — nơi lưu kênh và tin nhắn. File này CÓ SẴN.
 *
 * `ChatStore` là một interface: app chỉ biết "có các hàm này", không biết dữ liệu nằm ở đâu.
 * Bài này dùng bản lưu trong bộ nhớ; N12 viết bản PostgreSQL cùng interface — app không phải sửa.
 */

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

/** Bản lưu trong bộ nhớ. `now` để test cố định thời gian. */
export function createMemoryStore({ now = () => Date.now() }: { now?: () => number } = {}): ChatStore {
  const channels: Channel[] = [];
  const messages: Message[] = [];
  let nextChannelId = 1;
  let nextMessageId = 1;
  const stamp = () => new Date(now()).toISOString();

  return {
    async listChannels() {
      return channels.map((c) => ({ ...c }));
    },
    async getChannel(id) {
      const found = channels.find((c) => c.id === id);
      return found === undefined ? undefined : { ...found };
    },
    async createChannel(name) {
      if (channels.some((c) => c.name === name)) return null;
      const channel: Channel = { id: nextChannelId++, name, createdAt: stamp() };
      channels.push(channel);
      return { ...channel };
    },
    async listMessages(channelId, { limit, before }) {
      const result: Message[] = [];
      for (let i = messages.length - 1; i >= 0 && result.length < limit; i--) {
        const m = messages[i]!;
        if (m.channelId !== channelId) continue;
        if (before !== undefined && m.id >= before) continue;
        result.push({ ...m });
      }
      return result;
    },
    async addMessage({ channelId, author, text }) {
      const message: Message = { id: nextMessageId++, channelId, author, text, createdAt: stamp() };
      messages.push(message);
      return { ...message };
    },
  };
}
