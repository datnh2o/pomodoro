import { isMainTask, isScheduledOn, type DayDoc, type MainTask, type Task } from "./models";
import { addDays, dateRange, todayKey } from "./dates";

/** Số ngày nhìn lại để tính chuỗi hiện tại */
export const STREAK_LOOKBACK_DAYS = 120;

export type DayStatus = "none" | "future" | "full" | "partial" | "missed" | "today" | "rest";

export interface DaySummary {
  date: string;
  status: DayStatus;
  scheduled: number;
  completed: number;
  penalty: number;
  /** Tiền thưởng của ngày đã chốt (mở rương) */
  reward: number;
}

export interface LineageStats {
  lineageId: string;
  title: string;
  scheduled: number;
  completed: number;
  missed: number;
}

export interface PeriodStats {
  penalty: number;
  /** Tổng thưởng các ngày đã chốt trong kỳ */
  reward: number;
  /** Số ngày được thưởng (số rương đã mở) trong kỳ */
  rewardDays: number;
  /** Số ngày (đến hôm qua) có nhiệm vụ chính và đã làm đủ */
  fullDays: number;
  /** Số ngày (đến hôm qua) có nhiệm vụ chính */
  countedDays: number;
  missedCount: number;
  /** Chuỗi hiện tại: số ngày liên tiếp hoàn thành đủ nhiệm vụ chính tính đến hôm nay */
  streak: number;
  /** Chuỗi dài nhất trong kỳ */
  longestStreak: number;
  perTask: LineageStats[];
  days: Record<string, DaySummary>;
}

export type DayMap = Record<string, DayDoc>;

/** Chuẩn hóa dữ liệu thô của một tài liệu `days` */
export const normalizeDay = (date: string, data: Partial<DayDoc> | undefined): DayDoc => ({
  completions: {},
  closed: false,
  missedTaskIds: [],
  penalty: 0,
  ...data,
  date,
});

/** Gom các phiên bản của cùng một nhiệm vụ chính theo lineageId */
export const groupLineages = (tasks: Task[]) => {
  const map = new Map<string, MainTask[]>();
  for (const task of tasks) {
    if (!isMainTask(task)) continue;
    const list = map.get(task.lineageId) ?? [];
    list.push(task);
    map.set(task.lineageId, list);
  }
  return map;
};

const latestVersion = (versions: MainTask[]) =>
  [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]!;

/** Lineage được lên lịch / đã hoàn thành vào ngày `date` */
const lineageStateOn = (versions: MainTask[], date: string, day: DayDoc | undefined) => {
  const scheduled = versions.some((v) => isScheduledOn(v, date));
  const completed = !!day && versions.some((v) => !!day.completions[v.id]);
  return { scheduled, completed };
};

/** Số nhiệm vụ chính (gộp các phiên bản cùng lineage) có lịch / đã xong trong ngày `date` */
const dayProgressOn = (lineages: Map<string, MainTask[]>, date: string, day: DayDoc | undefined) => {
  let scheduled = 0;
  let completed = 0;
  for (const versions of lineages.values()) {
    const state = lineageStateOn(versions, date, day);
    if (!state.scheduled) continue;
    scheduled++;
    if (state.completed) completed++;
  }
  return { scheduled, completed };
};

/**
 * Chuỗi hiện tại: số ngày liên tiếp hoàn thành đủ nhiệm vụ chính, đếm lùi từ hôm nay và dừng ở ngày thiếu việc
 * đầu tiên. Ngày nghỉ và ngày không có việc bỏ qua (không cộng, không đứt); hôm nay chưa xong chưa tính là đứt.
 */
export const currentFullStreak = (
  tasks: Task[],
  days: DayMap,
  earliest: string,
  today = todayKey(),
  restDays: string[] = []
) => {
  const lineages = groupLineages(tasks);
  let streak = 0;
  for (let date = today; date >= earliest; date = addDays(date, -1)) {
    if (restDays.includes(date)) continue;
    const { scheduled, completed } = dayProgressOn(lineages, date, days[date]);
    if (!scheduled) continue;
    if (completed === scheduled) {
      streak++;
      continue;
    }
    if (date === today) continue;
    break;
  }
  return streak;
};

export const computeStats = (input: {
  from: string;
  to: string;
  days: DayMap;
  tasks: Task[];
  earliest: string;
  today?: string;
  restDays?: string[];
}): PeriodStats => {
  const today = input.today ?? todayKey();
  const restDays = input.restDays ?? [];
  const lineages = groupLineages(input.tasks);
  const summaries: Record<string, DaySummary> = {};
  let penalty = 0;
  let reward = 0;
  let rewardDays = 0;
  let fullDays = 0;
  let countedDays = 0;
  let missedCount = 0;
  // Chuỗi ngày hoàn thành đủ trong kỳ
  let run = 0;
  let longestStreak = 0;

  const perLineage = new Map<string, { scheduled: number; completed: number }>();
  for (const id of lineages.keys()) perLineage.set(id, { scheduled: 0, completed: 0 });

  for (const date of dateRange(input.from, input.to)) {
    const day = input.days[date];
    let scheduled = 0;
    let completed = 0;

    // Trước ngày bắt đầu tính (vd. đã "bắt đầu lại từ hôm nay"): bỏ qua cả nhiệm vụ lẫn tiền đã chốt
    if (date < input.earliest) {
      summaries[date] = { date, status: "none", scheduled: 0, completed: 0, penalty: 0, reward: 0 };
      continue;
    }
    // Ngày nghỉ: không tính nhiệm vụ, không đứt chuỗi
    if (restDays.includes(date)) {
      summaries[date] = { date, status: date > today ? "future" : "rest", scheduled: 0, completed: 0, penalty: 0, reward: 0 };
      continue;
    }

    for (const [id, versions] of lineages) {
      const state = lineageStateOn(versions, date, day);
      if (!state.scheduled) continue;
      scheduled++;
      if (state.completed) completed++;

      // Thống kê từng nhiệm vụ chỉ tính các ngày đã qua (hôm nay chưa chốt)
      const acc = perLineage.get(id)!;
      if (date < today) {
        acc.scheduled++;
        if (state.completed) acc.completed++;
      }
    }

    // Ngày không có việc không cộng cũng không đứt chuỗi; hôm nay chưa xong chưa tính là đứt
    if (date <= today && scheduled > 0) {
      if (completed === scheduled) {
        run++;
        longestStreak = Math.max(longestStreak, run);
      } else if (date < today) {
        run = 0;
      }
    }

    let status: DayStatus;
    if (date > today) status = "future";
    else if (scheduled === 0) status = "none";
    else if (date === today) status = completed === scheduled ? "full" : "today";
    else if (completed === scheduled) status = "full";
    else if (completed === 0) status = "missed";
    else status = "partial";

    if (date < today && scheduled > 0) {
      countedDays++;
      if (completed === scheduled) fullDays++;
      missedCount += scheduled - completed;
    }
    const dayReward = day?.closed ? (day.reward ?? 0) : 0;
    if (day?.closed) penalty += day.penalty;
    reward += dayReward;
    if (dayReward > 0) rewardDays++;

    summaries[date] = { date, status, scheduled, completed, penalty: day?.closed ? day.penalty : 0, reward: dayReward };
  }

  const perTask: LineageStats[] = [];
  for (const [id, versions] of lineages) {
    const acc = perLineage.get(id)!;
    if (acc.scheduled === 0) continue;
    const latest = latestVersion(versions);
    perTask.push({
      lineageId: id,
      title: latest.title,
      scheduled: acc.scheduled,
      completed: acc.completed,
      missed: acc.scheduled - acc.completed,
    });
  }
  perTask.sort((a, b) => b.missed - a.missed || a.title.localeCompare(b.title, "vi"));

  const streak = currentFullStreak(input.tasks, input.days, input.earliest, today, restDays);
  return { penalty, reward, rewardDays, fullDays, countedDays, missedCount, streak, longestStreak, perTask, days: summaries };
};
