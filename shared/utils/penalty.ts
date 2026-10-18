/**
 * Thuật toán chốt một ngày, dùng chung cho client (useDay) và server (reminders job)
 * để kết quả giống hệt nhau dù ai chốt.
 */
export const MAX_PENALTY_MULTIPLIER = 4;

export interface DayCloseInput {
  /** Id các nhiệm vụ chính lên lịch trong ngày (rỗng nếu nghỉ hoặc không có việc) */
  scheduledIds: string[];
  completedIds: Iterable<string>;
  rest: boolean;
  /** Số ngày lỡ liên tiếp tính đến trước ngày này */
  prevMissStreak: number;
  penaltyAmount: number;
  /** Bật phạt tăng dần: lỡ ngày thứ 2 liên tiếp ×2, thứ 3 ×4 (tối đa ×4) */
  escalation: boolean;
}

export interface DayCloseResult {
  missedTaskIds: string[];
  multiplier: number;
  penalty: number;
  /** Chuỗi lỡ sau ngày này */
  missStreak: number;
}

export const computeDayClose = (input: DayCloseInput): DayCloseResult => {
  // Ngày nghỉ hoặc không có việc: trung lập, không phạt, không đổi chuỗi lỡ
  if (input.rest || input.scheduledIds.length === 0) {
    return { missedTaskIds: [], multiplier: 1, penalty: 0, missStreak: input.prevMissStreak };
  }
  const completed = new Set(input.completedIds);
  const missedTaskIds = input.scheduledIds.filter((id) => !completed.has(id));
  if (!missedTaskIds.length) {
    return { missedTaskIds: [], multiplier: 1, penalty: 0, missStreak: 0 };
  }
  const missStreak = input.prevMissStreak + 1;
  const multiplier = input.escalation ? Math.min(2 ** (missStreak - 1), MAX_PENALTY_MULTIPLIER) : 1;
  return {
    missedTaskIds,
    multiplier,
    penalty: missedTaskIds.length * input.penaltyAmount * multiplier,
    missStreak,
  };
};

/** Khóa tuần ISO-ish theo thứ 2 đầu tuần, vd "2026-10-13" (ngày thứ 2 của tuần) */
export const weekKeyOf = (dateKey: string, weekdayOf: (k: string) => number, addDays: (k: string, n: number) => string) =>
  addDays(dateKey, -((weekdayOf(dateKey) + 6) % 7));
