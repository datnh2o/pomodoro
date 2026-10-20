import { deleteDoc, doc, setDoc } from "firebase/firestore";
import type { PushSubscriptionDoc } from "#shared/utils/models";

const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const sha256Hex = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Đăng ký nhắc đẩy (Web Push) cho thiết bị này. Chỉ hoạt động ở bản build (service worker). */
export const usePush = () => {
  const { $firebase } = useNuxtApp();
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const publicKey = useRuntimeConfig().public.vapidPublicKey;

  const supported = ref(false);
  const subscribed = ref(false);
  const busy = ref(false);
  const permission = ref<NotificationPermission | "unsupported">("unsupported");
  /** iPhone chỉ nhận push khi mở từ icon màn hình chính */
  const needsHomeScreen = ref(false);
  const hasServiceWorker = ref(false);

  const refresh = async () => {
    if (!import.meta.client) return;
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    needsHomeScreen.value = isIos && !standalone;
    supported.value = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!publicKey;
    permission.value = "Notification" in window ? Notification.permission : "unsupported";
    if (!supported.value) return;
    const registration = await navigator.serviceWorker.getRegistration();
    hasServiceWorker.value = !!registration;
    const current = await registration?.pushManager.getSubscription();
    subscribed.value = !!current;
  };

  onMounted(refresh);

  const subscriptionRef = async (endpoint: string) => {
    const ws = workspace.value;
    if (!ws) throw new Error("Chưa có workspace");
    return doc($firebase.firestore, "workspaces", ws.id, "pushSubscriptions", await sha256Hex(endpoint));
  };

  /**
   * Chờ service worker có worker "active" (Safari iOS từ chối đăng ký push khi worker mới chỉ đang cài,
   * ví dụ ngay sau một lần deploy). `serviceWorker.ready` chỉ resolve khi đã active; có timeout để không treo.
   */
  const waitForActiveWorker = async (timeoutMs = 10_000): Promise<ServiceWorkerRegistration> => {
    const existing = await navigator.serviceWorker.getRegistration();
    if (!existing) {
      throw new Error("Service worker chưa được cài. Nhắc đẩy chỉ chạy ở bản đã deploy; thử đóng app, mở lại từ icon màn hình chính rồi bật lại.");
    }
    if (existing.active) return existing;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Service worker chưa sẵn sàng. Thử đóng app, mở lại từ icon màn hình chính rồi bật lại.")), timeoutMs)
    );
    return Promise.race([navigator.serviceWorker.ready, timeout]);
  };

  const subscribe = async () => {
    busy.value = true;
    try {
      const uid = user.value?.uid;
      if (!uid) throw new Error("User is not authenticated");
      // Xin quyền trước, ngay trong cử chỉ bấm (iOS yêu cầu), rồi mới chờ worker
      permission.value = await Notification.requestPermission();
      if (permission.value !== "granted") throw new Error("Bạn chưa cho phép thông báo.");
      const registration = await waitForActiveWorker();

      const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource };
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe(options);
        } catch (error) {
          // Worker vừa đổi (deploy mới) đúng lúc bấm: chờ active lại rồi thử thêm một lần
          if (!/active worker/i.test((error as Error).message)) throw error;
          const again = await waitForActiveWorker();
          subscription = await again.pushManager.subscribe(options);
        }
      }
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Trình duyệt không trả về khóa đăng ký");
      const data: PushSubscriptionDoc = {
        uid,
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
        createdAt: Date.now(),
      };
      await setDoc(await subscriptionRef(subscription.endpoint), data);
      subscribed.value = true;
    } finally {
      busy.value = false;
    }
  };

  const unsubscribe = async () => {
    busy.value = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deleteDoc(await subscriptionRef(subscription.endpoint)).catch(() => {});
        await subscription.unsubscribe();
      }
      subscribed.value = false;
    } finally {
      busy.value = false;
    }
  };

  return { supported, subscribed, busy, permission, needsHomeScreen, hasServiceWorker, subscribe, unsubscribe, refresh };
};
