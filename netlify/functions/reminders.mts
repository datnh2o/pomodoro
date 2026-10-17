import { runReminders } from "../../server/lib/reminders";

/**
 * Netlify Scheduled Function: chạy mỗi phút, gửi nhắc đẩy cho nhiệm vụ tới giờ và nhắc cuối ngày.
 * Biến môi trường lấy từ Netlify UI (giống app).
 */
export default async () => {
  try {
    const result = await runReminders({
      serviceAccount: process.env.NUXT_FIREBASE_SERVICE_ACCOUNT ?? "",
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
      vapidPrivateKey: process.env.NUXT_VAPID_PRIVATE_KEY ?? "",
      vapidSubject: process.env.NUXT_VAPID_SUBJECT ?? "",
    });
    console.log("[reminders]", JSON.stringify(result));
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("[reminders] failed", error);
    return new Response(String(error), { status: 500 });
  }
};

export const config = { schedule: "* * * * *" };
