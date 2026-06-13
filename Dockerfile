# ---- Build stage ----
# Cài đủ dependencies, build Nuxt (nhúng biến .env vào bundle client tại đây).
FROM node:22-alpine3.18 AS build

WORKDIR /app

# Copy manifest trước để tận dụng layer cache: chỉ cài lại khi package*.json đổi.
COPY package*.json ./
RUN npm ci

# Copy phần còn lại (bao gồm .env) rồi build.
COPY . .
RUN npm run build

# ---- Runtime stage ----
# Image gọn: chỉ chứa prod deps + output build. KHÔNG chứa .env hay devDependencies.
FROM node:22-alpine3.18 AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3030

# Chỉ cài dependencies production.
COPY package*.json ./
RUN npm ci --omit=dev

# Lấy output build và file cấu hình runtime từ stage build.
COPY --from=build /app/.nuxt ./.nuxt
COPY --from=build /app/static ./static
COPY --from=build /app/nuxt.config.js ./nuxt.config.js

EXPOSE 3030

CMD [ "npm", "start" ]
