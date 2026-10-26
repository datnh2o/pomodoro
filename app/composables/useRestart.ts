import { collection, doc, documentId, getDocs, query, where, writeBatch, type DocumentReference } from "firebase/firestore";
import { isMainTask, isSideTask } from "#shared/utils/models";
import { todayKey } from "#shared/utils/dates";

/** Firestore giới hạn 500 thao tác một batch */
const BATCH_LIMIT = 400;

export interface RestartResult {
  daysDeleted: number;
  tasksDeleted: number;
}

/**
 * Bắt đầu lại từ hôm nay (chỉ chủ sở hữu):
 *  1. Workspace: ngày bắt đầu tính = hôm nay, ví / rương / chuỗi lỡ về 0, nhiệm vụ chính có hiệu lực từ hôm nay.
 *  2. Xóa hẳn lịch sử: kết quả các ngày trước hôm nay, việc phụ đã xong trước hôm nay, bản nhiệm vụ chính đã ngừng.
 * Bước 1 ghi trước vì rules chỉ cho xóa `days` có ngày trước `createdDate`. Kết quả tích của hôm nay giữ nguyên.
 */
export const useRestart = () => {
  const { $firebase } = useNuxtApp();
  const { workspace } = useWorkspace();
  const { tasks } = useTasks();

  const deleteAll = async (refs: DocumentReference[]) => {
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch($firebase.firestore);
      for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
      await batch.commit();
    }
  };

  const restartFromToday = async (): Promise<RestartResult> => {
    const ws = workspace.value;
    if (!ws) throw new Error("Chưa có workspace");
    const db = $firebase.firestore;
    const today = todayKey();
    const taskRef = (id: string) => doc(db, "workspaces", ws.id, "tasks", id);

    // 1. Workspace + nhiệm vụ chính còn hiệu lực
    const batch = writeBatch(db);
    batch.update(doc(db, "workspaces", ws.id), {
      createdDate: today,
      // null → ngày kế tiếp cần chốt là createdDate (hôm nay), các ngày cũ không bị chốt lại
      lastClosedDate: null,
      penaltyTotal: 0,
      rewardTotal: 0,
      rewardDays: 0,
      missStreak: 0,
      restDays: (ws.restDays ?? []).filter((d) => d >= today),
    });
    const endedMain: DocumentReference[] = [];
    for (const task of tasks.value.filter(isMainTask)) {
      if (task.endsOn !== null && task.endsOn <= today) endedMain.push(taskRef(task.id));
      else if (task.effectiveFrom < today) batch.update(taskRef(task.id), { effectiveFrom: today });
    }
    await batch.commit();

    // 2. Lịch sử cũ: days/{date} với date < hôm nay (theo id tài liệu, kể cả tài liệu thiếu trường date)
    const oldDays = await getDocs(query(collection(db, "workspaces", ws.id, "days"), where(documentId(), "<", today)));
    const doneSide = tasks.value.filter(isSideTask).filter((t) => t.doneDate !== null && t.doneDate < today).map((t) => taskRef(t.id));
    await deleteAll(oldDays.docs.map((d) => d.ref));
    await deleteAll([...doneSide, ...endedMain]);

    return { daysDeleted: oldDays.size, tasksDeleted: doneSide.length + endedMain.length };
  };

  return { restartFromToday };
};
