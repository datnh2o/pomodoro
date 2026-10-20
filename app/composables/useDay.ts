import {
  doc,
  increment,
  onSnapshot,
  runTransaction,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import type { DayDoc, MainTask, Proof, Workspace } from "#shared/utils/models";
import { nextDayToClose, planDayClose } from "#shared/utils/penalty";
import { todayKey, yesterdayKey } from "#shared/utils/dates";

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

  /**
   * Tích hoàn thành nhiệm vụ chính (mặc định hôm nay). Nhiệm vụ yêu cầu ảnh phải có ít nhất 1 ảnh.
   * `date` khác hôm nay chỉ dùng cho ảnh xếp hàng lúc mất mạng; ngày đã chốt thì tiền phạt không hoàn tác.
   */
  const complete = async (task: MainTask, proofs: Proof[], date: string = today.value) => {
    if (task.requiresProof && proofs.length === 0) {
      throw new Error("Nhiệm vụ này cần ít nhất một ảnh chứng minh");
    }
    const ws = workspace.value;
    const uid = user.value?.uid;
    if (!ws || !uid) throw new Error("User is not authenticated");
    await setDoc(
      dayRef(ws.id, date),
      {
        date,
        completions: { [task.id]: { at: Date.now(), byUid: uid, proofs } },
      },
      { merge: true }
    );
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
    if (nextDayToClose(ws) > yesterday) return;
    // Transaction phải đọc dữ liệu mới nhất trên server: ngoại tuyến thì để lần mở sau hoặc job server chốt
    if (!navigator.onLine) return;

    closing.value = true;
    const firestore = $firebase.firestore;
    const wsRef = doc(firestore, "workspaces", ws.id);
    try {
      // Mỗi ngày một transaction đọc lại workspace và ngày rồi chốt đúng ngày kế tiếp. Thiết bị khác
      // hoặc job server chốt cùng lúc thì transaction chạy lại, thấy đã chốt nên không cộng phạt hai lần.
      for (;;) {
        const closedOne = await runTransaction(firestore, async (tx) => {
          const wsSnap = await tx.get(wsRef);
          if (!wsSnap.exists()) return false;
          const fresh = { id: wsSnap.id, ...wsSnap.data() } as Workspace;
          const date = nextDayToClose(fresh);
          if (date > yesterday) return false;

          const ref = dayRef(ws.id, date);
          const daySnap = await tx.get(ref);
          // Cùng thuật toán với server (shared/utils/penalty.ts): phạt tăng dần theo chuỗi lỡ
          const plan = planDayClose(fresh, date, daySnap.data() as Partial<DayDoc> | undefined, mainTasks.value);
          if (plan.day) tx.set(ref, plan.day, { merge: true });
          tx.update(wsRef, {
            lastClosedDate: date,
            penaltyTotal: increment(plan.penalty),
            rewardTotal: increment(plan.reward),
            rewardDays: increment(plan.reward > 0 ? 1 : 0),
            missStreak: plan.missStreak,
          });
          return true;
        });
        if (!closedOne) break;
      }
    } catch (error) {
      // Rớt mạng giữa chừng: các ngày đã chốt vẫn đúng, phần còn lại để lần sau
      if ((error as { code?: string }).code === "unavailable") {
        console.warn("closePastDays offline", error);
        return;
      }
      throw error;
    } finally {
      closing.value = false;
    }
  };

  /**
   * Ghi đã mở rương hôm nay lên ngày (mọi thiết bị thấy ngay qua listener). Chỉ chủ sở hữu ghi được (rules);
   * mất mạng thì Firestore xếp hàng và đồng bộ sau, giao diện vẫn cập nhật ngay.
   */
  const markChestOpened = async () => {
    const ws = workspace.value;
    if (!ws || dayDoc.value?.chestOpenedAt) return;
    await setDoc(dayRef(ws.id, today.value), { date: today.value, chestOpenedAt: Date.now() }, { merge: true });
  };

  return { today, dayDoc, bind, unbind, isCompleted, completionOf, complete, closePastDays, markChestOpened };
};
