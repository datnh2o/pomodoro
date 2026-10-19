import { collection, getDocs, query, where } from "firebase/firestore";
import type { DayDoc } from "#shared/utils/models";
import { computeStats, currentFullStreak, normalizeDay, type DayMap } from "#shared/utils/stats";

export { STREAK_LOOKBACK_DAYS } from "#shared/utils/stats";
export type { DayMap, DayStatus, DaySummary, LineageStats, PeriodStats } from "#shared/utils/stats";

/** Lịch sử theo ngày: tải `days` theo khoảng; phần tính toán thuần nằm ở shared/utils/stats.ts */
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
      map[d.id] = normalizeDay(d.id, d.data() as Partial<DayDoc>);
    });
    return map;
  };

  return { fetchDays, computeStats, currentFullStreak };
};
