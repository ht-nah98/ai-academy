/**
 * TeamPulse — Bài N03a: WebSocket là gì, vì sao cần? (không phải lập trình)
 *
 * Cách làm: đọc câu hỏi trong chú thích phía trên mỗi dòng, rồi thay `null` bằng MỘT chữ cái
 * trong dấu nháy: 'A', 'B', 'C' hoặc 'D'.  Ví dụ:  q1: 'A',
 * Chấm: bấm "Chạy test" (hoặc `npm test`). Câu sai sẽ hiện lời giải thích vì sao — đọc nó, rồi sửa.
 *
 * Phần D có một đoạn code thật kiểu công ty. Bạn KHÔNG cần viết code, chỉ cần đọc các dòng có
 * số (1), (2), (3), (4) và biết dòng nào chạy khi nào.
 */
export const answers = {
  // ───────────── Phần A — Vì sao cần WebSocket ─────────────

  /**
   * Câu 1. Trang chat dùng HTTP thường (hỏi–đáp). Server vừa nhận được tin mới cho bạn, nhưng trình
   * duyệt của bạn chưa gửi request nào. Lúc này server làm được gì?
   *   A. Gửi ngay tin đó, vì kết nối TCP của lần hỏi trước vẫn còn mở.
   *   B. Gửi một response mới; trình duyệt nhận vì vẫn đang mở trang.
   *   C. Chưa làm được gì: đợi trình duyệt hỏi lần sau rồi trả lời kèm tin.
   *   D. Mở một kết nối mới từ server tới trình duyệt theo địa chỉ IP của nó.
   */
  q1: null,

  /**
   * Câu 2. 1.000 người cùng mở trang, mỗi trình duyệt polling ("có gì mới không?") 1 giây một lần.
   * Trong 1 phút, server phải trả lời khoảng bao nhiêu request chỉ để báo tin?
   *   A. Khoảng 1.000 request.
   *   B. Khoảng 60.000 request.
   *   C. Khoảng 600.000 request.
   *   D. Khoảng 3.600 request.
   */
  q2: null,

  /**
   * Câu 3. Thấy polling 1 giây tốn quá, bạn đổi thành 5 giây một lần. Điều gì xảy ra?
   *   A. Ít request hơn, nhưng tin có thể đến trễ tới gần 5 giây.
   *   B. Ít request hơn, và tin vẫn đến chậm nhất trong 1 giây.
   *   C. Số request giữ nguyên, chỉ là mỗi request nhẹ hơn.
   *   D. Ít request hơn, vì server giữ request chờ tới khi có tin.
   */
  q3: null,

  // ───────────── Phần B — WebSocket hoạt động thế nào ─────────────

  /**
   * Câu 4. Một kết nối WebSocket BẮT ĐẦU như thế nào?
   *   A. Trình duyệt mở kết nối TCP tới một cổng riêng và gửi ngay tin đầu.
   *   B. Server gửi lời mời tới trình duyệt ngay khi trang vừa tải xong.
   *   C. Trình duyệt gửi POST /ws, server trả 200 OK kèm một mã phiên.
   *   D. Trình duyệt gửi GET kèm "Upgrade: websocket", server trả 101.
   */
  q4: null,

  /**
   * Câu 5. Trang TeamPulse chạy ở https://teampulse.example. Code trên trang mở new
   * WebSocket('ws://teampulse.example/ws'). Điều gì xảy ra?
   *   A. Chạy được, nhưng tin đi không mã hóa nên chậm hơn một chút.
   *   B. Bị chặn ("mixed content"); trang https phải dùng wss://.
   *   C. Trình duyệt tự đổi ws:// thành wss:// rồi kết nối bình thường.
   *   D. Kết nối tới được server, nhưng server từ chối bằng mã 403.
   */
  q5: null,

  /**
   * Câu 6. Một "tin" (message) đi trên kết nối WebSocket của TeamPulse trông như thế nào?
   *   A. Chữ, thường là JSON như {"type":"chat","text":"hi"}, tự quy ước.
   *   B. Một request HTTP thu gọn, có method, đường dẫn và header riêng.
   *   C. Một object JavaScript, server nhận được là dùng ngay không cần đọc.
   *   D. Gói byte mà chuẩn WebSocket quy định sẵn các trường type, from, text.
   */
  q6: null,

  // ───────────── Phần C — Chọn đúng công cụ ─────────────

  /**
   * Câu 7. Sản phẩm nào CẦN WebSocket nhất?
   *   A. Trang tin tức, bài mới đăng vài lần mỗi ngày.
   *   B. Trang hồ sơ cá nhân có nút "Lưu thay đổi".
   *   C. Game cờ online, hai người đi nước liên tục.
   *   D. Trang tra cứu hóa đơn điện theo từng tháng.
   */
  q7: null,

  /**
   * Câu 8. Bảng giá coin: server có giá mới mỗi giây, người xem chỉ xem, không gửi gì lên. Cách nào
   * ĐƠN GIẢN nhất mà vẫn nhận giá ngay?
   *   A. WebSocket, vì chỉ WebSocket mới cho server đẩy tin xuống.
   *   B. Polling mỗi 100 ms để không bỏ lỡ lần đổi giá nào.
   *   C. Long polling: mỗi lần đổi giá trả về, rồi hỏi lại.
   *   D. SSE: server đẩy một chiều qua response HTTP giữ mở.
   */
  q8: null,

  /**
   * Câu 9. Đăng nhập, đổi mật khẩu, tải danh sách đơn hàng tháng trước. Nên làm bằng gì?
   *   A. WebSocket cho tất cả, để chỉ phải giữ một loại kết nối.
   *   B. REST API; WebSocket chỉ cho phần cần báo tin ngay.
   *   C. SSE, vì server chỉ cần trả kết quả xuống một chiều.
   *   D. Socket.IO có ack, để chắc chắn server đã nhận được.
   */
  q9: null,

  /**
   * Câu 10. Câu nào ĐÚNG về Socket.IO?
   *   A. Thư viện có giao thức riêng trên WebSocket, cần client riêng.
   *   B. Tên gọi khác của WebSocket, do thư viện phía trình duyệt đặt ra.
   *   C. Bản WebSocket đời mới hơn, thay thế được luôn cả REST API.
   *   D. Chuẩn có sẵn trong trình duyệt, dùng bằng new SocketIO(url).
   */
  q10: null,

  // ───────────── Phần D — Đọc code công ty ─────────────
  //
  //   const online = new Map();                       // kết nối → tên người dùng
  //   wss.on('connection', (socket) => {              // (1)
  //     socket.on('message', (raw) => {               // (2)
  //       const msg = JSON.parse(raw);
  //       if (msg.type === 'join') online.set(socket, msg.name);
  //       if (msg.type === 'chat') broadcast({ type: 'chat', from: online.get(socket), text: msg.text });
  //     });
  //     socket.on('close', () => {                    // (3)
  //       broadcast({ type: 'left', name: online.get(socket) });
  //       online.delete(socket);
  //     });
  //     socket.on('error', (err) => log.warn(err));   // (4)
  //   });
  //
  //   (broadcast(obj) = gửi obj dạng JSON tới MỌI kết nối đang mở)

  /**
   * Câu 11. Một nhân viên vừa mở trang TeamPulse; trình duyệt chạy new WebSocket(url) và bắt tay
   * thành công. Trên server, khối nào chạy?
   *   A. (2) 'message', vì trình duyệt vừa gửi request bắt tay.
   *   B. Cả (1) và (2), vì bắt tay cũng tính là một tin.
   *   C. (1) 'connection', một lần cho kết nối mới này.
   *   D. Chưa khối nào, tới khi người dùng gửi tin đầu tiên.
   */
  q11: null,

  /**
   * Câu 12. An (đã join) gửi {"type":"chat","text":"hi"}. Điều gì xảy ra trên server?
   *   A. (1) chạy lại cho kết nối của An, rồi (2) xử lý tin đó.
   *   B. (2) chạy cho kết nối của An; chỉ An nhận lại được tin.
   *   C. (2) chạy cho mọi kết nối, mỗi người xử lý tin một lần.
   *   D. (2) chạy cho kết nối An; broadcast gửi tới mọi người.
   */
  q12: null,

  /**
   * Câu 13. Binh đang online thì laptop mất Wi-Fi đột ngột (không đóng tab, không gửi gì). Ngay giây
   * đó, trên server điều gì có thể xảy ra?
   *   A. Có thể chưa gì chạy: server vẫn tưởng Binh còn online.
   *   B. (3) 'close' chạy ngay, server xóa Binh khỏi danh sách online.
   *   C. (4) 'error' chạy ngay với lỗi mất mạng, rồi tới (3) 'close'.
   *   D. Lần broadcast kế tiếp tới Binh báo lỗi ngay, nên (3) chạy.
   */
  q13: null,
};
