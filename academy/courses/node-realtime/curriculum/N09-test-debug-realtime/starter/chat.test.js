// Test BẠN viết cho chat-server.js. Chạy: npm run test:mine
//
// Bài chấm (npm test) chạy file này 5 lần: với chat-server.js đúng (phải PASS hết, ít nhất 5 test),
// và với 4 bản server có lỗi (mỗi bản phải làm ít nhất 1 test của bạn FAIL). Vì vậy:
// - Đừng sửa dòng import server bên dưới: bài chấm đổi server qua biến môi trường CHAT_SERVER.
//   Bài chấm giả định bạn làm trung thực: test phải phân biệt server đúng/sai qua hành vi WebSocket.
// - Chờ tin bằng waitForMessage (không sleep cố định); gọi waitForMessage TRƯỚC khi gửi.
// - Mỗi test tự mở server cổng 0 trên 127.0.0.1 và đóng mọi thứ trong t.after().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events'; // once(ws, 'close') → Promise resolve khi ws phát 'close'
import { WebSocket } from 'ws';
import { waitForMessage } from './testkit.js';

const { createChatServer } = await import(process.env.CHAT_SERVER ?? './chat-server.js');

/** Mở server ở cổng ngẫu nhiên, trả URL /ws; tự đóng khi test xong. */
async function startServer(t) {
  const server = createChatServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });
  return `ws://127.0.0.1:${server.address().port}/ws`;
}

/** Mở client và chờ tin welcome; tự terminate khi test xong. */
async function connect(t, url, name) {
  const ws = new WebSocket(`${url}?name=${name}`);
  t.after(() => ws.terminate());
  const welcome = waitForMessage(ws, (m) => m.type === 'welcome');
  await welcome;
  return ws;
}

// Ví dụ hoàn chỉnh — đọc kỹ rồi viết 4 test còn lại theo cùng khuôn.
test('kết nối nhận welcome có id và name', async (t) => {
  const url = await startServer(t);
  const ws = new WebSocket(`${url}?name=An`);
  t.after(() => ws.terminate());
  const welcome = await waitForMessage(ws, (m) => m.type === 'welcome');
  assert.equal(welcome.name, 'An', 'welcome.name phải là tên trong ?name=');
  assert.equal(typeof welcome.id, 'number', 'welcome.id phải là số');
});

test('tin chat của một người tới người khác', async (t) => {
  // Arrange: startServer(t); An và Binh kết nối bằng connect(t, url, tên)
  // Act:     Binh BẮT ĐẦU chờ trước: const got = waitForMessage(binh, (m) => m.type === 'chat');
  //          rồi An gửi: an.send(JSON.stringify({ type: 'chat', text: '...' }))
  // Assert:  const m = await got; assert.equal cho m.from và m.text
  // TODO: viết test này theo 3 bước trên
  throw new Error('TODO: viết test này');
});

test('người gửi cũng nhận lại tin của chính mình', async (t) => {
  // Arrange: server; An kết nối (thêm một người khác cũng được)
  // Act:     An bắt đầu chờ tin chat CỦA CHÍNH MÌNH; An gửi
  // Assert:  An nhận lại đúng text đã gửi
  // TODO: viết test này theo 3 bước trên
  throw new Error('TODO: viết test này');
});

test('JSON hỏng → error bad_json, kết nối vẫn dùng được', async (t) => {
  // Arrange: server; An kết nối
  // Act 1:   An chờ {type: 'error'}; gửi chuỗi không phải JSON, vd. '{hỏng'
  // Assert 1: error === 'bad_json'
  // Act 2 + Assert 2: An chờ tin chat; gửi một tin chat hợp lệ; nhận lại được → kết nối vẫn mở, vẫn dùng được
  // TODO: viết test này theo các bước trên
  throw new Error('TODO: viết test này');
});

test('một người rời đi, những người còn lại vẫn nhận tin', async (t) => {
  // Arrange: server; An, Binh, Chi kết nối (cần cả 3: Binh rời, An gửi, Chi là người nhận KHÁC người gửi)
  // Act 1:   Binh đóng: const closed = once(binh, 'close'); binh.close(); await closed;
  //          rồi chờ thêm vài chục ms để server xử lý xong việc Binh rời (server không gửi tin báo nào)
  // Act 2:   Chi bắt đầu chờ tin chat; An gửi
  // Assert:  Chi nhận đúng text
  // TODO: viết test này theo các bước trên
  throw new Error('TODO: viết test này');
});
