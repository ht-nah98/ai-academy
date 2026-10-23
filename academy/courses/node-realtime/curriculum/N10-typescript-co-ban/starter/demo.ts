// npm start — chạy thử các hàm của bài bằng dữ liệu mẫu. File này có sẵn.
import { describeServerMessage, groupBy, parseClientMessage } from './protocol.ts';
import { summarize } from './report.ts';
import type { ServerMessage, StoredMessage, User } from './types.ts';

const inputs = ['{"type":"join","name":"  An "}', '{"type":"chat","text":"Chào cả nhà"}', '{"type":"chat"}', '[1,2]', '{"type":"typing"}'];
for (const raw of inputs) {
  console.log(raw.padEnd(38), '→', JSON.stringify(parseClientMessage(raw)));
}

const T0 = Date.UTC(2026, 9, 20, 9, 5);
const feed: ServerMessage[] = [
  { type: 'welcome', name: 'An', users: ['An', 'Binh'] },
  { type: 'joined', name: 'Chi', users: ['An', 'Binh', 'Chi'] },
  { type: 'chat', from: 'An', text: 'Build #128 xong', ts: T0 },
  { type: 'left', name: 'Binh', users: ['An', 'Chi'] },
  { type: 'error', error: 'name_taken' },
];
console.log();
for (const msg of feed) console.log(describeServerMessage(msg));

const users: User[] = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh', title: 'Ops' }];
const stored: StoredMessage[] = [
  { id: 1, userId: 1, text: 'Deploy lúc 10h', ts: Date.UTC(2026, 9, 20, 8, 5) },
  { id: 2, userId: 2, text: 'Ok, mình trực', ts: Date.UTC(2026, 9, 20, 8, 7) },
  { id: 3, userId: 9, text: 'Tin của người đã nghỉ', ts: Date.UTC(2026, 9, 20, 8, 9) },
  { id: 4, userId: 1, text: 'Xong rồi', ts: Date.UTC(2026, 9, 20, 9, 30) },
];
console.log();
console.log('groupBy theo userId:', Object.keys(groupBy(stored, (m) => String(m.userId))));
console.log('summarize:', summarize(stored, users));
