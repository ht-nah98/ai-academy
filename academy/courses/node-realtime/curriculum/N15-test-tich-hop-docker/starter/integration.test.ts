// Test tích hợp BẠN viết cho TeamPulse — app thật của N11–N14 (REST + WebSocket N13 + đăng nhập N14) + PGlite + HTTP/WS thật.
// Chạy: npm run test:mine
//
// Bài chấm (npm test) chạy file này 4 lần: với app đúng (phải PASS hết, ít nhất 4 test) và với 3 bản app có lỗi
// (mỗi bản phải làm ít nhất 1 test của bạn FAIL). Bài chấm đổi app qua TEAMPULSE_APP trong testkit.ts —
// test phải phân biệt app đúng/sai qua HÀNH VI (HTTP, WebSocket, dữ liệu), không đọc code app.
//
// Quy tắc: mỗi test gọi startTestApp(t, db) (DB về fixture, cổng 0, tự đóng) và đăng nhập bằng loginAs;
// chờ tin bằng waitForMessage, tạo Promise chờ TRƯỚC khi gửi; assert trên nội dung (id, text, author), không chỉ status.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { prepareDb } from './server.ts';
import { api, connectWs, loginAs, startTestApp, waitForMessage } from './testkit.ts';

// Một DB cho cả file (khởi động PGlite ~1 giây, migration 001→004 một lần); mỗi test tự reset qua startTestApp.
const db = new PGlite();
before(async () => {
  await prepareDb(db);
});
after(async () => {
  await db.close();
});

// Ví dụ hoàn chỉnh — đọc kỹ rồi viết 3 test còn lại theo cùng khuôn.
test('POST tạo tin, GET đọc lại, author lấy từ phiên đăng nhập', async (t) => {
  // Arrange: app sạch, An đăng nhập
  const { baseUrl } = await startTestApp(t, db);
  const an = await loginAs(baseUrl, 'an_le');
  // Act: hai tin qua REST (author trong body bị server thay bằng tên trong phiên — N14)
  const first = await api(baseUrl, '/channels/1/messages', { method: 'POST', cookie: an, body: { author: 'giam_doc', text: 'Chào cả nhóm' } });
  const second = await api(baseUrl, '/channels/1/messages', { method: 'POST', cookie: an, body: { text: 'Có ai không?' } });
  const list = await api(baseUrl, '/channels/1/messages', { cookie: an });
  // Assert
  assert.equal(first.status, 201, 'POST tin mới phải trả 201');
  assert.equal(first.body.id, 1, 'DB vừa reset nên tin đầu tiên có id 1');
  assert.equal(first.body.author, 'an_le', 'author là username của phiên, không phải "giam_doc" trong body');
  assert.equal(second.body.id, 2, 'tin thứ hai có id 2');
  assert.equal(list.status, 200, 'GET phải trả 200');
  assert.deepEqual(list.body.items.map((m: { text: string }) => m.text), ['Có ai không?', 'Chào cả nhóm'], 'GET trả tin mới nhất trước (N11)');
});

test('tin gửi qua WebSocket được lưu vào DB (GET thấy)', async (t) => {
  // Arrange: startTestApp; An đăng nhập (loginAs) và kết nối bằng connectWs(t, wsUrl, { cookie })
  // Act:     An BẮT ĐẦU chờ tin ack có đúng clientMsgId của mình (server chỉ ack SAU khi đã lưu), rồi gửi
  //          { type: 'chat', clientMsgId: '...', text: '...' }; await lời chờ
  // Assert:  GET /channels/1/messages có đúng một tin: text đúng, author 'an_le', id trùng id trong ack
  // TODO: viết test này theo các bước trên
  throw new Error('TODO: viết test này');
});

test('tin POST qua REST tới client WebSocket đang mở', async (t) => {
  // Arrange: startTestApp; An và Binh đăng nhập; Binh kết nối WS vào kênh 1
  // Act:     Binh BẮT ĐẦU chờ tin { type: 'message' }; An POST một tin qua REST
  // Assert:  tin Binh nhận có id, text, author khớp body của POST
  // TODO: viết test này theo các bước trên
  throw new Error('TODO: viết test này');
});

test('kết nối lại với lastSeenId chỉ nhận tin còn thiếu', async (t) => {
  // Arrange: startTestApp; An POST 3 tin (id 1, 2, 3); Chi đăng nhập
  // Act:     Chi kết nối với lastSeenId = 2 (Chi đã thấy tới tin 2)
  // Assert:  missed có ĐÚNG MỘT tin là tin id 3 (không lặp tin 2, không thiếu tin 3); synced.lastId là 3
  // TODO: viết test này theo các bước trên
  throw new Error('TODO: viết test này');
});
