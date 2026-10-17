# ---- Build stage ----
# Cài đủ dependencies và build Nuxt (Nitro) ra thư mục .output.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifest trước để tận dụng layer cache: chỉ cài lại khi package*.json đổi.
COPY package*.json ./
RUN npm ci

# Copy phần còn lại rồi build. Nếu có .env, các giá trị NUXT_PUBLIC_* được nhúng làm
# mặc định của runtimeConfig; vẫn có thể ghi đè bằng biến môi trường lúc chạy container.
COPY . .
RUN npm run build

# ---- Runtime stage ----
# .output của Nitro tự chứa đủ dependencies: không cần node_modules, npm hay .env.
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3030

COPY --from=build /app/.output ./.output

EXPOSE 3030

CMD [ "node", ".output/server/index.mjs" ]
