<script setup lang="ts">
import { isRestDay, isSidePendingOn, penaltySettingsOn, type MainTask, type ReminderTarget, type SideTask } from "#shared/utils/models";
import type { SideTaskInput } from "~/composables/useTasks";
import type { DayMap } from "~/composables/useHistory";
import { STREAK_LOOKBACK_DAYS } from "~/composables/useHistory";
import { addDays, formatDateVi, formatMoney } from "#shared/utils/dates";
import { groupByPeriod, periodOf, slotTimeOf, type PeriodGroup } from "~/utils/periods";
import { levelOf } from "~/utils/game";

const { user } = useAuth();
const { workspace, can, isOwner } = useWorkspace();
const { confirmAction } = useConfirm();
const { ready: tasksReady, mainTasksFor, sideTasksFor, createSideTask, updateSideTask, completeSideTask, deleteSideTask } = useTasks();
const { today, dayDoc, isCompleted, completionOf, complete, closePastDays, markChestOpened } = useDay();
const { showError } = useErrorToast();
const { check: checkReminders } = useReminders();
const { fetchDays, currentFullStreak } = useHistory();
const { tasks } = useTasks();

// Chuỗi ngày hoàn thành đủ nhiệm vụ chính: đọc lịch sử 120 ngày gần nhất một lần, tính lại khi tích
const streakDays = ref<DayMap>({});
const fullStreak = computed(() => {
  const ws = workspace.value;
  if (!ws) return 0;
  const days = { ...streakDays.value };
  if (dayDoc.value) days[today.value] = dayDoc.value;
  return currentFullStreak(tasks.value, days, ws.createdDate, today.value, ws.restDays ?? []);
});

watch(
  [tasksReady, () => workspace.value?.id, today],
  async ([isReady, wsId, date]) => {
    if (!isReady || !wsId) return;
    try {
      streakDays.value = await fetchDays(wsId, addDays(date, -STREAK_LOOKBACK_DAYS), addDays(date, -1));
    } catch (error) {
      console.warn("Không tải được lịch sử chuỗi", error);
    }
  },
  { immediate: true }
);

const isRest = computed(() => isRestDay(workspace.value?.restDays, today.value));
/** Giờ "đến lượt" để sắp xếp, cũng là giờ chia buổi: giờ nhắc, không có thì hạn, chưa đặt giờ thì cuối */
const slotKey = (t: MainTask | SideTask) => slotTimeOf(t) ?? "99:99";
const mainToday = computed(() =>
  (isRest.value ? [] : mainTasksFor(today.value)).slice().sort((a, b) => slotKey(a).localeCompare(slotKey(b)) || a.order - b.order)
);
/** Chỉ chủ sở hữu tích nhiệm vụ chính của mình */
const canTickMain = computed(() => isOwner.value && can("add") && !dayDoc.value?.closed);
const memberName = (uid: string) => {
  const m = workspace.value?.members[uid];
  return m?.displayName || m?.email || "thành viên";
};
const tickedBy = (taskId: string) => {
  const c = completionOf(taskId);
  return c && c.byUid !== user.value?.uid ? memberName(c.byUid) : null;
};
const sideToday = computed(() => sideTasksFor(today.value));

// ---- Chia theo buổi (Sáng / Trưa-chiều / Tối) theo giờ đã đặt ----
const sideSorted = computed(() =>
  sideToday.value.slice().sort((a, b) => slotKey(a).localeCompare(slotKey(b)) || a.createdAt - b.createdAt)
);
const mainGroups = computed(() => groupByPeriod(mainToday.value));
const sideGroups = computed(() => groupByPeriod(sideSorted.value));
/** Việc đã xong không hiện ở đây (xem lại trong Nhật ký), không bỏ tích được. Số đếm trên tiêu đề buổi vẫn tính đủ */
type CountedGroup<T> = PeriodGroup<T> & { done: number; total: number };
const pendingOnly = <T extends MainTask | SideTask>(groups: PeriodGroup<T>[], isDone: (t: T) => boolean): CountedGroup<T>[] =>
  groups
    .map((g) => ({ ...g, done: g.items.filter(isDone).length, total: g.items.length, items: g.items.filter((t) => !isDone(t)) }))
    .filter((g) => g.items.length > 0);
const mainPendingGroups = computed(() => pendingOnly(mainGroups.value, (t) => isCompleted(t.id)));
const sidePendingGroups = computed(() => pendingOnly(sideGroups.value, (t) => t.doneDate !== null));
const { nowHHmm } = useClock();
const currentPeriod = computed(() => periodOf(nowHHmm.value));
/** Không hiện tiêu đề khi mọi việc đều chưa đặt giờ (chỉ có một nhóm, chẳng có gì để chia) */
const showPeriodHeader = (groups: PeriodGroup<MainTask | SideTask>[]) => groups.length > 1 || groups[0]?.key !== "anytime";
const doneMain = computed(() => mainToday.value.filter((t) => isCompleted(t.id)));
const pendingMain = computed(() => mainToday.value.filter((t) => !isCompleted(t.id)));
const atRisk = computed(() =>
  workspace.value ? pendingMain.value.length * penaltySettingsOn(workspace.value, today.value).amount : 0
);
/** Việc cần nhắc trong app: chính chưa xong + phụ chưa xong có giờ nhắc */
const reminderTargets = computed<ReminderTarget[]>(() => [
  ...pendingMain.value,
  ...sideToday.value.filter((t) => isSidePendingOn(t, today.value) && t.reminderTime),
]);
// ---- Việc tiếp theo, rương thưởng, ví & cấp độ ----
const nextTask = computed(() => pendingMain.value[0] ?? null);
const allDone = computed(() => mainToday.value.length > 0 && pendingMain.value.length === 0);

/** Thưởng của hôm nay nếu xong hết; tiền vào ví thật khi chốt ngày */
const rewardToday = computed(() => (workspace.value ? penaltySettingsOn(workspace.value, today.value).reward : 0));
const earnedToday = computed(() => (allDone.value ? rewardToday.value : 0));
const walletReward = computed(() => (workspace.value?.rewardTotal ?? 0) + earnedToday.value);
const chests = computed(() => (workspace.value?.rewardDays ?? 0) + (earnedToday.value > 0 ? 1 : 0));
const level = computed(() => levelOf(chests.value));

// Đã mở rương hôm nay chưa: lưu trên days/{hôm nay} nên mọi thiết bị cùng thấy
const chestOpened = computed(() => !!dayDoc.value?.chestOpenedAt);
const onChestOpened = async () => {
  try {
    await markChestOpened();
  } catch (error) {
    showError("Không lưu được trạng thái rương", error);
  }
};
const chestState = computed(() => (!allDone.value ? "locked" : chestOpened.value ? "open" : "ready"));
const chestModal = ref(false);
// Vừa xong việc cuối cùng: bật rương cho chủ sở hữu (thành viên khác chỉ xem)
watch(allDone, (value) => {
  if (value && isOwner.value && !chestOpened.value) chestModal.value = true;
});

// Badge số việc chưa xong trên icon app (iPhone: web app đã thêm ra màn hình chính)
watch(
  () => pendingMain.value.length + sideToday.value.filter((t) => isSidePendingOn(t, today.value)).length,
  (count) => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (count > 0) nav.setAppBadge?.(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  },
  { immediate: true }
);

// ---- Hai tab Chính / Phụ, nhãn kèm số việc chưa làm ----
const tab = ref<"main" | "side">("main");
const pendingSideCount = computed(() => sideToday.value.filter((t) => isSidePendingOn(t, today.value)).length);
const tabItems = computed(() => [
  {
    label: "Chính",
    value: "main",
    slot: "main" as const,
    icon: "i-lucide-list-checks",
    badge: pendingMain.value.length || undefined,
  },
  {
    label: "Phụ",
    value: "side",
    slot: "side" as const,
    icon: "i-lucide-list-plus",
    badge: pendingSideCount.value || undefined,
  },
]);

// Chốt các ngày đã qua khi dữ liệu sẵn sàng (và mỗi khi sang ngày mới)
watch(
  [tasksReady, () => workspace.value?.id, today],
  async ([isReady, wsId]) => {
    if (!isReady || !wsId) return;
    try {
      await closePastDays();
    } catch (error) {
      showError("Không chốt được ngày trước", error);
    }
  },
  { immediate: true }
);

// Nhắc trong app khi tới giờ
let reminderClock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  reminderClock = setInterval(() => checkReminders(reminderTargets.value), 20_000);
});
onBeforeUnmount(() => clearInterval(reminderClock));

// ---- Hoàn thành ----
const onCompleteRequest = async (task: MainTask) => {
  try {
    await complete(task);
  } catch (error) {
    showError("Không tích được", error);
  }
};

// ---- Nhiệm vụ phụ ----
const sideFormOpen = ref(false);
const sideEditing = ref<SideTask | null>(null);
const sideInitialTitle = ref("");

const onAddSide = async (title: string) => {
  try {
    await createSideTask({ title });
  } catch (error) {
    showError("Không thêm được", error);
  }
};
const openSideOptions = (title: string) => {
  sideEditing.value = null;
  sideInitialTitle.value = title;
  sideFormOpen.value = true;
};
const openSideEdit = (task: SideTask) => {
  sideEditing.value = task;
  sideFormOpen.value = true;
};
const onSaveSide = async (input: Required<SideTaskInput>) => {
  try {
    if (sideEditing.value) await updateSideTask(sideEditing.value, input);
    else await createSideTask(input);
  } catch (error) {
    showError("Không lưu được", error);
  }
};
const onCompleteSide = async (task: SideTask) => {
  try {
    await completeSideTask(task);
  } catch (error) {
    showError("Không cập nhật được", error);
  }
};
const onDeleteSide = async (task: SideTask) => {
  const ok = await confirmAction({ title: `Xóa "${task.title}"?`, confirmLabel: "Xóa", color: "error", icon: "i-lucide-trash-2" });
  if (!ok) return;
  try {
    await deleteSideTask(task);
  } catch (error) {
    showError("Không xóa được", error);
  }
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Đầu trang: ngày, cấp độ, nhiệm vụ hôm nay + rương, ví -->
    <section class="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ formatDateVi(today) }}</p>
          <WeatherBadge class="mt-0.5" />
        </div>
        <!-- Cấp độ theo số rương đã mở -->
        <div class="w-32 shrink-0 text-right">
          <p class="truncate text-xs font-bold text-violet-700 dark:text-violet-300">Cấp {{ level.level }} · {{ level.title }}</p>
          <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950">
            <div class="h-full rounded-full bg-violet-500 transition-[width] duration-700" :style="{ width: `${Math.round(level.progress * 100)}%` }" />
          </div>
          <p class="mt-0.5 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
            {{ level.nextAt ? `${level.chests}/${level.nextAt} rương` : `${level.chests} rương` }}
          </p>
        </div>
      </div>

      <!-- Nhiệm vụ hôm nay: mỗi việc một ô, rương ở cuối -->
      <div v-if="mainToday.length" class="mt-3 flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2">
            <p class="text-2xl font-bold">
              {{ doneMain.length }}/{{ mainToday.length }}
              <span class="text-base font-normal text-gray-500 dark:text-gray-400">nhiệm vụ chính</span>
            </p>
            <!-- Chuỗi ngày liên tiếp hoàn thành đủ (hôm nay chưa xong thì vẫn giữ chuỗi tới hôm qua) -->
            <UBadge
              :color="fullStreak ? 'warning' : 'neutral'"
              variant="subtle"
              icon="i-lucide-flame"
              :title="`Chuỗi ${fullStreak} ngày liên tiếp hoàn thành đủ nhiệm vụ chính`"
            >
              {{ fullStreak }} ngày
            </UBadge>
          </div>
          <div
            class="mt-2 flex gap-1"
            role="progressbar"
            aria-label="Tiến độ nhiệm vụ chính"
            aria-valuemin="0"
            :aria-valuemax="mainToday.length"
            :aria-valuenow="doneMain.length"
          >
            <!-- Đầy dần từ trái sang, mỗi việc xong thêm một ô -->
            <span
              v-for="i in mainToday.length"
              :key="i"
              :class="['h-2.5 flex-1 rounded-full transition-colors duration-500', i <= doneMain.length ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700']"
            />
          </div>
          <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            <template v-if="!allDone">Xong hết để mở rương<template v-if="rewardToday"> +{{ formatMoney(rewardToday) }}</template></template>
            <template v-else-if="chestOpened">Đã mở rương<template v-if="rewardToday"> +{{ formatMoney(rewardToday) }}</template></template>
            <b v-else class="text-amber-600 dark:text-amber-400">Rương đã sẵn sàng, chạm để mở!</b>
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-xl p-1 transition enabled:hover:bg-amber-50 enabled:dark:hover:bg-amber-950/40"
          :disabled="!allDone"
          :aria-label="allDone ? 'Xem rương thưởng hôm nay' : 'Rương: xong hết nhiệm vụ chính để mở'"
          @click="chestModal = true"
        >
          <TreasureChest :state="chestState" :size="60" />
        </button>
      </div>

      <!-- Ví -->
      <div class="mt-3 grid grid-cols-2 gap-2">
        <div class="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
          <UIcon name="i-lucide-coins" class="h-5 w-5 shrink-0 text-amber-500" />
          <div class="min-w-0">
            <p class="text-[11px] text-gray-500 dark:text-gray-400">Tiền thưởng</p>
            <p class="truncate font-bold tabular-nums text-amber-700 dark:text-amber-300">{{ formatMoney(walletReward) }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 px-3 py-2">
          <UIcon name="i-lucide-wallet" class="h-5 w-5 shrink-0 text-red-500" />
          <div class="min-w-0">
            <p class="text-[11px] text-gray-500 dark:text-gray-400">Tổng nợ</p>
            <p class="truncate font-bold tabular-nums text-red-600 dark:text-red-400">{{ formatMoney(workspace?.penaltyTotal ?? 0) }}</p>
          </div>
        </div>
      </div>

      <p v-if="isRest" class="mt-3 text-sm text-sky-700 dark:text-sky-300">
        <UIcon name="i-lucide-palmtree" class="mr-1 inline-block h-4 w-4 align-text-bottom" />
        Hôm nay là ngày nghỉ: không tính nhiệm vụ chính, không phạt, không đứt chuỗi.
      </p>
      <p v-else-if="pendingMain.length" class="mt-3 text-sm text-amber-700 dark:text-amber-300">
        <UIcon name="i-lucide-triangle-alert" class="mr-1 inline-block h-4 w-4 align-text-bottom" />
        Còn {{ pendingMain.length }} việc, nếu bỏ lỡ sẽ mất {{ formatMoney(atRisk) }}
      </p>
    </section>

    <!-- Việc tiếp theo -->
    <section v-if="nextTask" class="flex items-center gap-3 rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
      <UIcon name="i-lucide-circle" class="h-6 w-6 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">Việc tiếp theo</p>
        <p class="truncate font-bold">{{ nextTask.title }}</p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          <template v-if="nextTask.deadlineTime">Hạn {{ nextTask.deadlineTime }}</template>
          <template v-else-if="nextTask.reminderTime">Nhắc lúc {{ nextTask.reminderTime }}</template>
          <template v-else>Trước nửa đêm</template>
        </p>
      </div>
      <UButton v-if="canTickMain" size="lg" icon="i-lucide-check" @click="onCompleteRequest(nextTask)">Xong</UButton>
    </section>

    <!-- Xong hết: chưa mở rương thì mời mở, mở rồi thì chúc mừng -->
    <section
      v-else-if="allDone && !chestOpened"
      class="flex items-center gap-3 rounded-2xl bg-linear-to-r from-amber-400 to-orange-500 p-4 text-white shadow-sm"
    >
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold">Xong hết việc chính hôm nay!</p>
        <p class="text-sm text-amber-50">Rương thưởng<template v-if="rewardToday"> +{{ formatMoney(rewardToday) }}</template> đang chờ bạn.</p>
      </div>
      <UButton size="lg" color="neutral" variant="solid" icon="i-lucide-gift" class="bg-white font-bold text-orange-600 hover:bg-amber-50" @click="chestModal = true">
        Mở rương
      </UButton>
    </section>
    <section v-else-if="allDone" class="rounded-2xl bg-green-600 p-4 text-white shadow-sm">
      <p class="flex items-center gap-2 text-lg font-bold">
        <UIcon name="i-lucide-party-popper" class="h-6 w-6" />
        Xong hết việc chính hôm nay
      </p>
      <p class="mt-1 text-sm text-green-50">
        <template v-if="rewardToday">Đã nhận rương +{{ formatMoney(rewardToday) }}. </template>Chuỗi {{ fullStreak }} ngày liên tiếp hoàn thành đủ. Giữ nhịp nhé!
      </p>
    </section>
    <ChestRewardModal
      v-model:open="chestModal"
      :amount="rewardToday"
      :chests="chests"
      :opened="chestOpened"
      :streak="fullStreak"
      @opened="onChestOpened"
    />

    <UTabs
      v-model="tab"
      :items="tabItems"
      color="primary"
      variant="pill"
      :ui="{ root: 'gap-3', content: 'min-w-0' }"
    >
    <template #main>
    <!-- Nhiệm vụ chính -->
    <section>
      <p class="mb-2 text-xs text-gray-400">Vuốt ngang một việc để hoàn thành. Quá hạn giờ là không tích được nữa. Việc đã xong xem trong Nhật ký.</p>
      <div v-if="!tasksReady" class="py-6 text-center text-gray-400">Đang tải...</div>
      <div v-else-if="isRest" class="rounded-xl border border-dashed border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 p-6 text-center text-sky-800 dark:text-sky-200">
        Đang nghỉ. Nhiệm vụ chính sẽ quay lại vào ngày không nghỉ tiếp theo.
      </div>
      <div v-else-if="!mainToday.length" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
        Hôm nay không có nhiệm vụ chính.
        <NuxtLink v-if="can('edit')" to="/settings" class="block pt-1 text-primary hover:underline">Thêm trong Cài đặt</NuxtLink>
      </div>
      <div v-else-if="allDone" class="rounded-xl border border-dashed border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-6 text-center text-green-800 dark:text-green-200">
        Đã xong hết nhiệm vụ chính hôm nay.
        <NuxtLink to="/journal" class="block pt-1 text-primary hover:underline">Xem lại trong Nhật ký</NuxtLink>
      </div>
      <div v-else class="flex flex-col gap-2">
        <template v-for="group in mainPendingGroups" :key="group.key">
          <PeriodHeader
            v-if="showPeriodHeader(mainGroups)"
            :label="group.label"
            :icon="group.icon"
            :done="group.done"
            :total="group.total"
            :current="group.key === currentPeriod"
          />
          <MainTaskRow
            v-for="task in group.items"
            :key="task.id"
            :task="task"
            :completion="completionOf(task.id)"
            :can-act="canTickMain"
            :ticked-by="tickedBy(task.id)"
            @complete="onCompleteRequest(task)"
          />
        </template>
      </div>
    </section>
    </template>

    <template #side>
    <!-- Nhiệm vụ phụ -->
    <section>
      <p class="mb-2 text-xs text-gray-400">Vuốt từ trái sang để sửa, từ phải sang để xóa.</p>
      <div class="flex flex-col gap-2">
        <template v-for="group in sidePendingGroups" :key="group.key">
          <PeriodHeader
            v-if="showPeriodHeader(sideGroups)"
            :label="group.label"
            :icon="group.icon"
            :done="group.done"
            :total="group.total"
            :current="group.key === currentPeriod"
          />
          <SideTaskRow
            v-for="task in group.items"
            :key="task.id"
            :task="task"
            :today="today"
            :can-act="can('add')"
            :can-edit="can('edit') || task.createdBy === user?.uid"
            @complete="onCompleteSide(task)"
            @edit="openSideEdit(task)"
            @delete="onDeleteSide(task)"
          />
        </template>
        <p v-if="tasksReady && !sideToday.length" class="py-2 text-sm text-gray-400">
          Chưa có nhiệm vụ phụ. Việc chưa xong sẽ tự dồn sang ngày hôm sau.
        </p>
        <p v-else-if="tasksReady && !pendingSideCount" class="py-2 text-sm text-gray-400">
          Đã xong hết việc phụ hôm nay. Xem lại trong
          <NuxtLink to="/journal" class="text-primary hover:underline">Nhật ký</NuxtLink>.
        </p>
        <SideTaskInput v-if="can('add')" class="mt-1" @add="onAddSide" @options="openSideOptions" />
      </div>
    </section>
    </template>
    </UTabs>

    <SideTaskForm v-model:open="sideFormOpen" :task="sideEditing" :initial-title="sideInitialTitle" @save="onSaveSide" />
  </div>
</template>
