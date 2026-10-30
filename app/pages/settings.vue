<script setup lang="ts">
import type { MainTask } from "#shared/utils/models";
import { groupByPeriod, slotTimeOf } from "~/utils/periods";
import type { MainTaskInput } from "~/composables/useTasks";
import type { SubAccountInput } from "~/composables/useMembers";
import { DEFAULT_EVENING_REMINDER, isActiveFrom, penaltySettingsOn } from "#shared/utils/models";
import { addDays, formatMoney, formatShortVi, formatWeekdays, todayKey } from "#shared/utils/dates";
import { initialOf } from "~/utils/avatar";

const { user, resetPassword } = useAuth();
const { workspace, can, isOwner, updatePenaltySettings, updateEveningReminder, addRestDay, removeRestDay } = useWorkspace();
const { mainTasks, createMainTask, updateMainTask, archiveMainTask } = useTasks();
const { members, createSubAccount, updateMember, removeMember } = useMembers();
const push = usePush();
const { confirmAction } = useConfirm();
const { restartFromToday } = useRestart();
const { showError } = useErrorToast();
const toast = useToast();

const today = computed(() => todayKey());

// ---- Tab ----
const tab = ref("tasks");
const tabItems = computed(() => [
  { label: "Nhiệm vụ", value: "tasks", slot: "tasks" as const, icon: "i-lucide-list-checks" },
  ...(isOwner.value ? [{ label: "Kỷ luật", value: "discipline", slot: "discipline" as const, icon: "i-lucide-gavel" }] : []),
  ...(isOwner.value ? [{ label: "Thành viên", value: "members", slot: "members" as const, icon: "i-lucide-users" }] : []),
  { label: "Thông báo", value: "notifications", slot: "notifications" as const, icon: "i-lucide-bell" },
  { label: "Tài khoản", value: "account", slot: "account" as const, icon: "i-lucide-user" },
]);

// ---- Nhiệm vụ chính: chia tab theo buổi như màn Hôm nay ----
const activeMain = computed(() =>
  mainTasks.value
    .filter((t) => isActiveFrom(t, today.value))
    .sort((a, b) => (slotTimeOf(a) ?? "99:99").localeCompare(slotTimeOf(b) ?? "99:99") || a.order - b.order)
);
const periodGroups = computed(() => groupByPeriod(activeMain.value));
const periodTab = ref<string>("");
// Buổi đang chọn biến mất (hết việc trong buổi) thì nhảy về buổi đầu
watch(
  periodGroups,
  (groups) => {
    if (!groups.some((g) => g.key === periodTab.value)) periodTab.value = groups[0]?.key ?? "";
  },
  { immediate: true }
);
const periodTasks = computed(() => periodGroups.value.find((g) => g.key === periodTab.value)?.items ?? []);
const weekdaysLabel = (task: MainTask) => formatWeekdays(task.weekdays);

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
      toast.add({ title: "Đã lưu", description: replaced ? "Lịch mới áp dụng từ ngày mai" : undefined, color: "success" });
    } else {
      await createMainTask(input);
      toast.add({ title: "Đã thêm", color: "success" });
    }
  } catch (error) {
    showError("Không lưu được", error);
  }
};
const onArchive = async (task: MainTask) => {
  const ok = await confirmAction({
    title: `Ngừng "${task.title}"?`,
    description: task.effectiveFrom > today.value ? "Nhiệm vụ chưa bắt đầu nên sẽ bị xóa." : "Hôm nay vẫn tính, ngừng từ ngày mai.",
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

// ---- Phạt & thưởng (đổi có hiệu lực từ ngày mai) ----
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
    toast.add({ title: "Đã lưu", description: `Áp dụng từ ${formatShortVi(addDays(today.value, 1))}`, color: "success" });
  } catch (error) {
    showError("Không lưu được", error);
  }
};

// ---- Ngày nghỉ ----
const restInput = ref("");
const upcomingRestDays = computed(() => [...(workspace.value?.restDays ?? [])].filter((d) => d >= today.value).sort());
const onAddRest = async (date: string) => {
  if (!date) return;
  try {
    await addRestDay(date);
    restInput.value = "";
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

// ---- Bắt đầu lại từ hôm nay ----
const restarting = ref(false);
const onRestart = async () => {
  const ok = await confirmAction({
    title: "Bắt đầu lại từ hôm nay?",
    description: "Xóa lịch sử trước hôm nay; nợ, thưởng, rương và chuỗi về 0. Nhiệm vụ giữ nguyên. Không hoàn tác được.",
    confirmLabel: "Bắt đầu lại",
    color: "error",
    icon: "i-lucide-rotate-ccw",
  });
  if (!ok) return;
  restarting.value = true;
  try {
    const result = await restartFromToday();
    toast.add({ title: "Đã bắt đầu lại", description: `Xóa ${result.daysDeleted} ngày, ${result.tasksDeleted} việc cũ`, color: "success" });
  } catch (error) {
    showError("Không bắt đầu lại được", error);
  } finally {
    restarting.value = false;
  }
};

// ---- Thành viên ----
const subAccountOpen = ref(false);
const memberBusy = ref<string | null>(null);
const onCreateSubAccount = async (input: SubAccountInput) => {
  try {
    await createSubAccount(input);
    toast.add({ title: "Đã tạo tài khoản", description: input.email, color: "success" });
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
  const ok = await confirmAction({ title: `Gỡ ${name}?`, confirmLabel: "Gỡ", color: "error", icon: "i-lucide-user-minus" });
  if (!ok) return;
  try {
    await removeMember(uid);
  } catch (error) {
    showError("Không gỡ được", error);
  }
};

// ---- Thông báo ----
const onTogglePush = async (enabled: boolean) => {
  try {
    if (enabled) await push.subscribe();
    else await push.unsubscribe();
  } catch (error) {
    showError("Không bật được nhắc đẩy", error);
  }
};
const eveningInput = ref("");
watch(() => workspace.value?.eveningReminderTime, (v) => { eveningInput.value = v ?? DEFAULT_EVENING_REMINDER; }, { immediate: true });
const saveEvening = async () => {
  try {
    await updateEveningReminder(eveningInput.value || null);
    toast.add({ title: "Đã lưu", color: "success" });
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
    <!-- 5 tab chia đều, icon trên nhãn dưới cho vừa màn điện thoại -->
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
        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nhiệm vụ chính</h2>
            <UButton v-if="can('edit')" size="sm" icon="i-lucide-plus" @click="openCreate">Thêm</UButton>
          </div>

          <div v-if="!activeMain.length" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
            Chưa có nhiệm vụ
          </div>
          <template v-else>
            <!-- Tab theo buổi, chỉ hiện buổi có việc -->
            <div
              v-if="periodGroups.length > 1"
              class="grid gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1 text-sm font-medium"
              :style="{ gridTemplateColumns: `repeat(${periodGroups.length}, minmax(0, 1fr))` }"
            >
              <button
                v-for="group in periodGroups"
                :key="group.key"
                type="button"
                :class="['flex items-center justify-center gap-1 rounded-md py-1.5 transition', periodTab === group.key ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-500 dark:text-gray-400']"
                :aria-pressed="periodTab === group.key"
                @click="periodTab = group.key"
              >
                <UIcon :name="group.icon" class="h-4 w-4" />
                {{ group.label }}
                <span class="text-xs text-gray-400">{{ group.items.length }}</span>
              </button>
            </div>
            <ul class="flex flex-col gap-2">
              <li
                v-for="task in periodTasks"
                :key="task.id"
                class="flex items-start gap-3 rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ task.title }}</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{{ weekdaysLabel(task) }}</p>
                  <div class="mt-1 flex flex-wrap gap-1.5">
                    <UBadge v-if="task.reminderTime" color="warning" variant="subtle" size="sm" icon="i-lucide-bell">{{ task.reminderTime }}</UBadge>
                    <UBadge v-if="task.deadlineTime" color="error" variant="subtle" size="sm" icon="i-lucide-alarm-clock">{{ task.deadlineTime }}</UBadge>
                    <UBadge v-if="task.effectiveFrom > today" color="info" variant="subtle" size="sm">Từ {{ formatShortVi(task.effectiveFrom) }}</UBadge>
                    <UBadge v-if="task.endsOn" color="error" variant="subtle" size="sm">Ngừng {{ formatShortVi(task.endsOn) }}</UBadge>
                  </div>
                </div>
                <UDropdownMenu v-if="can('edit') && !task.endsOn" :items="taskMenu(task)" :content="{ align: 'end' }">
                  <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical" aria-label="Tùy chọn" />
                </UDropdownMenu>
              </li>
            </ul>
          </template>
        </section>
      </template>

      <template #discipline>
        <div class="flex flex-col gap-6">
          <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Phạt & thưởng</h2>
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
              Phạt {{ formatMoney(penaltyTomorrow.amount) }} từ {{ formatShortVi(addDays(today, 1)) }}
            </p>
            <p v-if="penaltyToday && penaltyTomorrow && penaltyToday.reward !== penaltyTomorrow.reward" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Thưởng {{ formatMoney(penaltyTomorrow.reward) }} từ {{ formatShortVi(addDays(today, 1)) }}
            </p>
          </section>

          <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Ngày nghỉ</h2>
            <div class="flex flex-wrap gap-2">
              <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-palmtree" :disabled="upcomingRestDays.includes(today)" @click="onAddRest(today)">
                Hôm nay
              </UButton>
              <UButton color="neutral" variant="outline" size="sm" :disabled="upcomingRestDays.includes(addDays(today, 1))" @click="onAddRest(addDays(today, 1))">
                Ngày mai
              </UButton>
            </div>
            <form class="mt-3 flex items-center gap-2" @submit.prevent="onAddRest(restInput)">
              <UInput v-model="restInput" type="date" :min="today" class="w-44" />
              <UButton type="submit" color="neutral" variant="outline" size="sm" :disabled="!restInput">Thêm</UButton>
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
          </section>

          <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Bắt đầu lại</h2>
            <UButton color="error" variant="outline" icon="i-lucide-rotate-ccw" :loading="restarting" @click="onRestart">Bắt đầu lại từ hôm nay</UButton>
          </section>
        </div>
      </template>

      <template #members>
        <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Thành viên</h2>
            <UButton size="sm" icon="i-lucide-user-plus" @click="subAccountOpen = true">Thêm</UButton>
          </div>
          <ul class="divide-y divide-gray-100 dark:divide-gray-800">
            <li v-for="member in members" :key="member.uid" class="flex flex-col gap-2 py-3">
              <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium">{{ member.displayName || member.email || member.uid }}</p>
                  <p v-if="member.displayName && member.email" class="truncate text-xs text-gray-500 dark:text-gray-400">{{ member.email }}</p>
                </div>
                <UBadge v-if="member.isOwner" color="primary" variant="subtle" size="sm">Chủ</UBadge>
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
                <USwitch :model-value="member.add" :disabled="memberBusy === member.uid" label="Thêm" @update:model-value="(v) => onTogglePermission(member.uid, 'add', v)" />
                <USwitch :model-value="member.edit" :disabled="memberBusy === member.uid" label="Sửa" @update:model-value="(v) => onTogglePermission(member.uid, 'edit', v)" />
              </div>
            </li>
          </ul>
        </section>
      </template>

      <template #notifications>
        <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nhắc đẩy</h2>
          <UAlert
            v-if="push.needsHomeScreen.value"
            color="info"
            variant="subtle"
            icon="i-lucide-smartphone"
            title="Thêm app ra màn hình chính để nhận nhắc"
            description="Safari › Chia sẻ › Thêm vào MH chính"
            class="mb-3"
          />
          <p v-else-if="!push.supported.value" class="mb-3 text-sm text-gray-500 dark:text-gray-400">Trình duyệt không hỗ trợ</p>
          <p v-else-if="push.permission.value === 'denied'" class="mb-3 text-sm text-red-600 dark:text-red-400">Thông báo đang bị chặn</p>
          <USwitch
            :model-value="push.subscribed.value"
            :disabled="push.busy.value || !push.supported.value || push.permission.value === 'denied'"
            label="Trên thiết bị này"
            @update:model-value="onTogglePush"
          />
          <form v-if="isOwner" class="mt-4 flex flex-wrap items-center gap-2" @submit.prevent="saveEvening">
            <label class="text-sm text-gray-700 dark:text-gray-300" for="evening-time">Nhắc cuối ngày</label>
            <UInput id="evening-time" v-model="eveningInput" type="time" class="w-32" />
            <UButton type="submit" color="neutral" variant="outline" size="sm">Lưu</UButton>
          </form>
        </section>
      </template>

      <template #account>
        <section class="rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
          <div class="flex items-center gap-3">
            <UAvatar :src="user?.photoURL ?? undefined" :alt="user?.displayName ?? 'Tài khoản'" :text="initialOf(user?.displayName, user?.email)" size="xl" referrerpolicy="no-referrer" />
            <div class="min-w-0">
              <p class="truncate font-medium">{{ user?.displayName ?? "Chưa đặt tên" }}</p>
              <p class="truncate text-sm text-gray-500 dark:text-gray-400">{{ user?.email }}</p>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton icon="i-lucide-user-round-pen" @click="profileOpen = true">Hồ sơ</UButton>
            <UButton color="neutral" variant="outline" icon="i-lucide-key-round" @click="onChangePassword">Đổi mật khẩu</UButton>
          </div>
        </section>
      </template>
    </UTabs>

    <MainTaskForm v-model:open="formOpen" :task="editing" @save="onSave" />
    <SubAccountForm v-model:open="subAccountOpen" @save="onCreateSubAccount" />
    <ProfileForm v-model:open="profileOpen" />
  </div>
</template>
