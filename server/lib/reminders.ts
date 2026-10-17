import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import webpush from "web-push";
import { currentTimeHHmm, dateKey } from "../../shared/utils/dates";
import {
  DEFAULT_EVENING_REMINDER,
  isMainTask,
  isRestDay,
  isScheduledOn,
  type DayDoc,
  type MainTask,
  type PushSubscriptionDoc,
  type Task,
  type Workspace,
} from "../../shared/utils/models";

/**
 * Gửi nhắc đẩy cho mọi workspace: nhiệm vụ chính tới giờ nhắc và nhắc cuối ngày.
 * Chạy mỗi phút (Netlify Scheduled Function hoặc /api/cron/reminders). Không phụ thuộc Nitro
 * để Netlify Function import được trực tiếp.
 */
export interface ReminderEnv {
  /** JSON service account: chuỗi (process.env) hoặc object (Nuxt runtimeConfig tự parse JSON) */
  serviceAccount: string | Record<string, unknown>;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

export interface ReminderResult {
  at: string;
  workspacesChecked: number;
  sent: number;
  removedSubscriptions: number;
  errors: string[];
}

/** Gom các phút gần đây để không bỏ sót khi job chạy trễ vài chục giây */
const WINDOW_MINUTES = 3;

interface Message {
  key: string;
  title: string;
  body: string;
  tag: string;
}

export const parseServiceAccount = (raw: string | Record<string, unknown>) =>
  (typeof raw === "string" ? JSON.parse(raw) : raw) as Parameters<typeof cert>[0];

const getDb = (serviceAccount: string | Record<string, unknown>) => {
  if (!getApps().length) {
    initializeApp({ credential: cert(parseServiceAccount(serviceAccount)) });
  }
  return getFirestore();
};

const recentMinutes = (now: Date) =>
  Array.from({ length: WINDOW_MINUTES }, (_, i) => currentTimeHHmm(new Date(now.getTime() - i * 60_000)));

const formatMoney = (amount: number) => `${amount.toLocaleString("vi-VN")} ₫`;

export async function runReminders(env: ReminderEnv, now: Date = new Date()): Promise<ReminderResult> {
  if (!env.serviceAccount) throw new Error("Thiếu NUXT_FIREBASE_SERVICE_ACCOUNT");
  if (!env.vapidPublicKey || !env.vapidPrivateKey) throw new Error("Thiếu khóa VAPID");
  webpush.setVapidDetails(env.vapidSubject || "mailto:admin@example.com", env.vapidPublicKey, env.vapidPrivateKey);

  const db = getDb(env.serviceAccount);
  const today = dateKey(now);
  const minutes = recentMinutes(now);
  const result: ReminderResult = { at: `${today} ${minutes[0]}`, workspacesChecked: 0, sent: 0, removedSubscriptions: 0, errors: [] };

  const workspaces = await db.collection("workspaces").get();
  for (const wsDoc of workspaces.docs) {
    const ws = { id: wsDoc.id, ...wsDoc.data() } as Workspace;
    if (isRestDay(ws.restDays, today)) continue;

    // Không có thiết bị đăng ký thì bỏ qua sớm, đỡ tốn lượt đọc
    const subscriptions = await wsDoc.ref.collection("pushSubscriptions").get();
    if (subscriptions.empty) continue;
    result.workspacesChecked++;

    const tasksSnap = await wsDoc.ref.collection("tasks").where("type", "==", "main").get();
    const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task).filter(isMainTask) as MainTask[];
    const scheduled = tasks.filter((t) => isScheduledOn(t, today));
    if (!scheduled.length) continue;

    const daySnap = await wsDoc.ref.collection("days").doc(today).get();
    const completions = ((daySnap.data() as Partial<DayDoc> | undefined)?.completions ?? {}) as DayDoc["completions"];
    const pending = scheduled.filter((t) => !completions[t.id]);
    if (!pending.length) continue;

    const logRef = wsDoc.ref.collection("reminderLog").doc(today);
    const sent = ((await logRef.get()).data() ?? {}) as Record<string, unknown>;

    const messages: Message[] = [];
    for (const task of pending) {
      const key = `task:${task.id}`;
      if (task.reminderTime && minutes.includes(task.reminderTime) && !sent[key]) {
        messages.push({
          key,
          title: `Đến giờ: ${task.title}`,
          body: task.requiresProof ? "Đi làm thôi, nhớ chụp ảnh chứng minh khi xong." : "Đi làm thôi!",
          tag: `task-${task.id}`,
        });
      }
    }
    const evening = ws.eveningReminderTime ?? DEFAULT_EVENING_REMINDER;
    if (minutes.includes(evening) && !sent.evening) {
      messages.push({
        key: "evening",
        title: `Còn ${pending.length} nhiệm vụ chưa xong hôm nay`,
        body: `Bỏ lỡ sẽ mất ${formatMoney(pending.length * ws.penaltyAmount)}: ${pending.map((t) => t.title).join(", ")}`,
        tag: "evening",
      });
    }
    if (!messages.length) continue;

    for (const subDoc of subscriptions.docs) {
      const sub = subDoc.data() as PushSubscriptionDoc;
      for (const message of messages) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({ title: message.title, body: message.body, tag: message.tag, url: "/" })
          );
          result.sent++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Thiết bị đã hủy đăng ký
            await subDoc.ref.delete();
            result.removedSubscriptions++;
            break;
          }
          result.errors.push(`${ws.id}/${subDoc.id}: ${(error as Error).message}`);
        }
      }
    }

    const logUpdate: Record<string, unknown> = {};
    for (const message of messages) logUpdate[message.key] = FieldValue.serverTimestamp();
    await logRef.set(logUpdate, { merge: true });
  }

  return result;
}
