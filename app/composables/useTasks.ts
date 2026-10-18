import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import {
  ASSIGN_NOTIFY_WINDOW_MS,
  isMainTask,
  isScheduledOn,
  isSideTask,
  normalizeTask,
  type MainTask,
  type Proof,
  type SideTask,
  type Task,
} from "#shared/utils/models";
import { todayKey, tomorrowKey } from "#shared/utils/dates";

export interface MainTaskInput {
  title: string;
  note: string;
  requiresProof: boolean;
  weekdays: number[];
  reminderTime: string | null;
  /** Hạn hoàn thành trong ngày (HH:mm), null = tới hết ngày */
  deadlineTime: string | null;
}

export interface SideTaskInput {
  title: string;
  note?: string;
  requiresProof?: boolean;
  reminderTime?: string | null;
}

/** Nhiệm vụ chính + phụ của workspace, cập nhật realtime. */
export const useTasks = () => {
  const { $firebase } = useNuxtApp();
  const { user } = useAuth();
  const { workspace } = useWorkspace();

  const tasks = useState<Task[]>("tasks", () => []);
  const ready = useState<boolean>("tasks:ready", () => false);
  const unsubscribe = useState<Unsubscribe | null>("tasks:unsub", () => null);
  const toast = useToast();

  /** Báo trong app khi thành viên khác vừa thêm nhiệm vụ phụ (giao việc cho mình) */
  const notifyAssigned = (task: SideTask) => {
    const by = workspace.value?.members[task.createdBy];
    toast.add({
      title: `${by?.displayName || by?.email || "Thành viên"} vừa giao việc phụ`,
      description: task.title,
      color: "info",
      icon: "i-lucide-list-plus",
      duration: 10_000,
    });
  };

  const tasksRef = () => collection($firebase.firestore, "workspaces", requireWs(), "tasks");
  const taskRef = (id: string) => doc($firebase.firestore, "workspaces", requireWs(), "tasks", id);
  const requireWs = () => {
    const id = workspace.value?.id;
    if (!id) throw new Error("Chưa có workspace");
    return id;
  };
  const requireUid = () => {
    const uid = user.value?.uid;
    if (!uid) throw new Error("User is not authenticated");
    return uid;
  };

  const bind = (workspaceId: string) => {
    unbind();
    let initial = true;
    unsubscribe.value = onSnapshot(
      collection($firebase.firestore, "workspaces", workspaceId, "tasks"),
      (snap) => {
        tasks.value = snap.docs.map((d) => normalizeTask({ id: d.id, ...d.data() } as Task));
        ready.value = true;

        // Sau lần tải đầu: nhiệm vụ phụ mới do người khác tạo gần đây → báo cho mình
        if (!initial && !snap.metadata.hasPendingWrites) {
          const uid = user.value?.uid;
          for (const change of snap.docChanges()) {
            if (change.type !== "added") continue;
            const task = normalizeTask({ id: change.doc.id, ...change.doc.data() } as Task);
            if (!isSideTask(task) || task.createdBy === uid) continue;
            if (Date.now() - task.createdAt > ASSIGN_NOTIFY_WINDOW_MS) continue;
            notifyAssigned(task);
          }
        }
        initial = false;
      },
      (error) => console.error("tasks listener", error)
    );
  };

  const unbind = () => {
    unsubscribe.value?.();
    unsubscribe.value = null;
    tasks.value = [];
    ready.value = false;
  };

  // ---- Truy vấn dẫn xuất ----
  const mainTasks = computed(() => tasks.value.filter(isMainTask).sort((a, b) => a.order - b.order));

  /** Nhiệm vụ chính lên lịch cho ngày `date` */
  const mainTasksFor = (date: string) => mainTasks.value.filter((t) => isScheduledOn(t, date));

  /** Nhiệm vụ phụ hiện trong ngày `date`: chưa xong (dồn từ các ngày trước) hoặc xong đúng ngày đó */
  const sideTasksFor = (date: string) =>
    tasks.value
      .filter(isSideTask)
      .filter((t) => (t.doneDate === null && t.createdDate <= date) || t.doneDate === date)
      .sort((a, b) => a.createdAt - b.createdAt);

  // ---- Nhiệm vụ chính ----
  const createMainTask = async (input: MainTaskInput) => {
    const ref = doc(tasksRef());
    const order = mainTasks.value.length ? Math.max(...mainTasks.value.map((t) => t.order)) + 1 : 0;
    const data: Omit<MainTask, "id"> = {
      type: "main",
      ...input,
      // Thêm mới có hiệu lực ngay hôm nay (chỉ thêm việc cho mình, không có lợi khi gian lận)
      effectiveFrom: todayKey(),
      endsOn: null,
      lineageId: ref.id,
      order,
      createdBy: requireUid(),
      createdAt: Date.now(),
    };
    await setDoc(ref, data);
  };

  /**
   * Sửa nhiệm vụ chính. Đổi lịch (thứ lặp lại) hoặc yêu cầu ảnh chỉ có hiệu lực từ ngày mai:
   * đóng bản cũ (endsOn = ngày mai) và tạo bản mới, để không "sửa cho khỏi bị phạt" hôm nay.
   * Tên, ghi chú, giờ nhắc thì sửa tại chỗ. Trả về true nếu đã tạo bản mới.
   */
  const updateMainTask = async (task: MainTask, input: MainTaskInput): Promise<boolean> => {
    const sameWeekdays =
      task.weekdays.length === input.weekdays.length &&
      task.weekdays.every((d) => input.weekdays.includes(d));
    // Đổi lịch, yêu cầu ảnh hay hạn giờ đều chỉ có hiệu lực từ ngày mai (không nới hạn cho hôm nay)
    const scheduleChanged =
      !sameWeekdays ||
      task.requiresProof !== input.requiresProof ||
      (task.deadlineTime ?? null) !== (input.deadlineTime ?? null);
    const notEffectiveYet = task.effectiveFrom > todayKey();

    if (!scheduleChanged || notEffectiveYet) {
      await updateDoc(taskRef(task.id), { ...input });
      return false;
    }

    const tomorrow = tomorrowKey();
    const batch = writeBatch($firebase.firestore);
    batch.update(taskRef(task.id), { endsOn: tomorrow });
    const next: Omit<MainTask, "id"> = {
      type: "main",
      ...input,
      effectiveFrom: tomorrow,
      endsOn: null,
      lineageId: task.lineageId,
      order: task.order,
      createdBy: requireUid(),
      createdAt: Date.now(),
    };
    batch.set(doc(tasksRef()), next);
    await batch.commit();
    return true;
  };

  /** Ngừng nhiệm vụ chính từ ngày mai (hôm nay vẫn tính). Chưa có hiệu lực thì xóa luôn. */
  const archiveMainTask = async (task: MainTask) => {
    if (task.effectiveFrom > todayKey()) {
      await deleteDoc(taskRef(task.id));
      return;
    }
    await updateDoc(taskRef(task.id), { endsOn: tomorrowKey() });
  };

  // ---- Nhiệm vụ phụ ----
  const createSideTask = async (input: SideTaskInput): Promise<string> => {
    const data: Omit<SideTask, "id"> = {
      type: "side",
      title: input.title.trim(),
      note: input.note?.trim() ?? "",
      requiresProof: input.requiresProof ?? false,
      reminderTime: input.reminderTime || null,
      createdDate: todayKey(),
      doneDate: null,
      doneAt: null,
      doneBy: null,
      proofs: [],
      createdBy: requireUid(),
      createdAt: Date.now(),
    };
    const ref = await addDoc(tasksRef(), data);
    return ref.id;
  };

  const updateSideTask = async (task: SideTask, input: SideTaskInput) => {
    await updateDoc(taskRef(task.id), {
      title: input.title.trim(),
      note: input.note?.trim() ?? "",
      requiresProof: input.requiresProof ?? false,
      reminderTime: input.reminderTime || null,
    });
  };

  /** Tích/bỏ tích nhiệm vụ phụ. Việc cần ảnh phải kèm ít nhất 1 ảnh. */
  const setSideTaskDone = async (task: SideTask, done: boolean, proofs: Proof[] = [], date: string = todayKey()) => {
    if (done && task.requiresProof && proofs.length === 0) {
      throw new Error("Nhiệm vụ này cần ít nhất một ảnh chứng minh");
    }
    await updateDoc(taskRef(task.id), {
      doneDate: done ? date : null,
      doneAt: done ? Date.now() : null,
      doneBy: done ? requireUid() : null,
      proofs: done ? proofs : [],
    });
  };

  const deleteSideTask = async (task: SideTask) => {
    await deleteDoc(taskRef(task.id));
  };

  /** Xóa theo id (dùng cho "Hoàn tác" ngay sau khi thêm nhanh) */
  const deleteTaskById = async (id: string) => {
    await deleteDoc(taskRef(id));
  };

  return {
    tasks,
    ready,
    mainTasks,
    mainTasksFor,
    sideTasksFor,
    bind,
    unbind,
    createMainTask,
    updateMainTask,
    archiveMainTask,
    createSideTask,
    updateSideTask,
    setSideTaskDone,
    deleteSideTask,
    deleteTaskById,
  };
};
