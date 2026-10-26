# Pomodoro Timer

Nhiệm vụ hằng ngày: tích hoàn thành, phạt khi bỏ lỡ, thưởng và rương khi xong hết, kèm tab Pomodoro. Đăng nhập Firebase, dữ liệu trên Firestore.

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
- Firestore Security Rules nằm ở [firestore.rules](firestore.rules): dữ liệu theo workspace, thành viên
  có quyền xem / thêm / sửa. Deploy bằng `npx firebase-tools deploy --only firestore:rules` hoặc dán vào Firebase Console.
- Ảnh đại diện lưu trên Cloudinary (`NUXT_PUBLIC_CLOUDINARY_*`, unsigned upload preset, tùy chọn).
- Link chia sẻ và nhắc đẩy cần server: `NUXT_FIREBASE_SERVICE_ACCOUNT` (service account JSON),
  khóa VAPID (`NUXT_PUBLIC_VAPID_PUBLIC_KEY`, `NUXT_VAPID_PRIVATE_KEY`, `NUXT_VAPID_SUBJECT`).
  Trên Netlify, `netlify/functions/reminders.mts` chạy mỗi phút để gửi nhắc; nơi khác gọi
  `/api/cron/reminders` với header `x-cron-secret` (`NUXT_CRON_SECRET`) bằng cron ngoài.
- Thiết kế và lộ trình: [docs/plan.md](docs/plan.md).

## Docker

```bash
docker build -t pomodoro .
docker run -p 3030:3030 --env-file .env pomodoro
```

## Cấu trúc

```
app/
  components/   MainTaskRow, SideTaskRow, SideTaskInput, MainTaskForm, SideTaskForm, TreasureChest,
                ChestRewardModal, SubAccountForm, TimerCard, StatTile, AppTabBar, Icons/*
  composables/  useAuth, useWorkspace, useTasks, useDay, useHistory, useMembers, useRestart,
                useImageUpload, usePush, useSpeech, useReminders, usePomodoro, useMode
  pages/        index (Hôm nay), journal, stats, pomodoro, settings, login, share/[token]
  plugins/      firebase.client
shared/utils/   dates, models, stats (dùng chung app + server)
server/         api/share/[token], api/cron/reminders, lib/reminders
netlify/        functions/reminders.mts (scheduled, mỗi phút)
public/         icons, push-handler.js, alert.mp3, lofi.mp3
```
