import type { MainTask, Proof, SideTask, Task } from "#shared/utils/models";

/**
 * Hàng đợi ảnh chứng minh khi mất mạng: lưu file vào IndexedDB, khi có mạng lại thì tải lên
 * Cloudinary và ghi hoàn thành cho đúng ngày đã chụp.
 */
export interface QueuedProof {
  id: string;
  workspaceId: string;
  date: string;
  /** main: ghi vào days/{date}; side: ghi lên chính tài liệu nhiệm vụ phụ */
  kind: "main" | "side";
  taskId: string;
  taskTitle: string;
  files: Blob[];
  createdAt: number;
  lastError?: string;
}

const DB_NAME = "daily-tasks";
const STORE = "proofQueue";

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
};

export const useProofQueue = () => {
  const { workspace } = useWorkspace();
  const { upload } = useProofUpload();
  const { complete } = useDay();
  const { setSideTaskDone } = useTasks();

  const items = useState<QueuedProof[]>("proofQueue:items", () => []);
  const flushing = useState<boolean>("proofQueue:flushing", () => false);
  const online = useState<boolean>("proofQueue:online", () => true);

  const load = async () => {
    if (!import.meta.client || !("indexedDB" in window)) return;
    try {
      items.value = await withStore<QueuedProof[]>("readonly", (s) => s.getAll());
    } catch (error) {
      console.warn("Không đọc được hàng đợi ảnh", error);
    }
  };

  const enqueue = async (task: MainTask | SideTask, date: string, files: Blob[]) => {
    const ws = workspace.value;
    if (!ws) throw new Error("Chưa có workspace");
    const entry: QueuedProof = {
      id: `${date}:${task.id}:${Date.now()}`,
      workspaceId: ws.id,
      date,
      kind: task.type,
      taskId: task.id,
      taskTitle: task.title,
      files,
      createdAt: Date.now(),
    };
    await withStore("readwrite", (s) => s.put(entry));
    items.value = [...items.value, entry];
  };

  const remove = async (id: string) => {
    await withStore("readwrite", (s) => s.delete(id));
    items.value = items.value.filter((i) => i.id !== id);
  };

  /** Có ảnh đang chờ cho nhiệm vụ này trong ngày này không */
  const isQueued = (taskId: string, date: string) =>
    items.value.some((i) => i.taskId === taskId && i.date === date && i.workspaceId === workspace.value?.id);

  /** Tải các mục đang chờ. Trả về số mục đã xử lý xong. */
  const flush = async (tasks: Task[]): Promise<number> => {
    const ws = workspace.value;
    if (!ws || flushing.value || !navigator.onLine) return 0;
    const mine = items.value.filter((i) => i.workspaceId === ws.id);
    if (!mine.length) return 0;
    flushing.value = true;
    let done = 0;
    try {
      for (const entry of mine) {
        const task = tasks.find((t) => t.id === entry.taskId);
        if (!task) {
          await remove(entry.id);
          continue;
        }
        try {
          const proofs: Proof[] = [];
          for (const file of entry.files) {
            proofs.push(await upload(new File([file], "proof.jpg", { type: file.type || "image/jpeg" }), `${ws.id}/${entry.date}`));
          }
          if (task.type === "main") await complete(task, proofs, entry.date);
          else await setSideTaskDone(task, true, proofs, entry.date);
          await remove(entry.id);
          done++;
        } catch (error) {
          entry.lastError = (error as Error).message;
          await withStore("readwrite", (s) => s.put({ ...entry }));
          if (!navigator.onLine) break;
        }
      }
    } finally {
      flushing.value = false;
    }
    return done;
  };

  onMounted(() => {
    online.value = navigator.onLine;
    load();
    const update = () => (online.value = navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    onBeforeUnmount(() => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    });
  });

  return { items, online, flushing, enqueue, remove, isQueued, flush, load };
};
