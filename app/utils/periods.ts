import { slotTimeOf, type MainTask, type SideTask } from "#shared/utils/models";

export type PeriodKey = "morning" | "afternoon" | "evening" | "anytime";

export interface Period {
  key: PeriodKey;
  label: string;
  icon: string;
}

/** Ba buổi trong ngày, cộng nhóm cuối cho việc chưa đặt giờ */
export const PERIODS: Period[] = [
  { key: "morning", label: "Sáng", icon: "i-lucide-sunrise" },
  { key: "afternoon", label: "Trưa/chiều", icon: "i-lucide-sun" },
  { key: "evening", label: "Tối", icon: "i-lucide-moon" },
  { key: "anytime", label: "Chưa đặt giờ", icon: "i-lucide-clock" },
];

/** Mốc bắt đầu buổi (HH:mm): trước 11:00 là sáng */
export const AFTERNOON_FROM = "11:00";
export const EVENING_FROM = "18:00";

export const periodOf = (hhmm: string | null): PeriodKey => {
  if (!hhmm) return "anytime";
  if (hhmm >= EVENING_FROM) return "evening";
  if (hhmm >= AFTERNOON_FROM) return "afternoon";
  return "morning";
};

export { slotTimeOf };

export interface PeriodGroup<T> extends Period {
  items: T[];
}

/** Chia danh sách đã sắp xếp theo buổi, giữ thứ tự trong từng buổi, bỏ buổi trống */
export const groupByPeriod = <T extends MainTask | SideTask>(items: T[]): PeriodGroup<T>[] =>
  PERIODS.map((p) => ({ ...p, items: items.filter((t) => periodOf(slotTimeOf(t)) === p.key) })).filter(
    (g) => g.items.length > 0
  );
