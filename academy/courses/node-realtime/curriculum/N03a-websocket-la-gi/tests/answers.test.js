// Test tự chấm cho bài N03a (trắc nghiệm, không viết code).
// Câu sai → thông báo giải thích VÌ SAO đáp án đúng là đúng. Đọc kỹ, đối chiếu với bài đọc, rồi sửa answers.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { answers } = await import(pathToFileURL(join(process.cwd(), 'answers.js')).href);

const QUIZ = {
  "Phần A — Vì sao cần WebSocket": [
    {
      "id": "q1",
      "title": "server có tự báo tin qua HTTP được không",
      "right": "C",
      "why": "HTTP là hỏi–đáp: server chỉ được gửi response để trả lời một request. Tin mới nằm chờ ở server tới lần hỏi kế tiếp — lý do sinh ra polling và WebSocket.",
      "wrong": {
        "A": "Kết nối có thể còn mở, nhưng HTTP chỉ cho gửi response khi có request.",
        "B": "Response không có request đi trước thì trình duyệt không nhận.",
        "D": "Trình duyệt không nghe ở cổng nào và nằm sau router, server không gọi tới được."
      }
    },
    {
      "id": "q2",
      "title": "polling 1 giây với 1.000 người",
      "right": "B",
      "why": "Mỗi người hỏi 60 lần/phút, 1.000 người × 60 = 60.000 request mỗi phút, phần lớn chỉ để nghe \"chưa có gì\" (đo trong khóa: 52% rỗng).",
      "wrong": {
        "A": "1.000 là số request trong 1 giây, chưa nhân 60 giây.",
        "C": "600.000 là con số của 10.000 người, gấp 10 lần.",
        "D": "3.600 là số lần một người hỏi trong 1 giờ."
      }
    },
    {
      "id": "q3",
      "title": "giãn polling ra 5 giây",
      "right": "A",
      "why": "Polling buộc chọn giữa tốn và chậm: hỏi thưa thì ít request, nhưng tin đến ngay sau một lần hỏi phải đợi lần sau. Đo trong khóa: 1 → 3 giây làm trễ trung bình tăng 0,42 → 1,34 giây.",
      "wrong": {
        "B": "Tin đến ngay sau một lần hỏi phải đợi tới 5 giây mới được hỏi lại.",
        "C": "Hỏi thưa hơn thì số request giảm; kích thước mỗi request không đổi.",
        "D": "Giữ request chờ là long polling, một kỹ thuật khác; polling trả lời ngay."
      }
    }
  ],
  "Phần B — WebSocket hoạt động thế nào": [
    {
      "id": "q4",
      "title": "kết nối WebSocket bắt đầu ra sao",
      "right": "D",
      "why": "WebSocket bắt đầu bằng HTTP: GET kèm \"Upgrade: websocket\" (xin đổi giao thức), server đồng ý bằng 101 Switching Protocols, rồi chính kết nối đó giữ mở cho tin hai chiều.",
      "wrong": {
        "A": "Không có cổng riêng: WebSocket bắt đầu bằng HTTP, thường cùng cổng 80/443.",
        "B": "Server không mở lời trước được (xem câu 1).",
        "C": "Đồng ý đổi giao thức là mã 101, không phải POST/200."
      }
    },
    {
      "id": "q5",
      "title": "trang https mở ws://",
      "right": "B",
      "why": "ws:// là WebSocket không mã hóa, wss:// là WebSocket qua TLS (như http/https). Trang https mở ws:// là \"mixed content\" — trình duyệt chặn luôn.",
      "wrong": {
        "A": "Trình duyệt không cho trang https dùng kết nối không mã hóa.",
        "C": "Trình duyệt không tự sửa địa chỉ; kết nối bị chặn.",
        "D": "Bị chặn ngay trong trình duyệt, request chưa tới server."
      }
    },
    {
      "id": "q6",
      "title": "một message trông như thế nào",
      "right": "A",
      "why": "WebSocket chỉ chở chữ hoặc byte, không hiểu nghĩa. Ứng dụng tự quy ước nội dung, thường là JSON có \"type\"; server đọc type để biết làm gì.",
      "wrong": {
        "B": "Sau bắt tay không còn request HTTP; mỗi tin chỉ có vài byte vỏ.",
        "C": "Qua mạng chỉ có chữ/byte; phải JSON.parse mới thành object.",
        "D": "Chuẩn WebSocket không quy định nội dung; type/from/text là quy ước của app."
      }
    }
  ],
  "Phần C — Chọn đúng công cụ": [
    {
      "id": "q7",
      "title": "sản phẩm nào cần WebSocket",
      "right": "C",
      "why": "Cần WebSocket khi server phải báo NGAY và hai bên gửi qua lại liên tục: nước đi của đối thủ phải hiện tức thì, và bạn cũng gửi nước của mình.",
      "wrong": {
        "A": "Bài mới vài lần mỗi ngày: tải lại hoặc polling thưa là đủ.",
        "B": "Lưu = gửi một lần rồi nhận kết quả: REST là đủ.",
        "D": "Tra cứu = hỏi một lần: REST là đủ."
      }
    },
    {
      "id": "q8",
      "title": "bảng giá chỉ đẩy một chiều",
      "right": "D",
      "why": "Chỉ cần server → trình duyệt, dạng chữ: SSE là HTTP thường, qua proxy dễ, trình duyệt tự kết nối lại — đơn giản hơn WebSocket.",
      "wrong": {
        "A": "SSE cũng đẩy được; luồng một chiều thì SSE đơn giản hơn.",
        "B": "10 request/giây mỗi người, phần lớn rỗng — rất tốn.",
        "C": "Chạy được, nhưng mỗi tin tốn một lượt hỏi–đáp đầy đủ."
      }
    },
    {
      "id": "q9",
      "title": "đăng nhập, đổi mật khẩu, tải lịch sử",
      "right": "B",
      "why": "WebSocket không thay REST. Việc hỏi một lần dùng REST: mã lỗi rõ, dễ cache, dễ test. Công ty thường có cả hai: REST cho thao tác, WebSocket cho báo tin ngay.",
      "wrong": {
        "A": "Dồn hết vào WebSocket thì mất mã lỗi HTTP, cache và công cụ test quen thuộc.",
        "C": "SSE để đẩy tin liên tục, không phải để hỏi một lần.",
        "D": "Thêm phức tạp không cần cho việc hỏi một lần; HTTP đã có response."
      }
    },
    {
      "id": "q10",
      "title": "Socket.IO có phải WebSocket không",
      "right": "A",
      "why": "Socket.IO là thư viện có giao thức riêng trên WebSocket (lùi về long polling khi bị chặn), thêm room, ack, tự nối lại. Server Socket.IO cần client socket.io-client (N06).",
      "wrong": {
        "B": "Client WebSocket thuần không nói chuyện được với server Socket.IO.",
        "C": "Không phải bản mới của chuẩn, và không thay REST.",
        "D": "Trình duyệt chỉ có sẵn WebSocket; Socket.IO là thư viện cài thêm."
      }
    }
  ],
  "Phần D — Đọc code công ty": [
    {
      "id": "q11",
      "title": "mở trang thì khối nào chạy",
      "right": "C",
      "why": "Bắt tay xong (101), server phát 'connection' một lần cho kết nối đó và đưa ra biến socket riêng. Handler message/close/error gắn bên trong chỉ chạy khi có tin, khi đóng, khi lỗi.",
      "wrong": {
        "A": "Bắt tay không phải message; 'message' chỉ chạy khi có tin sau khi đã mở.",
        "B": "Bắt tay không phải message; 'message' chỉ chạy khi có tin sau khi đã mở.",
        "D": "'connection' chạy ngay khi bắt tay xong, chưa cần tin nào."
      }
    },
    {
      "id": "q12",
      "title": "An gửi tin chat",
      "right": "D",
      "why": "Tin client gửi làm 'message' chạy trên kết nối của chính người gửi. Type là chat nên code gọi broadcast — gửi tới MỌI kết nối đang mở, cả phòng thấy tin của An ngay.",
      "wrong": {
        "A": "'connection' chỉ chạy lúc mới kết nối, không chạy lại mỗi tin.",
        "B": "broadcast gửi tới mọi kết nối, không chỉ người gửi.",
        "C": "'message' chỉ chạy trên kết nối của người gửi."
      }
    },
    {
      "id": "q13",
      "title": "mất Wi-Fi đột ngột",
      "right": "A",
      "why": "Mất mạng đột ngột thì không ai gửi tín hiệu đóng: kết nối chết im lặng. Chỉ khi server phát hiện (heartbeat ping/pong ở N05, hoặc hệ điều hành báo lỗi sau một lúc) thì 'close' mới chạy.",
      "wrong": {
        "B": "Không ai gửi tín hiệu đóng nên server chưa biết.",
        "C": "Không có gói nào mang lỗi tới server; mạng đứt im lặng.",
        "D": "send() chỉ ghi vào bộ đệm, thường không báo lỗi ngay."
      }
    }
  ]
};

const LETTERS = ['A', 'B', 'C', 'D'];

for (const [part, questions] of Object.entries(QUIZ)) {
  describe(part, () => {
    for (const { id, title, right, why, wrong } of questions) {
      const n = id.slice(1);
      test(`${id}: ${title}`, () => {
        assert.ok(answers && typeof answers === 'object', 'answers.js phải export const answers = { q1: ..., q2: ..., ... }');
        const raw = answers[id];
        assert.ok(raw !== null && raw !== undefined, `Câu ${n} chưa trả lời: thay null bằng một chữ 'A', 'B', 'C' hoặc 'D' (có dấu nháy).`);
        const pick = String(raw).trim().toUpperCase();
        assert.ok(LETTERS.includes(pick), `Câu ${n}: "${raw}" không phải đáp án — chỉ ghi một chữ 'A', 'B', 'C' hoặc 'D'.`);
        // assert.ok (không dùng assert.equal) để thông báo lỗi không in ra chữ cái đúng
        assert.ok(pick === right, `Câu ${n} chưa đúng (bạn chọn ${pick}). ${wrong[pick] || ''} ${why}`);
      });
    }
  });
}
