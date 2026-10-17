# Pomodoro Timer

Ứng dụng Pomodoro kèm danh sách task, đăng nhập Google và lưu dữ liệu trên Firestore.

**Stack:** Nuxt 4 · Nuxt UI 4 (Tailwind CSS v4, Lucide) · Firebase (Auth + Firestore) · TypeScript

## Chạy local

```bash
npm install
cp .env.example .env   # điền cấu hình Firebase Web App
npm run dev            # http://localhost:3000
```

Các lệnh khác: `npm run build` (build production ra `.output/`), `npm run preview`
(chạy thử bản build), `npm run typecheck` (kiểm tra TypeScript).

## Cấu hình

- Biến môi trường `NUXT_PUBLIC_FIREBASE_*` (xem [.env.example](.env.example)) ánh xạ vào
  `runtimeConfig.public.firebase` trong [nuxt.config.ts](nuxt.config.ts).
- Firestore Security Rules nằm ở [firestore.rules](firestore.rules). Mỗi task chỉ thuộc về
  người tạo (`userId == auth.uid`). Deploy bằng
  `npx firebase-tools deploy --only firestore:rules` hoặc dán vào Firebase Console.

## Docker

```bash
docker build -t pomodoro .
docker run -p 3030:3030 --env-file .env pomodoro
```

## Cấu trúc

```
app/
  components/   TimerCard, TaskItem, TaskForm, Icons/*
  composables/  useAuth, useTasks, useMode, useErrorToast
  layouts/      default (header + nền theo chế độ)
  pages/        index (timer + tasks)
  plugins/      firebase.client (khởi tạo Firebase, đồng bộ trạng thái đăng nhập)
  utils/        modes (cấu hình Pomodoro / Short Break / Long Break)
public/         tomato.png, alert.mp3, lofi.mp3
```
