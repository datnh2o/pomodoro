import {
  deleteField,
  doc,
  getDoc,
  increment,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { isScheduledOn, type DayDoc, type MainTask, type Proof } from "~/utils/models";
import { addDays, dateRange, todayKey, yesterdayKey } from "~/utils/dates";

const emptyDay = (date: string): DayDoc => ({
  date,
  completions: {},
  closed: false,
  missedTaskIds: [],
  penalty: 0,
});

/** Kết quả của ngày hôm nay (tích, ảnh) và việc chốt các ngày đã qua. */
export const useDay = () => {
  const { $firebase } = useNuxtApp();
  const { user } = useAuth();
  const { workspace, can } = useWorkspace();
  const { mainTasks } = useTasks();

  const today = useState<string>("today", () => todayKey());
  const dayDoc = useState<DayDoc | null>("day:today", () => null);
  const unsubscribe = useState<Unsubscribe | null>("day:unsub", () => null);
  const closing = useState<boolean>("day:closing", () => false);

  const dayRef = (workspaceId: string, date: string) =>
    doc($firebase.firestore, "workspaces", workspaceId, "days", date);

  const bind = (workspaceId: string, date: string) => {
    unbind();
    unsubscribe.value = onSnapshot(
      dayRef(workspaceId, date),
      (snap) => {
        dayDoc.value = snap.exists() ? ({ ...emptyDay(date), ...snap.data() } as DayDoc) : emptyDay(date);
      },
      (error) => console.error("day listener", error)
    );
  };

  const unbind = () => {
    unsubscribe.value?.();
    unsubscribe.value = null;
    dayDoc.value = null;
  };

  const isCompleted = (taskId: string) => !!dayDoc.value?.completions[taskId];
  const completionOf = (taskId: string) => dayDoc.value?.completions[taskId];

  /** Tích hoàn thành nhiệm vụ chính hôm nay. Nhiệm vụ yêu cầu ảnh phải có ít nhất 1 ảnh. */
  const complete = async (task: MainTask, proofs: Proof[]) => {
    if (task.requiresProof && proofs.length === 0) {
      throw new Error("Nhiệm vụ này cần ít nhất một ảnh chứng minh");
    }
    const ws = workspace.value;
    const uid = user.value?.uid;
    if (!ws || !uid) throw new Error("User is not authenticated");
    await setDoc(
      dayRef(ws.id, today.value),
      {
        date: today.value,
        closed: false,
        completions: { [task.id]: { at: Date.now(), byUid: uid, proofs } },
      },
      { merge: true }
    );
  };

  /** Bỏ tích (chỉ trong ngày, trước khi chốt) */
  const uncomplete = async (task: MainTask) => {
    const ws = workspace.value;
    if (!ws) return;
    await updateDoc(dayRef(ws.id, today.value), { [`completions.${task.id}`]: deleteField() });
  };

  /**
   * Chốt các ngày đã qua chưa chốt: đếm nhiệm vụ chính lên lịch mà không có tích,
   * ghi tiền phạt vào days/{date} và cộng dồn vào workspace.penaltyTotal.
   * Chạy "lười" mỗi lần mở app (ai có quyền add cũng chốt được, kết quả như nhau).
   */
  const closePastDays = async () => {
    const ws = workspace.value;
    if (!ws || !can("add") || closing.value) return;
    const yesterday = yesterdayKey();
    const from = ws.lastClosedDate ? addDays(ws.lastClosedDate, 1) : ws.createdDate;
    if (from > yesterday) return;

    closing.value = true;
    try {
      let addedPenalty = 0;
      for (const date of dateRange(from, yesterday)) {
        const ref = dayRef(ws.id, date);
        const snap = await getDoc(ref);
        const existing = snap.exists() ? ({ ...emptyDay(date), ...snap.data() } as DayDoc) : emptyDay(date);
        if (existing.closed) continue;

        const scheduled = mainTasks.value.filter((t) => isScheduledOn(t, date));
        const missed = scheduled.filter((t) => !existing.completions[t.id]).map((t) => t.id);
        const penalty = missed.length * ws.penaltyAmount;
        addedPenalty += penalty;

        await setDoc(
          ref,
          { date, closed: true, missedTaskIds: missed, penalty, closedAt: Date.now() },
          { merge: true }
        );
      }
      await updateDoc(doc($firebase.firestore, "workspaces", ws.id), {
        lastClosedDate: yesterday,
        penaltyTotal: increment(addedPenalty),
      });
    } finally {
      closing.value = false;
    }
  };

  return { today, dayDoc, bind, unbind, isCompleted, completionOf, complete, uncomplete, closePastDays };
};
