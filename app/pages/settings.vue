<script setup lang="ts">
import type { MainTask } from "#shared/utils/models";
import type { MainTaskInput } from "~/composables/useTasks";
import type { SubAccountInput } from "~/composables/useMembers";
import {
  DEFAULT_EVENING_REMINDER,
  DEFAULT_MORNING_REMINDER,
  DEFAULT_REST_CUTOFF,
  DEFAULT_REST_LIMIT,
  DEFAULT_WEEKLY_REPORT_TIME,
  isActiveFrom,
} from "#shared/utils/models";
import { addDays, formatDateVi, formatMoney, formatShortVi, todayKey, WEEKDAY_LABELS } from "#shared/utils/dates";

const { user } = useAuth();
const { workspace, can, isOwner, updatePenaltyAmount } = useWorkspace();
const { mainTasks, createMainTask, updateMainTask, archiveMainTask } = useTasks();
const push = usePush();
const { resetPassword } = useAuth();
const { updateEveningReminder, addRestDay, removeRestDay, restDaysInMonth, updateSettings } = useWorkspace();
const { confirmAction } = useConfirm();
const colorMode = useColorMode();

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
    discipline.penaltyEscalation = ws.penaltyEscalation ?? true;
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
    await updateSettings({
      penaltyEscalation: discipline.penaltyEscalation,
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

const themeOptions = [
  { label: "Theo hệ thống", value: "system", icon: "i-lucide-monitor" },
  { label: "Sáng", value: "light", icon: "i-lucide-sun" },
  { label: "Tối", value: "dark", icon: "i-lucide-moon" },
];

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

const today = computed(() => todayKey());
const activeMain = computed(() => mainTasks.value.filter((t) => isActiveFrom(t, today.value)));

const weekdaysLabel = (task: MainTask) =>
  task.weekdays.length === 7 ? "Hằng ngày" : [...task.weekdays].sort((a, b) => (a || 7) - (b || 7)).map((d) => WEEKDAY_LABELS[d]).join(", ");

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

// ---- Mức phạt ----
const penaltyInput = ref("");
watch(() => workspace.value?.penaltyAmount, (v) => { penaltyInput.value = String(v ?? ""); }, { immediate: true });
const savePenalty = async () => {
  const amount = Number(penaltyInput.value);
  if (!Number.isInteger(amount) || amount < 0) {
    showError("Mức phạt không hợp lệ", new Error("Nhập số nguyên không âm"));
    return;
  }
  try {
    await updatePenaltyAmount(amount);
    toast.add({ title: "Đã cập nhật mức phạt", description: formatMoney(amount), color: "success" });
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
    <!-- Nhiệm vụ chính -->
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nhiệm vụ chính</h2>
        <UButton v-if="can('edit')" size="sm" icon="i-lucide-plus" @click="openCreate">Thêm</UButton>
      </div>

      <div v-if="!activeMain.length" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
        Chưa có nhiệm vụ chính nào.
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="task in activeMain"
          :key="task.id"
          class="flex items-start gap-3 rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800"
        >
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ task.title }}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ weekdaysLabel(task) }}</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <UBadge v-if="task.requiresProof" color="neutral" variant="subtle" size="sm" icon="i-lucide-camera">Cần ảnh</UBadge>
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
    </section>

    <!-- Mức phạt -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mức phạt</h2>
      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">Số tiền mất cho mỗi nhiệm vụ chính bỏ lỡ trong ngày.</p>
      <form class="flex items-center gap-2" @submit.prevent="savePenalty">
        <UInput v-model="penaltyInput" type="number" min="0" step="1000" class="w-40" />
        <span class="text-gray-500 dark:text-gray-400">₫</span>
        <UButton type="submit" color="neutral" variant="outline">Lưu</UButton>
      </form>
      <p class="mt-3 text-sm">Tổng nợ hiện tại: <b class="text-red-600 dark:text-red-400">{{ formatMoney(workspace?.penaltyTotal ?? 0) }}</b></p>
    </section>

    <!-- Kỷ luật & giám sát (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Kỷ luật & giám sát</h2>
      <form class="flex flex-col gap-4" @submit.prevent="saveDiscipline">
        <USwitch v-model="discipline.penaltyEscalation" label="Phạt tăng dần khi lỡ liên tiếp (ngày thứ 2 ×2, thứ 3 trở đi ×4)" />
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

    <!-- Giao diện -->
    <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Giao diện</h2>
      <div class="grid grid-cols-3 gap-2">
        <UButton
          v-for="option in themeOptions"
          :key="option.value"
          :color="colorMode.preference === option.value ? 'primary' : 'neutral'"
          :variant="colorMode.preference === option.value ? 'solid' : 'outline'"
          :icon="option.icon"
          block
          @click="colorMode.preference = option.value"
        >
          {{ option.label }}
        </UButton>
      </div>
    </section>

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
            <button type="button" class="ml-1 rounded-full hover:bg-sky-200" :aria-label="`Bỏ nghỉ ${date}`" @click="onRemoveRest(date)">
              <UIcon name="i-lucide-x" class="h-3.5 w-3.5" />
            </button>
          </UBadge>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-gray-400">Chưa có ngày nghỉ sắp tới.</p>
    </section>

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

    <MainTaskForm v-model:open="formOpen" :task="editing" @save="onSave" />
    <SubAccountForm v-model:open="subAccountOpen" @save="onCreateSubAccount" />
    <ProfileForm v-model:open="profileOpen" />
  </div>
</template>
