import type { MainTask } from "#shared/utils/models";
import { currentTimeHHmm } from "#shared/utils/dates";

/**
 * Nhắc trong app khi tới giờ của nhiệm vụ chính (khi app đang mở).
 * Nhắc đẩy khi app đóng cần server (Phase 4).
 */
export const useReminders = () => {
  const toast = useToast();
  const { today } = useDay();
  const notified = useState<Set<string>>("reminders:notified", () => new Set());

  const permission = ref<NotificationPermission | "unsupported">("unsupported");
  onMounted(() => {
    permission.value = "Notification" in window ? Notification.permission : "unsupported";
  });

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    permission.value = await Notification.requestPermission();
  };

  const notify = (task: MainTask) => {
    toast.add({
      title: `Đến giờ: ${task.title}`,
      description: task.requiresProof ? "Nhớ chụp ảnh chứng minh khi xong." : undefined,
      color: "warning",
      icon: "i-lucide-bell",
      duration: 15_000,
    });
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(`Đến giờ: ${task.title}`, { body: "Đi làm thôi!", icon: "/icons/icon-192.png" });
      } catch {
        /* một số trình duyệt mobile không cho tạo Notification trực tiếp */
      }
    }
  };

  /** Gọi định kỳ với danh sách nhiệm vụ chính hôm nay chưa hoàn thành */
  const check = (pendingTasks: MainTask[]) => {
    const now = currentTimeHHmm();
    for (const task of pendingTasks) {
      if (task.reminderTime !== now) continue;
      const key = `${today.value}:${task.id}`;
      if (notified.value.has(key)) continue;
      notified.value.add(key);
      notify(task);
    }
  };

  return { permission, requestPermission, check };
};
