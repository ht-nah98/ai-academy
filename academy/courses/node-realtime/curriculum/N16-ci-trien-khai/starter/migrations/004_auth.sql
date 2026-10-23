-- 004_auth.sql — N14: đăng nhập bằng mật khẩu và phiên đăng nhập. CÓ SẴN.
-- Nối tiếp 001→003 (không sửa file cũ). DB nào đã chạy N13 thì migrate chỉ áp thêm file này.

-- Mã băm mật khẩu "scrypt$N$r$p$<salt>$<hash>" — KHÔNG BAO GIỜ lưu mật khẩu gốc.
-- Cho phép NULL: người dùng tạo ra từ tin chat ở N12–N13 chưa có mật khẩu → không đăng nhập được, tên vẫn bị giữ.
ALTER TABLE users ADD COLUMN password_hash text;

-- Phiên đăng nhập. id là chuỗi ngẫu nhiên 32 byte, nằm trong cookie tp_session.
-- Xoá dòng = đăng xuất ngay lập tức, ở mọi nơi dùng phiên đó. Xoá user → xoá luôn mọi phiên của user.
CREATE TABLE sessions (
  id         text PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
