import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { parseServiceAccount } from "../lib/reminders";

/**
 * Firestore phía server cho các trang không đăng nhập (link chia sẻ, widget): đọc bằng service account
 * (firebase-admin), không qua Security Rules.
 */
export const useAdminDb = () => {
  // Nuxt tự parse env dạng JSON thành object; chấp nhận cả chuỗi lẫn object
  const raw = useRuntimeConfig().firebaseServiceAccount as string | Record<string, unknown>;
  if (!raw || (typeof raw === "object" && !Object.keys(raw).length)) {
    throw createError({
      statusCode: 503,
      statusMessage: "Link chia sẻ chưa được cấu hình trên server (thiếu NUXT_FIREBASE_SERVICE_ACCOUNT).",
    });
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(parseServiceAccount(raw)) });
  }
  return getFirestore();
};
