import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import type { AuthUser } from "~/composables/useAuth";

/**
 * Khởi tạo Firebase (chỉ phía client) và cung cấp qua `useNuxtApp().$firebase`.
 * Trạng thái đăng nhập được đồng bộ vào state dùng chung để `useAuth()` đọc.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public.firebase;

  if (!config.apiKey || !config.projectId) {
    throw new Error(
      "[firebase] Thiếu cấu hình. Điền các biến NUXT_PUBLIC_FIREBASE_* trong .env (xem .env.example)."
    );
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  // Cache ngoại tuyến: xem và tích nhiệm vụ khi mất mạng, tự đồng bộ khi có mạng lại
  const firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const googleProvider = new GoogleAuthProvider();

  const user = useState<AuthUser | null>("auth:user", () => null);
  const ready = useState<boolean>("auth:ready", () => false);

  onAuthStateChanged(auth, (firebaseUser) => {
    // Chỉ giữ các trường cần dùng (plain object) để state có thể serialize.
    user.value = firebaseUser
      ? {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
        }
      : null;
    ready.value = true;
  });

  return {
    provide: {
      firebase: { app, auth, firestore, googleProvider },
    },
  };
});
