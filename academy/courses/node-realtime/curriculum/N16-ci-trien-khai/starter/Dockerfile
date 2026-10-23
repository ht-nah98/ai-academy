# Ảnh (image) chạy TeamPulse — đúng app N11–N14 + phần vận hành N16 (config.ts, health.ts, shutdown.ts). Build: docker build -t teampulse .
# Production nên ghim bản cụ thể (vd. node:22.23-slim) hoặc digest để lần build sau không tự đổi Node.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Chép riêng hai file khai báo thư viện trước: code đổi mà thư viện không đổi thì Docker dùng lại lớp đã cài.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Rồi mới chép code (.dockerignore loại node_modules, .pgdata, .env, file test...).
COPY . .

# NODE_ENV=production nên loadConfig (config.ts) bắt buộc DATABASE_URL; .pgdata chỉ dùng khi chạy với NODE_ENV khác.
RUN mkdir -p .pgdata && chown node:node .pgdata

# Không chạy bằng root: lỡ app bị chiếm quyền thì kẻ tấn công cũng chỉ là user thường.
USER node

# Trong container phải nghe 0.0.0.0: 127.0.0.1 của container chỉ là chính nó, bên ngoài không gọi vào được.
ENV HOST=0.0.0.0 PORT=3116
EXPOSE 3116
CMD ["node", "server.ts"]
