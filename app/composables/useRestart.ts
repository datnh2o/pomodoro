import { doc, writeBatch } from "firebase/firestore";
import { isMainTask } from "#shared/utils/models";
import { todayKey } from "#shared/utils/dates";

/**
 * Bắt đầu lại từ hôm nay (chỉ chủ sở hữu): ngày bắt đầu tính = hôm nay, mọi nhiệm vụ chính có hiệu lực
 * từ hôm nay, ví và chuỗi lỡ về 0. Các ngày cũ không bị xóa nhưng nằm trước ngày bắt đầu nên thống kê,
 * nhật ký và chuỗi bỏ qua. Kết quả tích của hôm nay (nếu có) giữ nguyên.
 */
export const useRestart = () => {
  const { $firebase } = useNuxtApp();
  const { workspace } = useWorkspace();
  const { tasks } = useTasks();

  const restartFromToday = async () => {
    const ws = workspace.value;
    if (!ws) throw new Error("Chưa có workspace");
    const today = todayKey();
    const batch = writeBatch($firebase.firestore);

    batch.update(doc($firebase.firestore, "workspaces", ws.id), {
      createdDate: today,
      // null → ngày kế tiếp cần chốt là createdDate (hôm nay), các ngày cũ không bị chốt lại
      lastClosedDate: null,
      penaltyTotal: 0,
      rewardTotal: 0,
      rewardDays: 0,
      missStreak: 0,
      restDays: (ws.restDays ?? []).filter((d) => d >= today),
    });

    for (const task of tasks.value.filter(isMainTask)) {
      // Bản đã ngừng trước hôm nay không còn lịch, để nguyên
      if (task.endsOn !== null && task.endsOn <= today) continue;
      if (task.effectiveFrom < today) {
        batch.update(doc($firebase.firestore, "workspaces", ws.id, "tasks", task.id), { effectiveFrom: today });
      }
    }

    await batch.commit();
  };

  return { restartFromToday };
};
