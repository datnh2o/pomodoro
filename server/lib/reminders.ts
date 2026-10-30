import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import webpush from "web-push";
import { addDays, currentTimeHHmm, dateKey, weekdayOf } from "../../shared/utils/dates";
import {
  ASSIGN_NOTIFY_WINDOW_MS,
  DEADLINE_WARNING_MINUTES,
  DEFAULT_EVENING_REMINDER,
  DEFAULT_MORNING_REMINDER,
  isRestDay,
  isScheduledOn,
  isSidePendingOn,
  penaltySettingsOn,
  type DayDoc,
  type MainTask,
  type PushSubscriptionDoc,
  type Task,
  type Workspace,
} from "../../shared/utils/models";
import { MAX_PENALTY_MULTIPLIER, nextDayToClose, planDayClose } from "../../shared/utils/penalty";
import { loadTasks } from "./tasks";

/**
 * Job chạy mỗi phút (Netlify Scheduled Function hoặc /api/cron/reminders):
 *  1. Chốt các ngày đã qua cho mọi workspace (phạt, phạt tăng dần, chuỗi lỡ).
 *  2. Gửi nhắc đẩy: tới giờ việc, sắp hết hạn, buổi sáng, cuối ngày, được giao việc.
 * Không phụ thuộc Nitro để Netlify Function import được trực tiếp.
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
  daysClosed: number;
  sent: number;
  removedSubscriptions: number;
  errors: string[];
}

/** Gom các phút gần đây để không bỏ sót khi job chạy trễ vài chục giây */
const WINDOW_MINUTES = 3;

interface Message {
  /** Khóa chống gửi trùng trong reminderLog; null = đánh dấu nơi khác (assignRef) */
  key: string | null;
  title: string;
  body: string;
  tag: string;
  excludeUid?: string;
  assignRef?: DocumentReference;
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

const minusMinutes = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const total = (h * 60 + m - minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const formatMoney = (amount: number) => `${amount.toLocaleString("vi-VN")} ₫`;


// ---------- 1. Chốt ngày ----------

/**
 * Mỗi ngày một transaction, giống client (app/composables/useDay.ts): đọc lại workspace và ngày rồi
 * chốt đúng ngày kế tiếp, nên chạy cùng lúc với thiết bị đang mở app cũng không cộng phạt hai lần.
 */
const closePastDays = async (
  db: Firestore,
  wsRef: DocumentReference,
  mainTasks: MainTask[],
  today: string
): Promise<number> => {
  const yesterday = addDays(today, -1);
  let closed = 0;
  for (;;) {
    const outcome = await db.runTransaction(async (tx) => {
      const wsSnap = await tx.get(wsRef);
      if (!wsSnap.exists) return null;
      const ws = { id: wsSnap.id, ...wsSnap.data() } as Workspace;
      const date = nextDayToClose(ws);
      if (date > yesterday) return null;

      const ref = wsRef.collection("days").doc(date);
      const daySnap = await tx.get(ref);
      const plan = planDayClose(ws, date, daySnap.data() as Partial<DayDoc> | undefined, mainTasks);
      if (plan.day) tx.set(ref, plan.day, { merge: true });
      tx.update(wsRef, {
        lastClosedDate: date,
        penaltyTotal: FieldValue.increment(plan.penalty),
        rewardTotal: FieldValue.increment(plan.reward),
        rewardDays: FieldValue.increment(plan.reward > 0 ? 1 : 0),
        missStreak: plan.missStreak,
      });
      return plan.day ? "closed" : "skipped";
    });
    if (!outcome) break;
    if (outcome === "closed") closed++;
  }
  return closed;
};

// ---------- Job chính ----------

export async function runReminders(env: ReminderEnv, now: Date = new Date()): Promise<ReminderResult> {
  if (!env.serviceAccount) throw new Error("Thiếu NUXT_FIREBASE_SERVICE_ACCOUNT");
  if (!env.vapidPublicKey || !env.vapidPrivateKey) throw new Error("Thiếu khóa VAPID");
  webpush.setVapidDetails(env.vapidSubject || "mailto:admin@example.com", env.vapidPublicKey, env.vapidPrivateKey);

  const db = getDb(env.serviceAccount);
  const today = dateKey(now);
  const minutes = recentMinutes(now);
  const result: ReminderResult = {
    at: `${today} ${minutes[0]}`,
    workspacesChecked: 0,
    daysClosed: 0,
    sent: 0,
    removedSubscriptions: 0,
    errors: [],
  };

  const workspaces = await db.collection("workspaces").get();
  for (const wsDoc of workspaces.docs) {
    const ws = { id: wsDoc.id, ...wsDoc.data() } as Workspace;
    result.workspacesChecked++;

    try {
      const needsClosing = (ws.lastClosedDate ?? addDays(ws.createdDate, -1)) < addDays(today, -1);
      const subscriptionsRef = wsDoc.ref.collection("pushSubscriptions");
      // Chỉ cần biết có thiết bị nào không (1 lượt đọc); danh sách đầy đủ đọc khi thật sự có tin để gửi
      const hasDevices = !(await subscriptionsRef.limit(1).get()).empty;
      // Không có gì để làm thì bỏ qua sớm, đỡ tốn lượt đọc
      if (!needsClosing && !hasDevices) continue;

      // Nhiệm vụ chính cần có lịch từ ngày sớm nhất phải xét: ngày chốt hoặc hôm nay
      const since = needsClosing ? nextDayToClose(ws) : today;
      const { mainTasks, sideTasks } = await loadTasks(wsDoc.ref, since);

      if (needsClosing) {
        result.daysClosed += await closePastDays(db, wsDoc.ref, mainTasks, today);
      }

      if (!hasDevices || isRestDay(ws.restDays, today)) continue;

      const scheduled = mainTasks.filter((t) => isScheduledOn(t, today));
      const pendingSide = sideTasks.filter((t) => isSidePendingOn(t, today) && t.reminderTime);
      const assigned = sideTasks.filter(
        (t) => !t.assignNotifiedAt && t.doneDate === null && now.getTime() - t.createdAt <= ASSIGN_NOTIFY_WINDOW_MS
      );
      const morning = ws.morningReminderTime === undefined ? DEFAULT_MORNING_REMINDER : ws.morningReminderTime;
      const wantsMorning = !!morning && minutes.includes(morning) && scheduled.length > 0;
      const evening = ws.eveningReminderTime ?? DEFAULT_EVENING_REMINDER;
      const due = (time: string | null | undefined) => !!time && minutes.includes(time);
      // Tin phụ thuộc việc đã tích hôm nay chưa (nhắc giờ, sắp hết hạn, cuối ngày) mới cần đọc days/{hôm nay}
      const mainDue =
        scheduled.some((t) => due(t.reminderTime) || (!!t.deadlineTime && due(minusMinutes(t.deadlineTime, DEADLINE_WARNING_MINUTES)))) ||
        (scheduled.length > 0 && due(evening));
      const sideDue = pendingSide.some((t) => due(t.reminderTime));
      // Phần lớn các phút không có gì tới giờ: dừng ở đây, khỏi đọc ngày và nhật ký đã gửi
      if (!mainDue && !sideDue && !assigned.length && !wantsMorning) continue;

      const completions = mainDue
        ? (((await wsDoc.ref.collection("days").doc(today).get()).data() as Partial<DayDoc> | undefined)?.completions ?? {})
        : {};
      const pending = scheduled.filter((t) => !completions[t.id]);
      const todayPenalty = penaltySettingsOn(ws, today);

      const logRef = wsDoc.ref.collection("reminderLog").doc(today);
      const sent = ((await logRef.get()).data() ?? {}) as Record<string, unknown>;
      const messages: Message[] = [];

      // Được giao việc
      for (const task of assigned) {
        const by = ws.members[task.createdBy];
        messages.push({
          key: null,
          title: `${by?.displayName || by?.email || "Thành viên"} vừa giao việc phụ`,
          body: task.title,
          tag: `assign-${task.id}`,
          excludeUid: task.createdBy,
          assignRef: wsDoc.ref.collection("tasks").doc(task.id),
        });
      }

      // Buổi sáng: liệt kê việc hôm nay
      if (wantsMorning && !sent.morning) {
        messages.push({
          key: "morning",
          title: `Hôm nay có ${scheduled.length} nhiệm vụ chính${todayPenalty.reward ? `, xong hết mở rương +${formatMoney(todayPenalty.reward)}` : ""}`,
          body: scheduled
            .map((t) => `${t.title}${t.deadlineTime ? ` (hạn ${t.deadlineTime})` : t.reminderTime ? ` (${t.reminderTime})` : ""}`)
            .join(", "),
          tag: "morning",
        });
      }

      // Tới giờ nhắc (chính + phụ)
      for (const task of [...pending, ...pendingSide]) {
        const key = `task:${task.id}`;
        if (task.reminderTime && minutes.includes(task.reminderTime) && !sent[key]) {
          messages.push({
            key,
            title: `Đến giờ: ${task.title}`,
            body: "Đi làm thôi!",
            tag: `task-${task.id}`,
          });
        }
      }

      // Sắp hết hạn
      for (const task of pending) {
        if (!task.deadlineTime) continue;
        const key = `deadline:${task.id}`;
        if (minutes.includes(minusMinutes(task.deadlineTime, DEADLINE_WARNING_MINUTES)) && !sent[key]) {
          messages.push({
            key,
            title: `Còn ${DEADLINE_WARNING_MINUTES} phút: ${task.title}`,
            body: `Hạn ${task.deadlineTime}, quá giờ là mất ${formatMoney(todayPenalty.amount)}.`,
            tag: `deadline-${task.id}`,
          });
        }
      }

      // Cuối ngày
      if (pending.length && minutes.includes(evening) && !sent.evening) {
        const sideNote = pendingSide.length ? ` (+${pendingSide.length} việc phụ)` : "";
        const multiplier = todayPenalty.escalation ? Math.min(2 ** (ws.missStreak ?? 0), MAX_PENALTY_MULTIPLIER) : 1;
        messages.push({
          key: "evening",
          title: `Còn ${pending.length} nhiệm vụ chưa xong hôm nay${sideNote}`,
          body: `Bỏ lỡ sẽ mất ${formatMoney(pending.length * todayPenalty.amount * multiplier)}${multiplier > 1 ? ` (phạt ×${multiplier} vì lỡ liên tiếp)` : ""}${todayPenalty.reward ? `, xong hết được mở rương +${formatMoney(todayPenalty.reward)}` : ""}: ${pending.map((t) => t.title).join(", ")}`,
          tag: "evening",
        });
      }

      if (!messages.length) continue;

      const subscriptions = await subscriptionsRef.get();
      for (const subDoc of subscriptions.docs) {
        const sub = subDoc.data() as PushSubscriptionDoc;
        for (const message of messages) {
          if (message.excludeUid && sub.uid === message.excludeUid) continue;
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys },
              JSON.stringify({ title: message.title, body: message.body, tag: message.tag, url: "/" })
            );
            result.sent++;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await subDoc.ref.delete();
              result.removedSubscriptions++;
              break;
            }
            result.errors.push(`${ws.id}/${subDoc.id}: ${(error as Error).message}`);
          }
        }
      }

      const logUpdate: Record<string, unknown> = {};
      for (const message of messages) {
        if (message.key) logUpdate[message.key] = FieldValue.serverTimestamp();
        if (message.assignRef) await message.assignRef.update({ assignNotifiedAt: Date.now() });
      }
      if (Object.keys(logUpdate).length) await logRef.set(logUpdate, { merge: true });
    } catch (error) {
      result.errors.push(`${ws.id}: ${(error as Error).message}`);
    }
  }

  return result;
}
