// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-10-17",
  devtools: { enabled: true },

  // Nuxt UI v2 kéo theo sẵn Tailwind CSS, @nuxt/icon (Heroicons) và color-mode.
  modules: ["@nuxt/ui"],

  app: {
    head: {
      title: "Pomodoro Timer",
      htmlAttrs: { lang: "en" },
      meta: [
        { name: "description", content: "Pomodoro timer with task tracking" },
        { name: "format-detection", content: "telephone=no" },
      ],
      link: [{ rel: "icon", type: "image/png", href: "/tomato.png" }],
    },
  },

  // App dùng nền màu riêng theo chế độ (Pomodoro / Break) nên khóa ở light mode.
  colorMode: { preference: "light", fallback: "light" },

  // Module Tailwind tự thêm plugin nesting nhưng Nuxt 4 không nạp được nó từ Tailwind 3,
  // và dự án không dùng CSS nesting nên tắt để khỏi cảnh báo khi dev.
  postcss: { plugins: { "tailwindcss/nesting": false } },

  // Pre-bundle các gói Vite hay phát hiện muộn lúc dev (gây reload trang):
  // Firebase của app và client của Nuxt DevTools.
  vite: {
    optimizeDeps: {
      include: ["firebase/app", "firebase/auth", "firebase/firestore", "@vue/devtools-core"],
    },
  },

  // Cấu hình Firebase Web App (public, không phải bí mật — bảo mật nằm ở firestore.rules).
  // Nuxt tự nạp .env vào process.env khi dev/build, nên giá trị trong .env được nhúng làm
  // mặc định của bản build (giữ luồng Docker: build có .env thì chạy không cần env).
  // Khi chạy, biến môi trường NUXT_PUBLIC_FIREBASE_* (nếu có) vẫn ghi đè các mặc định này.
  runtimeConfig: {
    public: {
      firebase: {
        apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY ?? "",
        authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
        storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
        messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
        appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID ?? "",
        measurementId: process.env.NUXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
      },
    },
  },
});
