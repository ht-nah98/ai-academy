# Ảnh (image) chạy TeamPulse — đúng app N11–N14 (server.ts → auth.ts → chat-store.ts → app.ts). Build: docker build -t teampulse .
# Production nên ghim bản cụ thể (vd. node:22.23-slim) hoặc digest để lần build sau không tự đổi Node.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Chép riêng hai file khai báo thư viện trước: code đổi mà thư viện không đổi thì Docker dùng lại lớp đã cài.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Rồi mới chép code (.dockerignore loại node_modules, .pgdata, .env, file test...).
COPY . .

# Không có DATABASE_URL thì server.ts dùng PGlite ở ./.pgdata — tạo sẵn thư mục cho user node ghi được.
RUN mkdir -p .pgdata && chown node:node .pgdata

# Không chạy bằng root: lỡ app bị chiếm quyền thì kẻ tấn công cũng chỉ là user thường.
USER node

# Trong container phải nghe 0.0.0.0: 127.0.0.1 của container chỉ là chính nó, bên ngoài không gọi vào được.
ENV HOST=0.0.0.0 PORT=3115
EXPOSE 3115
CMD ["node", "server.ts"]
