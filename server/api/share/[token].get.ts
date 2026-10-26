import { useAdminDb } from "../../utils/adminDb";
import { addDays, todayKey } from "#shared/utils/dates";
import { isMainTask, isRestDay, isScheduledOn, penaltySettingsOn, type DayDoc, type Task, type Workspace } from "#shared/utils/models";
import { computeStats, normalizeDay, STREAK_LOOKBACK_DAYS, type DayMap } from "#shared/utils/stats";

/**
 * Dữ liệu chỉ đọc cho link chia sẻ /share/{token}.
 * Người xem không đăng nhập nên server đọc Firestore bằng service account (firebase-admin).
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  if (!/^[a-f0-9]{32}$/.test(token)) {
    throw createError({ statusCode: 404, statusMessage: "Link không hợp lệ" });
  }

  const db = useAdminDb();
  const wsSnap = await db.collection("workspaces").where("shareToken", "==", token).limit(1).get();
  const wsDoc = wsSnap.docs[0];
  if (!wsDoc) {
    throw createError({ statusCode: 404, statusMessage: "Link không tồn tại hoặc đã bị thu hồi" });
  }
  const ws = { id: wsDoc.id, ...wsDoc.data() } as Workspace;

  const today = todayKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = [monthStart, addDays(today, -STREAK_LOOKBACK_DAYS)].sort()[0]!;

  const [tasksSnap, daysSnap] = await Promise.all([
    wsDoc.ref.collection("tasks").get(),
    wsDoc.ref.collection("days").where("date", ">=", from).where("date", "<=", today).get(),
  ]);
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task);
  const days: DayMap = {};
  daysSnap.forEach((d) => {
    days[d.id] = normalizeDay(d.id, d.data() as Partial<DayDoc>);
  });

  const restDays = ws.restDays ?? [];
  const month = computeStats({ from: monthStart, to: today, days, tasks, earliest: ws.createdDate, today, restDays });
  const todayDay = days[today];
  const restToday = isRestDay(restDays, today);

  const todayMain = (restToday ? [] : tasks)
    .filter(isMainTask)
    .filter((t) => isScheduledOn(t, today))
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const completion = todayDay?.completions[t.id];
      return {
        id: t.id,
        title: t.title,
        reminderTime: t.reminderTime,
        done: !!completion,
      };
    });

  setHeader(event, "Cache-Control", "public, max-age=60");
  return {
    name: ws.name,
    today,
    restToday,
    penaltyAmount: penaltySettingsOn(ws, today).amount,
    penaltyTotal: ws.penaltyTotal,
    /** Chuỗi ngày liên tiếp hoàn thành đủ nhiệm vụ chính */
    streak: month.streak,
    rewardTotal: ws.rewardTotal ?? 0,
    month: {
      penalty: month.penalty,
      reward: month.reward,
      rewardDays: month.rewardDays,
      fullDays: month.fullDays,
      countedDays: month.countedDays,
      missedCount: month.missedCount,
    },
    todayMain,
    perTask: month.perTask,
  };
});
