import { isMainTask, isScheduledOn, type DayDoc, type MainTask, type Task } from "./models";
import { addDays, dateRange, todayKey } from "./dates";

/** Số ngày nhìn lại để tính streak hiện tại */
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
  requiresProof: boolean;
  scheduled: number;
  completed: number;
  missed: number;
  currentStreak: number;
  longestStreak: number;
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

/** Streak hiện tại: đếm lùi từ hôm nay qua các ngày được lên lịch (bỏ qua ngày nghỉ), dừng ở ngày bỏ lỡ đầu tiên */
export const currentStreakOf = (
  versions: MainTask[],
  days: DayMap,
  today: string,
  earliest: string,
  restDays: string[] = []
) => {
  let streak = 0;
  for (let date = today; date >= earliest; date = addDays(date, -1)) {
    if (restDays.includes(date)) continue;
    const { scheduled, completed } = lineageStateOn(versions, date, days[date]);
    if (!scheduled) continue;
    if (completed) {
      streak++;
      continue;
    }
    // Hôm nay chưa làm thì chưa tính là đứt chuỗi
    if (date === today) continue;
    break;
  }
  return streak;
};

/** Streak hiện tại của từng lineage */
export const currentStreaks = (
  tasks: Task[],
  days: DayMap,
  earliest: string,
  today = todayKey(),
  restDays: string[] = []
) => {
  const result: Record<string, number> = {};
  for (const [id, versions] of groupLineages(tasks)) {
    result[id] = currentStreakOf(versions, days, today, earliest, restDays);
  }
  return result;
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

  const perLineage = new Map<string, { scheduled: number; completed: number; longest: number; run: number }>();
  for (const id of lineages.keys()) perLineage.set(id, { scheduled: 0, completed: 0, longest: 0, run: 0 });

  for (const date of dateRange(input.from, input.to)) {
    const day = input.days[date];
    let scheduled = 0;
    let completed = 0;

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
        if (state.completed) {
          acc.completed++;
          acc.run++;
          acc.longest = Math.max(acc.longest, acc.run);
        } else {
          acc.run = 0;
        }
      } else if (date === today && state.completed) {
        acc.longest = Math.max(acc.longest, acc.run + 1);
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
      requiresProof: latest.requiresProof,
      scheduled: acc.scheduled,
      completed: acc.completed,
      missed: acc.scheduled - acc.completed,
      currentStreak: currentStreakOf(versions, input.days, today, input.earliest, restDays),
      longestStreak: acc.longest,
    });
  }
  perTask.sort((a, b) => b.missed - a.missed || a.title.localeCompare(b.title, "vi"));

  return { penalty, reward, rewardDays, fullDays, countedDays, missedCount, perTask, days: summaries };
};
