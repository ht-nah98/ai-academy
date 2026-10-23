-- 002_channel_topic.sql — CÓ SẴN. Ví dụ migration thứ hai: thêm cột chủ đề cho kênh.
-- Migration đã chạy ở đâu đó thì KHÔNG sửa nữa; muốn đổi tiếp thì viết file 003_...sql.

ALTER TABLE channels ADD COLUMN topic text NOT NULL DEFAULT '';
