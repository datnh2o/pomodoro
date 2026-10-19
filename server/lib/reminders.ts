import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import webpush from "web-push";
import { addDays, currentTimeHHmm, dateKey, weekdayOf } from "../../shared/utils/dates";
import {
  ASSIGN_NOTIFY_WINDOW_MS,
  DEADLINE_WARNING_MINUTES,
  DEFAULT_EVENING_REMINDER,
  DEFAULT_MORNING_REMINDER,
  DEFAULT_WEEKLY_REPORT_TIME,
  isMainTask,
  isRestDay,
  isScheduledOn,
  isSidePendingOn,
  isSideTask,
  normalizeTask,
  penaltySettingsOn,
  type DayDoc,
  type MainTask,
  type PushSubscriptionDoc,
  type SideTask,
  type Task,
  type Workspace,
} from "../../shared/utils/models";
import { MAX_PENALTY_MULTIPLIER, nextDayToClose, planDayClose, weekKeyOf } from "../../shared/utils/penalty";
import { computeStats, normalizeDay, type DayMap } from "../../shared/utils/stats";

/**
 * Job chạy mỗi phút (Netlify Scheduled Function hoặc /api/cron/reminders):
 *  1. Chốt các ngày đã qua cho mọi workspace (phạt, phạt tăng dần, chuỗi lỡ).
 *  2. Gửi nhắc đẩy: tới giờ việc, sắp hết hạn, buổi sáng, cuối ngày, được giao việc.
 *  3. Chủ nhật: gửi email tổng kết tuần cho người giám sát (qua Resend) nếu cấu hình.
 * Không phụ thuộc Nitro để Netlify Function import được trực tiếp.
 */
export interface ReminderEnv {
  /** JSON service account: chuỗi (process.env) hoặc object (Nuxt runtimeConfig tự parse JSON) */
  serviceAccount: string | Record<string, unknown>;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  /** Resend API key để gửi email tổng kết tuần (tùy chọn) */
  resendApiKey?: string;
  /** Địa chỉ gửi, vd "Nhiệm vụ hằng ngày <onboarding@resend.dev>" */
  reportFrom?: string;
  /** URL app để chèn vào email (tùy chọn) */
  appUrl?: string;
}

export interface ReminderResult {
  at: string;
  workspacesChecked: number;
  daysClosed: number;
  sent: number;
  emailsSent: number;
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

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Tên nhiệm vụ/bảng do người dùng nhập, phải escape trước khi chèn vào email HTML */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

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

// ---------- 3. Email tổng kết tuần ----------

const sendWeeklyEmail = async (
  env: ReminderEnv,
  wsRef: DocumentReference,
  ws: Workspace,
  tasks: Task[],
  today: string
): Promise<boolean> => {
  if (!env.resendApiKey || !env.reportFrom || !ws.supervisorEmail) return false;
  const weekStart = weekKeyOf(today, weekdayOf, addDays);
  const daysSnap = await wsRef.collection("days").where("date", ">=", weekStart).where("date", "<=", today).get();
  const days: DayMap = {};
  daysSnap.forEach((d) => {
    days[d.id] = normalizeDay(d.id, d.data() as Partial<DayDoc>);
  });
  const stats = computeStats({ from: weekStart, to: today, days, tasks, earliest: ws.createdDate, today, restDays: ws.restDays });

  const rows = stats.perTask
    .map((t) => `<tr><td style="padding:4px 8px">${escapeHtml(t.title)}</td><td style="padding:4px 8px;text-align:right">${t.completed}/${t.scheduled}</td><td style="padding:4px 8px;text-align:right">${t.missed}</td></tr>`)
    .join("");
  const shareLine = ws.shareToken && env.appUrl ? `<p><a href="${escapeHtml(`${env.appUrl}/share/${ws.shareToken}`)}">Xem chi tiết</a></p>` : "";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 8px">Tổng kết tuần ${weekStart.slice(8, 10)}/${weekStart.slice(5, 7)} – ${today.slice(8, 10)}/${today.slice(5, 7)}</h2>
      <p style="margin:0 0 12px;color:#555">${escapeHtml(ws.name)}</p>
      <p><b>Tiền thưởng tuần này:</b> ${formatMoney(stats.reward)} (${stats.rewardDays} rương)<br>
         <b>Tiền phạt tuần này:</b> ${formatMoney(stats.penalty)}<br>
         <b>Ngày làm đủ:</b> ${stats.fullDays}/${stats.countedDays}<br>
         <b>Lần bỏ lỡ:</b> ${stats.missedCount}<br>
         <b>Tổng nợ hiện tại:</b> ${formatMoney(ws.penaltyTotal)}<br>
         <b>Tổng thưởng hiện tại:</b> ${formatMoney(ws.rewardTotal ?? 0)}</p>
      ${rows ? `<table style="border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding:4px 8px">Nhiệm vụ</th><th style="padding:4px 8px">Làm/Lịch</th><th style="padding:4px 8px">Bỏ lỡ</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
      ${shareLine}
      <p style="color:#888;font-size:12px">Email tự động từ app Nhiệm vụ hằng ngày.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.reportFrom,
      to: [ws.supervisorEmail],
      subject: `[${ws.name}] Tổng kết tuần: phạt ${formatMoney(stats.penalty)}, làm đủ ${stats.fullDays}/${stats.countedDays} ngày`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${await res.text()}`);
  return true;
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
    emailsSent: 0,
    removedSubscriptions: 0,
    errors: [],
  };

  const workspaces = await db.collection("workspaces").get();
  for (const wsDoc of workspaces.docs) {
    const ws = { id: wsDoc.id, ...wsDoc.data() } as Workspace;
    result.workspacesChecked++;

    try {
      const needsClosing = (ws.lastClosedDate ?? addDays(ws.createdDate, -1)) < addDays(today, -1);
      const subscriptions = await wsDoc.ref.collection("pushSubscriptions").get();
      const isSunday = weekdayOf(today) === 0;
      const weekKey = weekKeyOf(today, weekdayOf, addDays);
      const wantsWeekly =
        isSunday &&
        !!ws.supervisorEmail &&
        minutes.includes(ws.weeklyReportTime ?? DEFAULT_WEEKLY_REPORT_TIME) &&
        ws.lastWeeklyReportKey !== weekKey;

      // Không có gì để làm thì bỏ qua sớm, đỡ tốn lượt đọc
      if (!needsClosing && subscriptions.empty && !wantsWeekly) continue;

      const tasksSnap = await wsDoc.ref.collection("tasks").get();
      const allTasks = tasksSnap.docs.map((d) => normalizeTask({ id: d.id, ...d.data() } as Task));
      const mainTasks = allTasks.filter(isMainTask) as MainTask[];

      if (needsClosing) {
        result.daysClosed += await closePastDays(db, wsDoc.ref, mainTasks, today);
      }

      if (wantsWeekly) {
        try {
          if (await sendWeeklyEmail(env, wsDoc.ref, ws, allTasks, today)) {
            result.emailsSent++;
            await wsDoc.ref.update({ lastWeeklyReportKey: weekKey });
          }
        } catch (error) {
          result.errors.push(`${ws.id}/weekly: ${(error as Error).message}`);
        }
      }

      if (subscriptions.empty || isRestDay(ws.restDays, today)) continue;

      const scheduled = mainTasks.filter((t) => isScheduledOn(t, today));
      const sideTasks = allTasks.filter(isSideTask) as SideTask[];
      const pendingSide = sideTasks.filter((t) => isSidePendingOn(t, today) && t.reminderTime);
      const assigned = sideTasks.filter(
        (t) => !t.assignNotifiedAt && t.doneDate === null && now.getTime() - t.createdAt <= ASSIGN_NOTIFY_WINDOW_MS
      );
      const morning = ws.morningReminderTime === undefined ? DEFAULT_MORNING_REMINDER : ws.morningReminderTime;
      const wantsMorning = !!morning && minutes.includes(morning) && scheduled.length > 0;
      if (!scheduled.length && !pendingSide.length && !assigned.length && !wantsMorning) continue;

      const daySnap = await wsDoc.ref.collection("days").doc(today).get();
      const completions = ((daySnap.data() as Partial<DayDoc> | undefined)?.completions ?? {}) as DayDoc["completions"];
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
            body: task.requiresProof ? "Đi làm thôi, nhớ chụp ảnh chứng minh khi xong." : "Đi làm thôi!",
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
      const evening = ws.eveningReminderTime ?? DEFAULT_EVENING_REMINDER;
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
