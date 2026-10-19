import type { Firestore } from "firebase-admin/firestore";
import { dateKey } from "../../shared/utils/dates";
import {
  isRestDay,
  isScheduledOn,
  isSidePendingOn,
  penaltySettingsOn,
  slotTimeOf,
  type DayDoc,
  type MainTask,
  type SideTask,
  type Workspace,
} from "../../shared/utils/models";
import { loadTasks } from "./tasks";

/**
 * Dữ liệu gọn cho widget màn hình chính (Scriptable trên iPhone), đọc qua mã link chia sẻ chỉ đọc.
 * Widget làm mới nhiều lần mỗi ngày nên chỉ đọc ~10 tài liệu: workspace, nhiệm vụ còn hiệu lực, ngày hôm nay.
 */
export interface WidgetTask {
  title: string;
  done: boolean;
  /** Giờ nhắc (lúc định làm), không có thì null */
  time: string | null;
  /** Hạn trong ngày, null = tới hết ngày */
  deadline: string | null;
  requiresProof: boolean;
}

export interface WidgetData {
  name: string;
  today: string;
  rest: boolean;
  done: number;
  total: number;
  /** Chưa xong trước, rồi theo giờ (giống màn Hôm nay) */
  tasks: WidgetTask[];
  next: WidgetTask | null;
  sidePending: number;
  /** Thưởng khi xong hết hôm nay */
  reward: number;
  allDone: boolean;
  chestOpened: boolean;
  /** Tiền mất nếu bỏ lỡ các việc còn lại (chưa tính phạt tăng dần) */
  atRisk: number;
  /** Tổng thưởng, cộng tạm thưởng hôm nay nếu đã xong hết (như ví ở màn Hôm nay) */
  rewardTotal: number;
  penaltyTotal: number;
  generatedAt: number;
}

export const buildWidgetData = (
  ws: Workspace,
  mainTasks: MainTask[],
  sideTasks: SideTask[],
  day: Partial<DayDoc> | undefined,
  today: string,
  now: number = Date.now()
): WidgetData => {
  const rest = isRestDay(ws.restDays, today);
  const completions = day?.completions ?? {};
  const slot = (t: MainTask) => slotTimeOf(t) ?? "99:99";
  const scheduled = (rest ? [] : mainTasks.filter((t) => isScheduledOn(t, today)))
    .map((t) => ({ task: t, done: !!completions[t.id] }))
    .sort((a, b) => Number(a.done) - Number(b.done) || slot(a.task).localeCompare(slot(b.task)) || a.task.order - b.task.order);
  const tasks: WidgetTask[] = scheduled.map(({ task, done }) => ({
    title: task.title,
    done,
    time: task.reminderTime,
    deadline: task.deadlineTime ?? null,
    requiresProof: task.requiresProof,
  }));
  const done = tasks.filter((t) => t.done).length;
  const allDone = tasks.length > 0 && done === tasks.length;
  const settings = penaltySettingsOn(ws, today);
  return {
    name: ws.name,
    today,
    rest,
    done,
    total: tasks.length,
    tasks,
    next: tasks.find((t) => !t.done) ?? null,
    sidePending: sideTasks.filter((t) => isSidePendingOn(t, today)).length,
    reward: settings.reward,
    allDone,
    chestOpened: !!day?.chestOpenedAt,
    atRisk: (tasks.length - done) * settings.amount,
    rewardTotal: (ws.rewardTotal ?? 0) + (allDone ? settings.reward : 0),
    penaltyTotal: ws.penaltyTotal,
    generatedAt: now,
  };
};

/** Đọc dữ liệu widget theo mã link chia sẻ; null nếu mã không tồn tại hoặc đã thu hồi */
export const loadWidgetData = async (db: Firestore, token: string, now: Date = new Date()): Promise<WidgetData | null> => {
  const wsSnap = await db.collection("workspaces").where("shareToken", "==", token).limit(1).get();
  const wsDoc = wsSnap.docs[0];
  if (!wsDoc) return null;
  const ws = { id: wsDoc.id, ...wsDoc.data() } as Workspace;
  const today = dateKey(now);
  const [{ mainTasks, sideTasks }, daySnap] = await Promise.all([
    loadTasks(wsDoc.ref, today),
    wsDoc.ref.collection("days").doc(today).get(),
  ]);
  return buildWidgetData(ws, mainTasks, sideTasks, daySnap.data() as Partial<DayDoc> | undefined, today, now.getTime());
};
