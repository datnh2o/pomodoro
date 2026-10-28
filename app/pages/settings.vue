<script setup lang="ts">
import type { MainTask } from "#shared/utils/models";
import { groupByPeriod, slotTimeOf } from "~/utils/periods";
import type { MainTaskInput } from "~/composables/useTasks";
import type { SubAccountInput } from "~/composables/useMembers";
import {
  DEFAULT_EVENING_REMINDER,
  DEFAULT_MORNING_REMINDER,
  DEFAULT_REST_CUTOFF,
  DEFAULT_REST_LIMIT,
  DEFAULT_WEEKLY_REPORT_TIME,
  isActiveFrom,
  penaltySettingsOn,
} from "#shared/utils/models";
import { addDays, formatDateVi, formatMoney, formatShortVi, formatWeekdays, todayKey, tomorrowKey } from "#shared/utils/dates";
import { buildScriptableWidget, SCRIPTABLE_APP_URL } from "~/utils/scriptableWidget";

const { user } = useAuth();
const { workspace, can, isOwner, updatePenaltySettings } = useWorkspace();
const { mainTasks, createMainTask, updateMainTask, archiveMainTask } = useTasks();
const push = usePush();
const { resetPassword } = useAuth();
const { updateEveningReminder, addRestDay, removeRestDay, restDaysInMonth, updateSettings } = useWorkspace();
const { confirmAction } = useConfirm();
const { restartFromToday } = useRestart();

// ---- Kỷ luật & nhắc nhở (owner) ----
const discipline = reactive({
  penaltyEscalation: true,
  restLimitPerMonth: String(DEFAULT_REST_LIMIT),
  restCutoffTime: DEFAULT_REST_CUTOFF,
  morningReminderTime: DEFAULT_MORNING_REMINDER,
  supervisorEmail: "",
  weeklyReportTime: DEFAULT_WEEKLY_REPORT_TIME,
});
watch(
  workspace,
  (ws) => {
    if (!ws) return;
    // Hiện giá trị sẽ áp dụng từ ngày mai (gồm cả thay đổi đang hẹn)
    discipline.penaltyEscalation = penaltySettingsOn(ws, tomorrowKey()).escalation;
    discipline.restLimitPerMonth = String(ws.restLimitPerMonth ?? DEFAULT_REST_LIMIT);
    discipline.restCutoffTime = ws.restCutoffTime ?? DEFAULT_REST_CUTOFF;
    discipline.morningReminderTime = ws.morningReminderTime === undefined ? DEFAULT_MORNING_REMINDER : (ws.morningReminderTime ?? "");
    discipline.supervisorEmail = ws.supervisorEmail ?? "";
    discipline.weeklyReportTime = ws.weeklyReportTime ?? DEFAULT_WEEKLY_REPORT_TIME;
  },
  { immediate: true }
);
const saveDiscipline = async () => {
  const limit = Number(discipline.restLimitPerMonth);
  if (!Number.isInteger(limit) || limit < 0 || limit > 31) {
    showError("Giới hạn nghỉ không hợp lệ", new Error("Nhập số từ 0 đến 31"));
    return;
  }
  const email = discipline.supervisorEmail.trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    showError("Email giám sát không hợp lệ", new Error(email));
    return;
  }
  try {
    if (discipline.penaltyEscalation !== penaltyTomorrow.value?.escalation) {
      await updatePenaltySettings({ escalation: discipline.penaltyEscalation });
    }
    await updateSettings({
      restLimitPerMonth: limit,
      restCutoffTime: discipline.restCutoffTime || DEFAULT_REST_CUTOFF,
      morningReminderTime: discipline.morningReminderTime || null,
      supervisorEmail: email || null,
      weeklyReportTime: discipline.weeklyReportTime || DEFAULT_WEEKLY_REPORT_TIME,
    });
    toast.add({ title: "Đã lưu cài đặt kỷ luật", color: "success" });
  } catch (error) {
    showError("Không lưu được", error);
  }
};

// ---- Tab ----
const tab = ref("tasks");
const tabItems = computed(() => [
  { label: "Nhiệm vụ", value: "tasks", slot: "tasks" as const, icon: "i-lucide-list-checks" },
  ...(isOwner.value ? [{ label: "Kỷ luật", value: "discipline", slot: "discipline" as const, icon: "i-lucide-gavel" }] : []),
  ...(isOwner.value ? [{ label: "Thành viên", value: "members", slot: "members" as const, icon: "i-lucide-users" }] : []),
  { label: "Thông báo", value: "notifications", slot: "notifications" as const, icon: "i-lucide-bell" },
  { label: "Tài khoản", value: "account", slot: "account" as const, icon: "i-lucide-user" },
]);

// ---- Bắt đầu lại từ hôm nay (owner) ----
const restarting = ref(false);
const onRestart = async () => {
  const ok = await confirmAction({
    title: "Bắt đầu lại từ hôm nay?",
    description:
      "Xóa hẳn kết quả các ngày trước hôm nay và việc phụ đã xong trước hôm nay; tổng nợ, tiền thưởng, số rương và chuỗi về 0; mọi nhiệm vụ chính có hiệu lực từ hôm nay. Việc đã tích hôm nay giữ nguyên. Không hoàn tác được.",
    confirmLabel: "Bắt đầu lại",
    color: "error",
    icon: "i-lucide-rotate-ccw",
  });
  if (!ok) return;
  restarting.value = true;
  try {
    const result = await restartFromToday();
    toast.add({
      title: "Đã bắt đầu lại từ hôm nay",
      description: `Đã xóa ${result.daysDeleted} ngày cũ và ${result.tasksDeleted} nhiệm vụ cũ.`,
      color: "success",
      icon: "i-lucide-rotate-ccw",
    });
  } catch (error) {
    showError("Không bắt đầu lại được", error);
  } finally {
    restarting.value = false;
  }
};

// ---- Chế độ nghỉ ----
const restInput = ref("");
const upcomingRestDays = computed(() =>
  [...(workspace.value?.restDays ?? [])].filter((d) => d >= today.value).sort()
);
const onAddRest = async (date: string) => {
  if (!date) return;
  try {
    await addRestDay(date);
    restInput.value = "";
    toast.add({ title: "Đã khai ngày nghỉ", description: formatDateVi(date), color: "success", icon: "i-lucide-palmtree" });
  } catch (error) {
    showError("Không khai được ngày nghỉ", error);
  }
};
const onRemoveRest = async (date: string) => {
  try {
    await removeRestDay(date);
  } catch (error) {
    showError("Không bỏ được ngày nghỉ", error);
  }
};

// ---- Nhắc đẩy ----
const onTogglePush = async (enabled: boolean) => {
  try {
    if (enabled) {
      await push.subscribe();
      toast.add({ title: "Đã bật nhắc đẩy trên thiết bị này", color: "success", icon: "i-lucide-bell" });
    } else {
      await push.unsubscribe();
    }
  } catch (error) {
    showError("Không bật được nhắc đẩy", error);
  }
};

const eveningInput = ref("");
watch(() => workspace.value?.eveningReminderTime, (v) => { eveningInput.value = v ?? DEFAULT_EVENING_REMINDER; }, { immediate: true });
const saveEvening = async () => {
  try {
    await updateEveningReminder(eveningInput.value || null);
    toast.add({ title: "Đã lưu giờ nhắc cuối ngày", color: "success" });
  } catch (error) {
    showError("Không lưu được", error);
  }
};
const { members, createSubAccount, updateMember, removeMember, shareUrl, enableShareLink, disableShareLink } = useMembers();
const { showError } = useErrorToast();
const toast = useToast();

// ---- Thành viên ----
const subAccountOpen = ref(false);
const memberBusy = ref<string | null>(null);

const onCreateSubAccount = async (input: SubAccountInput) => {
  try {
    await createSubAccount(input);
    toast.add({
      title: "Đã tạo tài khoản con",
      description: `${input.email} đăng nhập tại cùng địa chỉ app này.`,
      color: "success",
    });
  } catch (error) {
    showError("Không tạo được tài khoản", error);
  }
};

const onTogglePermission = async (uid: string, key: "add" | "edit", value: boolean) => {
  const member = workspace.value?.members[uid];
  if (!member) return;
  memberBusy.value = uid;
  try {
    const next = { add: member.add, edit: member.edit, [key]: value };
    // Quyền sửa bao hàm quyền thêm
    if (key === "edit" && value) next.add = true;
    if (key === "add" && !value) next.edit = false;
    await updateMember(uid, next);
  } catch (error) {
    showError("Không đổi được quyền", error);
  } finally {
    memberBusy.value = null;
  }
};

const onRemoveMember = async (uid: string, name: string) => {
  const ok = await confirmAction({
    title: `Gỡ ${name} khỏi bảng này?`,
    description: "Họ vẫn đăng nhập được nhưng sẽ dùng bảng riêng.",
    confirmLabel: "Gỡ",
    color: "error",
    icon: "i-lucide-user-minus",
  });
  if (!ok) return;
  try {
    await removeMember(uid);
  } catch (error) {
    showError("Không gỡ được", error);
  }
};

// ---- Link chia sẻ ----
const shareBusy = ref(false);
const onToggleShare = async (enabled: boolean) => {
  shareBusy.value = true;
  try {
    if (enabled) await enableShareLink();
    else await disableShareLink();
  } catch (error) {
    showError("Không cập nhật được link", error);
  } finally {
    shareBusy.value = false;
  }
};
const copyShareUrl = async () => {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    toast.add({ title: "Đã sao chép link", color: "success" });
  } catch {
    toast.add({ title: "Không sao chép được", description: shareUrl.value, color: "warning" });
  }
};

// ---- Widget màn hình chính (Scriptable), đọc qua mã link chia sẻ ----
const widgetScript = computed(() => {
  const token = workspace.value?.shareToken;
  if (!token) return null;
  const origin = window.location.origin;
  return buildScriptableWidget(`${origin}/api/widget/${token}`, `${origin}/`);
});
const copyWidgetScript = async () => {
  if (!widgetScript.value) return;
  try {
    await navigator.clipboard.writeText(widgetScript.value);
    toast.add({ title: "Đã sao chép script widget", description: "Mở Scriptable, tạo script mới rồi dán vào.", color: "success" });
  } catch {
    toast.add({ title: "Không sao chép được", description: "Thử lại trên Safari của iPhone.", color: "warning" });
  }
};

const today = computed(() => todayKey());
const activeMain = computed(() =>
  mainTasks.value
    .filter((t) => isActiveFrom(t, today.value))
    .sort((a, b) => (slotTimeOf(a) ?? "99:99").localeCompare(slotTimeOf(b) ?? "99:99") || a.order - b.order)
);
/** Chia theo buổi như màn Hôm nay (Sáng / Trưa-chiều / Tối / Chưa đặt giờ) */
const activeGroups = computed(() => groupByPeriod(activeMain.value));
const showPeriodHeader = computed(() => activeGroups.value.length > 1 || activeGroups.value[0]?.key !== "anytime");

const weekdaysLabel = (task: MainTask) => formatWeekdays(task.weekdays);

// ---- Form nhiệm vụ chính ----
const formOpen = ref(false);
const editing = ref<MainTask | null>(null);

const openCreate = () => {
  editing.value = null;
  formOpen.value = true;
};
const openEdit = (task: MainTask) => {
  editing.value = task;
  formOpen.value = true;
};

const onSave = async (input: MainTaskInput) => {
  try {
    if (editing.value) {
      const replaced = await updateMainTask(editing.value, input);
      toast.add({
        title: "Đã lưu",
        description: replaced ? "Lịch mới có hiệu lực từ ngày mai." : undefined,
        color: "success",
      });
    } else {
      await createMainTask(input);
      toast.add({ title: "Đã thêm nhiệm vụ chính", color: "success" });
    }
  } catch (error) {
    showError("Không lưu được", error);
  }
};

const onArchive = async (task: MainTask) => {
  const ok = await confirmAction({
    title: `Ngừng "${task.title}"?`,
    description: "Hôm nay vẫn tính, từ ngày mai sẽ không còn.",
    confirmLabel: "Ngừng",
    color: "error",
    icon: "i-lucide-archive",
  });
  if (!ok) return;
  try {
    await archiveMainTask(task);
  } catch (error) {
    showError("Không ngừng được", error);
  }
};

const taskMenu = (task: MainTask) => [
  [
    { label: "Sửa", icon: "i-lucide-pencil", onSelect: () => openEdit(task) },
    { label: "Ngừng từ ngày mai", icon: "i-lucide-archive", color: "error" as const, onSelect: () => onArchive(task) },
  ],
];

// ---- Mức phạt & thưởng (đổi chỉ có hiệu lực từ ngày mai) ----
const penaltyToday = computed(() => (workspace.value ? penaltySettingsOn(workspace.value, today.value) : null));
const penaltyTomorrow = computed(() => (workspace.value ? penaltySettingsOn(workspace.value, addDays(today.value, 1)) : null));
const penaltyInput = ref("");
const rewardInput = ref("");
watch(() => penaltyTomorrow.value?.amount, (v) => { penaltyInput.value = String(v ?? ""); }, { immediate: true });
watch(() => penaltyTomorrow.value?.reward, (v) => { rewardInput.value = String(v ?? ""); }, { immediate: true });
const savePenalty = async () => {
  const amount = Number(penaltyInput.value);
  const reward = Number(rewardInput.value);
  if (![amount, reward].every((n) => Number.isInteger(n) && n >= 0)) {
    showError("Số tiền không hợp lệ", new Error("Nhập số nguyên không âm"));
    return;
  }
  try {
    await updatePenaltySettings({ amount, reward });
    toast.add({
      title: "Đã cập nhật mức phạt & thưởng",
      description: `Phạt ${formatMoney(amount)}, thưởng ${formatMoney(reward)}, áp dụng từ ${formatShortVi(addDays(today.value, 1))}`,
      color: "success",
    });
  } catch (error) {
    showError("Không lưu được", error);
  }
};

// ---- Tài khoản ----
const profileOpen = ref(false);
const onChangePassword = async () => {
  if (!user.value?.email) return;
  try {
    await resetPassword(user.value.email);
    toast.add({ title: "Đã gửi email đổi mật khẩu", description: user.value.email, color: "success" });
  } catch (error) {
    showError("Không gửi được email", error);
  }
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Ưu tiên màn điện thoại: 5 tab chia đều, icon trên nhãn dưới để không bị cắt chữ -->
    <UTabs
      v-model="tab"
      :items="tabItems"
      color="primary"
      variant="pill"
      :ui="{
        root: 'gap-4',
        list: 'p-1',
        trigger: 'flex-col gap-1 px-1 py-2 min-w-0',
        leadingIcon: 'size-5',
        label: 'text-[11px] leading-tight whitespace-nowrap',
        content: 'min-w-0',
      }"
    >
      <template #tasks>
        <div class="flex flex-col gap-6">
    <!-- Nhiệm vụ chính -->
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nhiệm vụ chính</h2>
        <UButton v-if="can('edit')" size="sm" icon="i-lucide-plus" @click="openCreate">Thêm</UButton>
      </div>

      <div v-if="!activeMain.length" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
        Chưa có nhiệm vụ chính nào.
      </div>
      <div v-else class="flex flex-col gap-2">
      <template v-for="group in activeGroups" :key="group.key">
        <PeriodHeader v-if="showPeriodHeader" :label="group.label" :icon="group.icon" :done="group.items.length" :total="group.items.length" />
        <ul class="flex flex-col gap-2">
        <li
          v-for="task in group.items"
          :key="task.id"
          class="flex items-start gap-3 rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800"
        >
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ task.title }}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ weekdaysLabel(task) }}</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <UBadge v-if="task.reminderTime" color="warning" variant="subtle" size="sm" icon="i-lucide-bell">{{ task.reminderTime }}</UBadge>
              <UBadge v-if="task.effectiveFrom > today" color="info" variant="subtle" size="sm">Từ {{ formatShortVi(task.effectiveFrom) }}</UBadge>
              <UBadge v-if="task.endsOn" color="error" variant="subtle" size="sm">Ngừng từ {{ formatShortVi(task.endsOn) }}</UBadge>
            </div>
          </div>
          <UDropdownMenu v-if="can('edit') && !task.endsOn" :items="taskMenu(task)" :content="{ align: 'end' }">
            <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical" aria-label="Tùy chọn" />
          </UDropdownMenu>
        </li>
        </ul>
      </template>
      </div>
    </section>

        </div>
      </template>

      <template #discipline>
        <div class="flex flex-col gap-6">
    <!-- Mức phạt & thưởng -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Phạt & thưởng</h2>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">Đổi số tiền có hiệu lực từ ngày mai.</p>
      <form class="flex flex-col gap-3" @submit.prevent="savePenalty">
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Phạt mỗi việc bỏ lỡ">
            <UInput v-model="penaltyInput" type="number" min="0" step="1000" class="w-full" trailing-icon="i-lucide-wallet" />
          </UFormField>
          <UFormField label="Thưởng ngày xong hết">
            <UInput v-model="rewardInput" type="number" min="0" step="1000" class="w-full" trailing-icon="i-lucide-coins" />
          </UFormField>
        </div>
        <div>
          <UButton type="submit" color="neutral" variant="outline">Lưu</UButton>
        </div>
      </form>
      <p v-if="penaltyToday && penaltyTomorrow && penaltyToday.amount !== penaltyTomorrow.amount" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
        Phạt hôm nay vẫn tính {{ formatMoney(penaltyToday.amount) }}, từ {{ formatShortVi(addDays(today, 1)) }} là {{ formatMoney(penaltyTomorrow.amount) }}.
      </p>
      <p v-if="penaltyToday && penaltyTomorrow && penaltyToday.reward !== penaltyTomorrow.reward" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
        Thưởng hôm nay vẫn là {{ formatMoney(penaltyToday.reward) }}, từ {{ formatShortVi(addDays(today, 1)) }} là {{ formatMoney(penaltyTomorrow.reward) }}.
      </p>
      <p class="mt-3 text-sm">
        Tổng nợ: <b class="text-red-600 dark:text-red-400">{{ formatMoney(workspace?.penaltyTotal ?? 0) }}</b> ·
        Tổng thưởng: <b class="text-amber-700 dark:text-amber-300">{{ formatMoney(workspace?.rewardTotal ?? 0) }}</b>
      </p>
    </section>

    <!-- Kỷ luật & giám sát (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Kỷ luật & giám sát</h2>
      <form class="flex flex-col gap-4" @submit.prevent="saveDiscipline">
        <USwitch v-model="discipline.penaltyEscalation" label="Phạt tăng dần khi lỡ liên tiếp (ngày thứ 2 ×2, thứ 3 trở đi ×4)" />
        <p v-if="penaltyToday && penaltyTomorrow && penaltyToday.escalation !== penaltyTomorrow.escalation" class="-mt-2 text-xs text-amber-600 dark:text-amber-400">
          Hôm nay vẫn {{ penaltyToday.escalation ? "bật" : "tắt" }} phạt tăng dần, thay đổi áp dụng từ {{ formatShortVi(addDays(today, 1)) }}.
        </p>
        <p v-if="(workspace?.missStreak ?? 0) > 0" class="-mt-2 text-xs text-red-600 dark:text-red-400">
          Đang lỡ {{ workspace?.missStreak }} ngày liên tiếp, lỡ tiếp sẽ nhân {{ Math.min(2 ** (workspace?.missStreak ?? 0), 4) }}.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Ngày nghỉ tối đa / tháng" :description="`Tháng này đã dùng ${restDaysInMonth(today)}`">
            <UInput v-model="discipline.restLimitPerMonth" type="number" min="0" max="31" class="w-full" />
          </UFormField>
          <UFormField label="Khai nghỉ hôm nay trước" description="Sau giờ này chỉ khai được cho ngày mai">
            <UInput v-model="discipline.restCutoffTime" type="time" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Nhắc buổi sáng" description="Liệt kê việc hôm nay qua nhắc đẩy. Để trống để tắt.">
          <UInput v-model="discipline.morningReminderTime" type="time" class="w-36" />
        </UFormField>

        <div class="rounded-lg bg-gray-50 dark:bg-gray-950 p-3">
          <p class="mb-2 text-sm font-medium">Người giám sát</p>
          <p class="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Chủ nhật hằng tuần gửi email tổng kết (tiền phạt, ngày làm đủ, việc bỏ lỡ) tới địa chỉ này. Cần cấu hình
            Resend trên server, xem .env.example.
          </p>
          <div class="grid grid-cols-[1fr_auto] gap-2">
            <UInput v-model="discipline.supervisorEmail" type="email" placeholder="email@vi-du.com" class="w-full" icon="i-lucide-mail" />
            <UInput v-model="discipline.weeklyReportTime" type="time" class="w-32" />
          </div>
        </div>

        <div>
          <UButton type="submit" color="neutral" variant="outline">Lưu</UButton>
        </div>
      </form>
    </section>

    <!-- Bắt đầu lại (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Bắt đầu lại</h2>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Xóa hẳn lịch sử trước hôm nay ({{ formatShortVi(today) }}) và đếm lại từ đầu: chuỗi, tổng nợ, tiền thưởng, số rương.
        Nhiệm vụ chính giữ nguyên, chỉ đổi ngày có hiệu lực; việc phụ đã xong trước hôm nay bị xóa.
      </p>
      <p v-if="workspace?.createdDate" class="mb-3 text-xs text-gray-500 dark:text-gray-400">Đang tính từ {{ formatDateVi(workspace.createdDate) }}.</p>
      <UButton color="error" variant="outline" icon="i-lucide-rotate-ccw" :loading="restarting" @click="onRestart">Bắt đầu lại từ hôm nay</UButton>
    </section>

    <!-- Chế độ nghỉ (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Chế độ nghỉ</h2>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Ngày nghỉ (ốm, đi xa) không tính nhiệm vụ chính, không phạt, không đứt chuỗi. Chỉ khai được cho
        hôm nay hoặc ngày sau, không khai lùi.
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-palmtree" :disabled="upcomingRestDays.includes(today)" @click="onAddRest(today)">
          Nghỉ hôm nay
        </UButton>
        <UButton color="neutral" variant="outline" size="sm" :disabled="upcomingRestDays.includes(addDays(today, 1))" @click="onAddRest(addDays(today, 1))">
          Nghỉ ngày mai
        </UButton>
      </div>
      <form class="mt-3 flex items-center gap-2" @submit.prevent="onAddRest(restInput)">
        <UInput v-model="restInput" type="date" :min="today" class="w-44" />
        <UButton type="submit" color="neutral" variant="outline" size="sm" :disabled="!restInput">Thêm ngày</UButton>
      </form>
      <ul v-if="upcomingRestDays.length" class="mt-3 flex flex-wrap gap-2">
        <li v-for="date in upcomingRestDays" :key="date">
          <UBadge color="info" variant="subtle" size="lg" class="gap-1">
            {{ date === today ? "Hôm nay" : formatShortVi(date) }}
            <button type="button" class="ml-1 flex h-5 w-5 items-center justify-center rounded-full hover:bg-sky-200" :aria-label="`Bỏ nghỉ ${date}`" @click="onRemoveRest(date)">
              <UIcon name="i-lucide-x" class="h-3.5 w-3.5" />
            </button>
          </UBadge>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-gray-400">Chưa có ngày nghỉ sắp tới.</p>
    </section>

        </div>
      </template>

      <template #members>
        <div class="flex flex-col gap-6">
    <!-- Thành viên (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Thành viên</h2>
        <UButton size="sm" icon="i-lucide-user-plus" @click="subAccountOpen = true">Tài khoản con</UButton>
      </div>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">Tài khoản con dùng chung bảng nhiệm vụ này với quyền bạn cấp.</p>
      <ul class="divide-y divide-gray-100 dark:divide-gray-800">
        <li v-for="member in members" :key="member.uid" class="flex flex-col gap-2 py-3">
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ member.displayName || member.email || member.uid }}</p>
              <p v-if="member.displayName && member.email" class="truncate text-xs text-gray-500 dark:text-gray-400">{{ member.email }}</p>
            </div>
            <UBadge v-if="member.isOwner" color="primary" variant="subtle" size="sm">Chủ sở hữu</UBadge>
            <UButton
              v-else
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-user-minus"
              aria-label="Gỡ thành viên"
              @click="onRemoveMember(member.uid, member.displayName || member.email || 'thành viên')"
            />
          </div>
          <div v-if="!member.isOwner" class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <USwitch
              :model-value="member.add"
              :disabled="memberBusy === member.uid"
              label="Thêm"
              @update:model-value="(v) => onTogglePermission(member.uid, 'add', v)"
            />
            <USwitch
              :model-value="member.edit"
              :disabled="memberBusy === member.uid"
              label="Sửa"
              @update:model-value="(v) => onTogglePermission(member.uid, 'edit', v)"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- Link chia sẻ (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Link chia sẻ</h2>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Ai có link sẽ xem được (không sửa) nhiệm vụ hôm nay, tổng nợ và thống kê tháng. Tắt là link hết hiệu lực.
      </p>
      <USwitch :model-value="!!workspace?.shareToken" :disabled="shareBusy" label="Bật link chia sẻ" @update:model-value="onToggleShare" />
      <div v-if="shareUrl" class="mt-3 flex items-center gap-2">
        <UInput :model-value="shareUrl" readonly class="flex-1" />
        <UButton color="neutral" variant="outline" icon="i-lucide-copy" aria-label="Sao chép" @click="copyShareUrl" />
        <UButton color="neutral" variant="outline" icon="i-lucide-external-link" aria-label="Mở" :to="shareUrl" target="_blank" />
      </div>
    </section>

        </div>
      </template>

      <template #notifications>
        <div class="flex flex-col gap-6">
    <!-- Thông báo -->
    <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Thông báo</h2>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Khi app đang mở, tới giờ nhiệm vụ sẽ có nhắc trong app. Bật nhắc đẩy để được nhắc cả khi app đóng:
        đúng giờ từng nhiệm vụ và một lần cuối ngày nếu còn việc chưa xong.
      </p>

      <UAlert
        v-if="push.needsHomeScreen.value"
        color="info"
        variant="subtle"
        icon="i-lucide-smartphone"
        title="Trên iPhone cần thêm app ra màn hình chính"
        description="Safari > nút Chia sẻ > Thêm vào MH chính, rồi mở app từ icon đó và bật nhắc đẩy."
        class="mb-3"
      />
      <p v-else-if="!push.supported.value" class="mb-3 text-sm text-gray-500 dark:text-gray-400">Trình duyệt này không hỗ trợ nhắc đẩy.</p>
      <p v-else-if="push.permission.value === 'denied'" class="mb-3 text-sm text-red-600 dark:text-red-400">Thông báo đang bị chặn trong cài đặt trình duyệt.</p>

      <USwitch
        :model-value="push.subscribed.value"
        :disabled="push.busy.value || !push.supported.value || push.permission.value === 'denied'"
        label="Nhắc đẩy trên thiết bị này"
        @update:model-value="onTogglePush"
      />

      <form v-if="isOwner" class="mt-4 flex flex-wrap items-center gap-2" @submit.prevent="saveEvening">
        <label class="text-sm text-gray-700 dark:text-gray-300" for="evening-time">Nhắc cuối ngày lúc</label>
        <UInput id="evening-time" v-model="eveningInput" type="time" class="w-32" />
        <UButton type="submit" color="neutral" variant="outline" size="sm">Lưu</UButton>
      </form>
    </section>

    <!-- Widget màn hình chính (iPhone, qua app Scriptable) -->
    <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Widget màn hình chính</h2>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
        iPhone chưa cho web app có widget, nên dùng app miễn phí Scriptable: hiện tiến độ hôm nay, việc tiếp theo,
        rương và tiền ngay trên màn hình chính hoặc màn hình khoá. Chạm vào widget là mở app.
      </p>
      <template v-if="widgetScript">
        <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-gray-700 dark:text-gray-300">
          <li>Cài <a :href="SCRIPTABLE_APP_URL" target="_blank" rel="noopener" class="font-medium text-primary underline">Scriptable</a> từ App Store.</li>
          <li>Bấm <b>Sao chép script</b> bên dưới.</li>
          <li>Mở Scriptable, bấm <b>+</b>, dán script, đặt tên (ví dụ "Nhiệm vụ") rồi bấm <b>Done</b>.</li>
          <li>Giữ màn hình chính → <b>Sửa</b> → <b>Thêm tiện ích</b> → <b>Scriptable</b>, chọn cỡ rồi thêm.</li>
          <li>Giữ widget vừa thêm → <b>Sửa tiện ích</b> → <b>Script</b>: chọn "Nhiệm vụ".</li>
        </ol>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Màn hình khoá: giữ màn hình khoá → Tùy chỉnh → thêm tiện ích Scriptable và chọn cùng script.
        </p>
        <UButton class="mt-3" icon="i-lucide-copy" @click="copyWidgetScript">Sao chép script</UButton>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Script chứa mã link chia sẻ chỉ đọc: ai có script đều xem được tiến độ như người có link. Tắt link chia sẻ
          thì widget ngừng hoạt động.
        </p>
      </template>
      <UAlert
        v-else
        color="info"
        variant="subtle"
        icon="i-lucide-link"
        title="Cần bật link chia sẻ chỉ đọc"
        :description="isOwner ? 'Widget đọc dữ liệu qua link chia sẻ chỉ đọc.' : 'Widget đọc dữ liệu qua link chia sẻ chỉ đọc. Nhờ chủ bảng bật trong Cài đặt > Thành viên.'"
        :actions="isOwner ? [{ label: 'Bật link chia sẻ', color: 'neutral', variant: 'outline', loading: shareBusy, onClick: () => onToggleShare(true) }] : []"
      />
    </section>

        </div>
      </template>

      <template #account>
        <div class="flex flex-col gap-6">
    <!-- Tài khoản -->
    <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tài khoản</h2>
      <div class="flex items-center gap-3">
        <UAvatar :src="user?.photoURL ?? undefined" :alt="user?.displayName ?? 'Tài khoản'" size="xl" referrerpolicy="no-referrer" />
        <div class="min-w-0">
          <p class="truncate font-medium">{{ user?.displayName ?? "Chưa đặt tên" }}</p>
          <p class="truncate text-sm text-gray-500 dark:text-gray-400">{{ user?.email }}</p>
        </div>
      </div>
      <p class="mt-2 text-xs text-gray-400">Workspace: {{ workspace?.name }} · Vai trò: {{ isOwner ? "chủ sở hữu" : "thành viên" }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton icon="i-lucide-user-round-pen" @click="profileOpen = true">Cập nhật hồ sơ</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-key-round" @click="onChangePassword">Đổi mật khẩu</UButton>
      </div>
    </section>

        </div>
      </template>
    </UTabs>

    <MainTaskForm v-model:open="formOpen" :task="editing" @save="onSave" />
    <SubAccountForm v-model:open="subAccountOpen" @save="onCreateSubAccount" />
    <ProfileForm v-model:open="profileOpen" />
  </div>
</template>
