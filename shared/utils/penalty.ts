/**
 * Thuật toán chốt một ngày, dùng chung cho client (useDay) và server (reminders job)
 * để kết quả giống hệt nhau dù ai chốt.
 */
import { addDays } from "./dates";
import { isRestDay, isScheduledOn, penaltySettingsOn, type DayDoc, type MainTask, type Workspace } from "./models";

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
  /** Thưởng khi xong hết nhiệm vụ chính của ngày */
  rewardAmount: number;
}

export interface DayCloseResult {
  missedTaskIds: string[];
  multiplier: number;
  penalty: number;
  /** Thưởng (mở rương) khi không bỏ lỡ việc nào; ngày nghỉ / không có việc thì không thưởng */
  reward: number;
  /** Chuỗi lỡ sau ngày này */
  missStreak: number;
}

export const computeDayClose = (input: DayCloseInput): DayCloseResult => {
  // Ngày nghỉ hoặc không có việc: trung lập, không phạt, không thưởng, không đổi chuỗi lỡ
  if (input.rest || input.scheduledIds.length === 0) {
    return { missedTaskIds: [], multiplier: 1, penalty: 0, reward: 0, missStreak: input.prevMissStreak };
  }
  const completed = new Set(input.completedIds);
  const missedTaskIds = input.scheduledIds.filter((id) => !completed.has(id));
  if (!missedTaskIds.length) {
    return { missedTaskIds: [], multiplier: 1, penalty: 0, reward: input.rewardAmount, missStreak: 0 };
  }
  const missStreak = input.prevMissStreak + 1;
  const multiplier = input.escalation ? Math.min(2 ** (missStreak - 1), MAX_PENALTY_MULTIPLIER) : 1;
  return {
    missedTaskIds,
    multiplier,
    penalty: missedTaskIds.length * input.penaltyAmount * multiplier,
    reward: 0,
    missStreak,
  };
};

/** Ngày kế tiếp cần chốt của workspace */
export const nextDayToClose = (ws: Pick<Workspace, "lastClosedDate" | "createdDate">): string =>
  ws.lastClosedDate ? addDays(ws.lastClosedDate, 1) : ws.createdDate;

export interface DayClosePlan {
  /** Ghi (merge) vào days/{date}; null nếu ngày này đã chốt từ trước (chỉ cần đẩy lastClosedDate) */
  day: Pick<DayDoc, "date" | "closed" | "missedTaskIds" | "penalty" | "multiplier" | "reward" | "rest" | "closedAt"> | null;
  /** Cộng vào workspace.penaltyTotal */
  penalty: number;
  /** Cộng vào workspace.rewardTotal (và +1 rewardDays nếu > 0) */
  reward: number;
  /** Ghi vào workspace.missStreak */
  missStreak: number;
}

/**
 * Chốt ngày `date` của workspace `ws` (đọc mới nhất trong transaction). Người gọi ghi `day` và cập nhật
 * workspace { lastClosedDate: date, penaltyTotal += penalty, rewardTotal += reward, rewardDays += reward ? 1 : 0,
 * missStreak } trong cùng transaction.
 */
export const planDayClose = (
  ws: Workspace,
  date: string,
  existing: Partial<DayDoc> | undefined,
  mainTasks: MainTask[],
  now: number = Date.now()
): DayClosePlan => {
  const prevMissStreak = ws.missStreak ?? 0;
  if (existing?.closed) return { day: null, penalty: 0, reward: 0, missStreak: prevMissStreak };

  const rest = isRestDay(ws.restDays, date);
  const { amount, escalation, reward } = penaltySettingsOn(ws, date);
  const result = computeDayClose({
    scheduledIds: rest ? [] : mainTasks.filter((t) => isScheduledOn(t, date)).map((t) => t.id),
    completedIds: Object.keys(existing?.completions ?? {}),
    rest,
    prevMissStreak,
    penaltyAmount: amount,
    escalation,
    rewardAmount: reward,
  });
  return {
    day: {
      date,
      closed: true,
      missedTaskIds: result.missedTaskIds,
      penalty: result.penalty,
      multiplier: result.multiplier,
      reward: result.reward,
      rest,
      closedAt: now,
    },
    penalty: result.penalty,
    reward: result.reward,
    missStreak: result.missStreak,
  };
};

/** Khóa tuần ISO-ish theo thứ 2 đầu tuần, vd "2026-10-13" (ngày thứ 2 của tuần) */
export const weekKeyOf = (dateKey: string, weekdayOf: (k: string) => number, addDays: (k: string, n: number) => string) =>
  addDays(dateKey, -((weekdayOf(dateKey) + 6) % 7));
