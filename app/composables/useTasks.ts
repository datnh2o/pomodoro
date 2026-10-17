import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

export interface Task {
  id: string;
  title: string;
  pomos: number;
  note: string | null;
  done: boolean;
  createdAt?: number;
}

/** Dữ liệu nhập từ form (tạo mới / sửa) */
export type TaskDraft = Pick<Task, "title" | "pomos" | "note">;
/** Phần cập nhật một task */
export type TaskPatch = Partial<Pick<Task, "title" | "pomos" | "note" | "done">>;

const COLLECTION = "Tasks";

/** CRUD task trên Firestore, luôn giới hạn theo user đang đăng nhập (khớp firestore.rules). */
export const useTasks = () => {
  const { $firebase } = useNuxtApp();

  const tasksRef = () => collection($firebase.firestore, COLLECTION);
  const taskRef = (id: string) => doc($firebase.firestore, COLLECTION, id);

  const requireUid = (): string => {
    const uid = $firebase.auth.currentUser?.uid;
    if (!uid) throw new Error("User is not authenticated");
    return uid;
  };

  const fetchTasks = async (): Promise<Task[]> => {
    const uid = requireUid();
    const snapshot = await getDocs(query(tasksRef(), where("userId", "==", uid)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) }))
      // Sắp xếp phía client để không cần composite index trên Firestore
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  };

  const createTask = async (draft: TaskDraft): Promise<Task> => {
    const uid = requireUid();
    const data = { ...draft, done: false, userId: uid, createdAt: Date.now() };
    const ref = await addDoc(tasksRef(), data);
    return { id: ref.id, ...data };
  };

  const updateTask = (id: string, patch: TaskPatch) => updateDoc(taskRef(id), patch);

  const deleteTask = (id: string) => deleteDoc(taskRef(id));

  /** Xóa toàn bộ task của user hiện tại trong một batch (nguyên tử). */
  const clearTasks = async () => {
    const uid = requireUid();
    const snapshot = await getDocs(query(tasksRef(), where("userId", "==", uid)));
    const batch = writeBatch($firebase.firestore);
    snapshot.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  };

  return { fetchTasks, createTask, updateTask, deleteTask, clearTasks };
};
