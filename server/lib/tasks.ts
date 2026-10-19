import type { DocumentReference } from "firebase-admin/firestore";
import { isMainTask, isSideTask, normalizeTask, type Task } from "../../shared/utils/models";

/**
 * Chỉ đọc nhiệm vụ còn dùng tới, không đọc cả bộ sưu tập (việc phụ đã xong tích lũy mãi, mà job nhắc
 * chạy mỗi phút và widget gọi nhiều lần mỗi ngày trên gói Spark chỉ có 50K lượt đọc/ngày):
 *  - nhiệm vụ chính còn hiệu lực (endsOn == null) hoặc ngừng sau ngày `since` (vẫn có lịch từ `since`)
 *  - việc phụ chưa xong (doneDate == null)
 * Mỗi truy vấn lọc một trường nên dùng index tự động, không cần tạo composite index.
 */
export const loadTasks = async (wsRef: DocumentReference, since: string) => {
  const tasks = wsRef.collection("tasks");
  const [active, ended, pendingSide] = await Promise.all([
    tasks.where("endsOn", "==", null).get(),
    tasks.where("endsOn", ">", since).get(),
    tasks.where("doneDate", "==", null).get(),
  ]);
  const toTask = (d: { id: string; data: () => unknown }) => normalizeTask({ id: d.id, ...(d.data() as object) } as Task);
  return {
    mainTasks: [...active.docs, ...ended.docs].map(toTask).filter(isMainTask),
    sideTasks: pendingSide.docs.map(toTask).filter(isSideTask),
  };
};
