import { collection, getDocs, query, where } from "firebase/firestore";
import { isMainTask, isScheduledOn, type DayDoc, type MainTask, type Task } from "~/utils/models";
import { addDays, dateRange, todayKey } from "~/utils/dates";

/** Số ngày nhìn lại để tính streak hiện tại */
export const STREAK_LOOKBACK_DAYS = 120;

export type DayStatus = "none" | "future" | "full" | "partial" | "missed" | "today";

export interface DaySummary {
  date: string;
  status: DayStatus;
  scheduled: number;
  completed: number;
  penalty: number;
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
  /** Số ngày (đến hôm qua) có nhiệm vụ chính và đã làm đủ */
  fullDays: number;
  /** Số ngày (đến hôm qua) có nhiệm vụ chính */
  countedDays: number;
  missedCount: number;
  perTask: LineageStats[];
  days: Record<string, DaySummary>;
}

export type DayMap = Record<string, DayDoc>;

/** Gom các phiên bản của cùng một nhiệm vụ chính theo lineageId */
const groupLineages = (tasks: Task[]) => {
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

/** Lịch sử theo ngày: tải `days` theo khoảng và tính thống kê, streak. */
export const useHistory = () => {
  const { $firebase } = useNuxtApp();

  const fetchDays = async (workspaceId: string, from: string, to: string): Promise<DayMap> => {
    const snap = await getDocs(
      query(
        collection($firebase.firestore, "workspaces", workspaceId, "days"),
        where("date", ">=", from),
        where("date", "<=", to)
      )
    );
    const map: DayMap = {};
    snap.forEach((d) => {
      const data = d.data() as Partial<DayDoc>;
      map[d.id] = { completions: {}, closed: false, missedTaskIds: [], penalty: 0, ...data, date: d.id };
    });
    return map;
  };

  /** Lineage được lên lịch / đã hoàn thành vào ngày `date` */
  const lineageStateOn = (versions: MainTask[], date: string, day: DayDoc | undefined) => {
    const scheduled = versions.some((v) => isScheduledOn(v, date));
    const completed = !!day && versions.some((v) => !!day.completions[v.id]);
    return { scheduled, completed };
  };

  /** Streak hiện tại: đếm lùi từ hôm nay qua các ngày được lên lịch, dừng ở ngày bỏ lỡ đầu tiên */
  const currentStreak = (versions: MainTask[], days: DayMap, today: string, earliest: string) => {
    let streak = 0;
    for (let date = today; date >= earliest; date = addDays(date, -1)) {
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

  const computeStats = (input: {
    from: string;
    to: string;
    days: DayMap;
    tasks: Task[];
    earliest: string;
  }): PeriodStats => {
    const today = todayKey();
    const lineages = groupLineages(input.tasks);
    const summaries: Record<string, DaySummary> = {};
    let penalty = 0;
    let fullDays = 0;
    let countedDays = 0;
    let missedCount = 0;

    const perLineage = new Map<string, { scheduled: number; completed: number; longest: number; run: number }>();
    for (const id of lineages.keys()) perLineage.set(id, { scheduled: 0, completed: 0, longest: 0, run: 0 });

    for (const date of dateRange(input.from, input.to)) {
      const day = input.days[date];
      let scheduled = 0;
      let completed = 0;

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
      if (day?.closed) penalty += day.penalty;

      summaries[date] = { date, status, scheduled, completed, penalty: day?.closed ? day.penalty : 0 };
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
        currentStreak: currentStreak(versions, input.days, today, input.earliest),
        longestStreak: acc.longest,
      });
    }
    perTask.sort((a, b) => b.missed - a.missed || a.title.localeCompare(b.title, "vi"));

    return { penalty, fullDays, countedDays, missedCount, perTask, days: summaries };
  };

  /** Streak hiện tại của từng lineage (dùng cho màn Hôm nay) */
  const currentStreaks = (tasks: Task[], days: DayMap, earliest: string) => {
    const today = todayKey();
    const result: Record<string, number> = {};
    for (const [id, versions] of groupLineages(tasks)) {
      result[id] = currentStreak(versions, days, today, earliest);
    }
    return result;
  };

  return { fetchDays, computeStats, currentStreaks };
};
