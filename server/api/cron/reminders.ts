import { runReminders } from "../../lib/reminders";

/**
 * Gọi tay job nhắc đẩy (dùng khi không chạy trên Netlify, hoặc để thử):
 *   curl -H "x-cron-secret: $NUXT_CRON_SECRET" http://localhost:3000/api/cron/reminders
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const provided = getHeader(event, "x-cron-secret") ?? String(getQuery(event).key ?? "");
  if (!config.cronSecret || provided !== config.cronSecret) {
    throw createError({ statusCode: 401, statusMessage: "Sai hoặc thiếu x-cron-secret" });
  }
  return runReminders({
    serviceAccount: config.firebaseServiceAccount,
    vapidPublicKey: config.public.vapidPublicKey,
    vapidPrivateKey: config.vapidPrivateKey,
    vapidSubject: config.vapidSubject,
  });
});
