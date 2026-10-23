-- 003_message_sync.sql — N13: đồng bộ tin qua WebSocket. CÓ SẴN.
-- Nối tiếp 001 + 002 của N12 (không sửa file cũ). DB nào đã chạy N12 thì migrate chỉ áp thêm file này.
--
-- Thứ tự tin: dùng luôn messages.id (integer GENERATED ALWAYS AS IDENTITY của 001) — server cấp, tăng dần.
-- Chống trùng: client gắn client_msg_id cho mỗi tin; cùng (kênh, người gửi, client_msg_id) chỉ có MỘT dòng.
-- Tin gửi qua REST (N11) không có client_msg_id → NULL; UNIQUE coi các NULL là khác nhau nên không vướng.

ALTER TABLE messages ADD COLUMN client_msg_id text CHECK (length(client_msg_id) BETWEEN 1 AND 64);

CREATE UNIQUE INDEX messages_channel_user_client_msg_id_key ON messages (channel_id, user_id, client_msg_id);
