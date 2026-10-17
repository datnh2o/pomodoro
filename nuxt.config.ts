// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-10-17",
  devtools: { enabled: true },

  // App chạy hoàn toàn sau đăng nhập Firebase (chỉ có ở client) nên dùng SPA:
  // không cần SSR, tránh lệch server/client và đơn giản hóa chặn route theo đăng nhập.
  ssr: false,

  // Nuxt UI 4 kéo theo sẵn Tailwind CSS v4, @nuxt/icon (Lucide) và color-mode.
  modules: ["@nuxt/ui", "@vite-pwa/nuxt"],
  css: ["~/assets/css/main.css"],

  app: {
    head: {
      title: "Nhiệm vụ hằng ngày",
      htmlAttrs: { lang: "vi" },
      meta: [
        { name: "description", content: "Theo dõi nhiệm vụ hằng ngày, chứng minh bằng ảnh, phạt khi bỏ lỡ" },
        { name: "format-detection", content: "telephone=no" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        { name: "theme-color", content: "#BA4949" },
      ],
      link: [
        { rel: "icon", type: "image/png", href: "/tomato.png" },
        { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      ],
    },
  },

  // PWA: thêm ra màn hình chính iPhone, cache shell để mở nhanh.
  pwa: {
    registerType: "autoUpdate",
    manifest: {
      name: "Nhiệm vụ hằng ngày",
      short_name: "Nhiệm vụ",
      lang: "vi",
      display: "standalone",
      start_url: "/",
      theme_color: "#BA4949",
      background_color: "#ffffff",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    workbox: {
      navigateFallback: "/",
      navigateFallbackDenylist: [/^\/api\//],
      // Không precache file nhạc lớn
      globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },

  // App dùng nền màu riêng theo chế độ (Pomodoro / Break) nên khóa ở light mode.
  colorMode: { preference: "light", fallback: "light" },

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
    // Chỉ server dùng: service account để API /api/share đọc Firestore cho link chia sẻ.
    // Đặt qua biến môi trường NUXT_FIREBASE_SERVICE_ACCOUNT (chuỗi JSON của private key).
    firebaseServiceAccount: "",
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
      // Ảnh chứng minh tải thẳng từ trình duyệt lên Cloudinary bằng unsigned upload preset.
      cloudinary: {
        cloudName: process.env.NUXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
        uploadPreset: process.env.NUXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "",
        folder: process.env.NUXT_PUBLIC_CLOUDINARY_FOLDER ?? "daily-tasks",
      },
    },
  },
});
