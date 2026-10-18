<script setup lang="ts">
import { isRestDay, isSidePendingOn, type MainTask, type Proof, type ReminderTarget, type SideTask } from "#shared/utils/models";
import type { DayDoc } from "#shared/utils/models";
import type { SideTaskInput } from "~/composables/useTasks";
import type { DayMap } from "~/composables/useHistory";
import { STREAK_LOOKBACK_DAYS } from "~/composables/useHistory";
import { addDays, formatDateVi, formatMoney } from "#shared/utils/dates";

const { user } = useAuth();
const { workspace, can, isOwner } = useWorkspace();
const { confirmAction } = useConfirm();
const { ready: tasksReady, mainTasksFor, sideTasksFor, createSideTask, updateSideTask, setSideTaskDone, deleteSideTask } = useTasks();
const { today, dayDoc, isCompleted, completionOf, complete, uncomplete, closePastDays } = useDay();
const { showError } = useErrorToast();
const { check: checkReminders } = useReminders();
const { fetchDays, currentStreaks } = useHistory();
const { tasks } = useTasks();
const { items: queuedItems, online, enqueue, isQueued, flush: flushQueue } = useProofQueue();
const toast = useToast();

// Tải ảnh đang chờ khi có mạng lại / khi dữ liệu sẵn sàng
watch(
  [online, tasksReady, () => workspace.value?.id, () => queuedItems.value.length],
  async ([isOnline, isReady, wsId, count]) => {
    if (!isOnline || !isReady || !wsId || !count) return;
    try {
      const done = await flushQueue(tasks.value);
      if (done) toast.add({ title: `Đã tải ${done} nhiệm vụ chờ ảnh`, color: "success", icon: "i-lucide-cloud-upload" });
    } catch (error) {
      console.warn("flush queue", error);
    }
  },
  { immediate: true }
);

const onQueueProofs = async (files: File[]) => {
  const task = proofTask.value;
  if (!task) return;
  try {
    await enqueue(task, today.value, files);
    toast.add({ title: "Đã lưu ảnh, sẽ tải khi có mạng", description: task.title, color: "warning", icon: "i-lucide-wifi-off" });
  } catch (error) {
    showError("Không lưu được ảnh", error);
  }
};

// Streak từng nhiệm vụ: đọc lịch sử 120 ngày gần nhất một lần, tính lại khi tích/bỏ tích
const streakDays = ref<DayMap>({});
const streaks = computed(() => {
  const ws = workspace.value;
  if (!ws) return {} as Record<string, number>;
  const days = { ...streakDays.value };
  if (dayDoc.value) days[today.value] = dayDoc.value;
  return currentStreaks(tasks.value, days, ws.createdDate, today.value, ws.restDays ?? []);
});

/** Số ngày liên tiếp không mất tiền, đếm lùi từ hôm qua (hôm nay cộng thêm nếu đã xong hết) */
const noPenaltyStreak = computed(() => {
  let count = 0;
  for (let d = addDays(today.value, -1); d >= (workspace.value?.createdDate ?? d); d = addDays(d, -1)) {
    const day = streakDays.value[d];
    if (!day?.closed) break;
    if (day.penalty > 0) break;
    count++;
  }
  return allDone.value ? count + 1 : count;
});

/** etag của mọi ảnh đã nộp (120 ngày gần nhất + hôm nay + việc phụ) → ngày dùng, để chặn nộp lại */
const knownEtags = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  const collect = (day: DayDoc | null | undefined) => {
    if (!day) return;
    for (const c of Object.values(day.completions)) for (const p of c.proofs) if (p.etag) map[p.etag] = day.date;
  };
  Object.values(streakDays.value).forEach(collect);
  collect(dayDoc.value);
  for (const t of tasks.value) if (t.type === "side" && t.doneDate) for (const p of t.proofs ?? []) if (p.etag) map[p.etag] = t.doneDate;
  return map;
});
watch(
  [tasksReady, () => workspace.value?.id, today],
  async ([isReady, wsId, date]) => {
    if (!isReady || !wsId) return;
    try {
      streakDays.value = await fetchDays(wsId, addDays(date, -STREAK_LOOKBACK_DAYS), addDays(date, -1));
    } catch (error) {
      console.warn("Không tải được lịch sử streak", error);
    }
  },
  { immediate: true }
);

const isRest = computed(() => isRestDay(workspace.value?.restDays, today.value));
/** Giờ "đến lượt" của một việc để sắp xếp: hạn trước, giờ nhắc sau, không có thì cuối */
const dueKey = (t: MainTask) => t.deadlineTime ?? t.reminderTime ?? "99:99";
const mainToday = computed(() =>
  (isRest.value ? [] : mainTasksFor(today.value))
    .slice()
    .sort((a, b) => Number(isCompleted(a.id)) - Number(isCompleted(b.id)) || dueKey(a).localeCompare(dueKey(b)) || a.order - b.order)
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
const doneMain = computed(() => mainToday.value.filter((t) => isCompleted(t.id)));
const pendingMain = computed(() => mainToday.value.filter((t) => !isCompleted(t.id)));
const atRisk = computed(() => pendingMain.value.length * (workspace.value?.penaltyAmount ?? 0));
/** Việc cần nhắc trong app: chính chưa xong + phụ chưa xong có giờ nhắc */
const reminderTargets = computed<ReminderTarget[]>(() => [
  ...pendingMain.value,
  ...sideToday.value.filter((t) => isSidePendingOn(t, today.value) && t.reminderTime),
]);
const progress = computed(() =>
  mainToday.value.length ? Math.round((doneMain.value.length / mainToday.value.length) * 100) : 0
);

// ---- Việc tiếp theo & ăn mừng ----
const nextTask = computed(() => pendingMain.value[0] ?? null);
const allDone = computed(() => mainToday.value.length > 0 && pendingMain.value.length === 0);
const confetti = ref(false);
watch(allDone, (value) => {
  if (!value || !import.meta.client) return;
  const key = `celebrated:${today.value}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
  confetti.value = true;
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

// ---- Hoàn thành (chính và phụ cần ảnh dùng chung modal) ----
const proofTask = ref<MainTask | SideTask | null>(null);
const proofOpen = ref(false);
const proofInitialFiles = ref<File[]>([]);

/** Mở modal ảnh; có `files` (chụp thẳng từ camera) thì tải ngay */
const openProof = (task: MainTask | SideTask, files: File[] = []) => {
  proofTask.value = task;
  proofInitialFiles.value = files;
  proofOpen.value = true;
};

const onCompleteRequest = async (task: MainTask) => {
  if (task.requiresProof) {
    openProof(task);
    return;
  }
  try {
    await complete(task, []);
  } catch (error) {
    showError("Không tích được", error);
  }
};

const onProofConfirm = async (proofs: Proof[]) => {
  const task = proofTask.value;
  if (!task) return;
  try {
    if (task.type === "main") await complete(task, proofs);
    else await setSideTaskDone(task, true, proofs);
    toast.add({ title: "Đã hoàn thành", description: task.title, color: "success", icon: "i-lucide-circle-check" });
  } catch (error) {
    showError("Không tích được", error);
  }
};

const onUncomplete = async (task: MainTask) => {
  try {
    await uncomplete(task);
  } catch (error) {
    showError("Không bỏ tích được", error);
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
const onToggleSide = async (task: SideTask, done: boolean) => {
  if (done && task.requiresProof) {
    openProof(task);
    return;
  }
  try {
    await setSideTaskDone(task, done);
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

const proofFolder = computed(() => `${workspace.value?.id ?? "ws"}/${today.value}`);
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Đầu trang: ngày, tiến độ, tiền -->
    <section class="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ formatDateVi(today) }}</p>
      <WeatherBadge class="mt-0.5" />
      <div class="mt-1 flex items-end justify-between gap-3">
        <p class="text-2xl font-bold">
          {{ doneMain.length }}/{{ mainToday.length }}
          <span class="text-base font-normal text-gray-500 dark:text-gray-400">nhiệm vụ chính</span>
        </p>
        <div class="text-right">
          <p class="text-xs text-gray-500 dark:text-gray-400">Tổng nợ</p>
          <p class="font-bold text-red-600 dark:text-red-400">{{ formatMoney(workspace?.penaltyTotal ?? 0) }}</p>
        </div>
      </div>
      <UProgress :model-value="progress" color="success" size="sm" class="mt-3" />
      <p v-if="isRest" class="mt-2 text-sm text-sky-700 dark:text-sky-300">
        <UIcon name="i-lucide-palmtree" class="mr-1 inline h-4 w-4 align-text-bottom" />
        Hôm nay là ngày nghỉ: không tính nhiệm vụ chính, không phạt, không đứt chuỗi.
      </p>
      <p v-else-if="pendingMain.length" class="mt-2 text-sm text-amber-700 dark:text-amber-300">
        <UIcon name="i-lucide-triangle-alert" class="mr-1 inline h-4 w-4 align-text-bottom" />
        Còn {{ pendingMain.length }} việc, nếu bỏ lỡ sẽ mất {{ formatMoney(atRisk) }}
      </p>
      <p v-else-if="mainToday.length" class="mt-2 text-sm text-green-700 dark:text-green-300">
        <UIcon name="i-lucide-party-popper" class="mr-1 inline h-4 w-4 align-text-bottom" />
        Xong hết nhiệm vụ chính hôm nay!
      </p>
    </section>

    <!-- Việc tiếp theo -->
    <section v-if="nextTask" class="flex items-center gap-3 rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
      <UIcon :name="nextTask.requiresProof ? 'i-lucide-camera' : 'i-lucide-circle'" class="h-6 w-6 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">Việc tiếp theo</p>
        <p class="truncate font-bold">{{ nextTask.title }}</p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          <template v-if="nextTask.deadlineTime">Hạn {{ nextTask.deadlineTime }}</template>
          <template v-else-if="nextTask.reminderTime">Nhắc lúc {{ nextTask.reminderTime }}</template>
          <template v-else>Trước nửa đêm</template>
        </p>
      </div>
      <UButton v-if="canTickMain" size="lg" :icon="nextTask.requiresProof ? 'i-lucide-camera' : 'i-lucide-check'" @click="onCompleteRequest(nextTask)">
        {{ nextTask.requiresProof ? "Nộp ảnh" : "Xong" }}
      </UButton>
    </section>

    <!-- Xong hết -->
    <section v-else-if="allDone" class="rounded-2xl bg-green-600 p-4 text-white shadow-sm">
      <p class="flex items-center gap-2 text-lg font-bold">
        <UIcon name="i-lucide-party-popper" class="h-6 w-6" />
        Xong hết việc chính hôm nay
      </p>
      <p class="mt-1 text-sm text-green-50">
        {{ noPenaltyStreak }} ngày liên tiếp không mất tiền. Giữ nhịp nhé!
      </p>
    </section>
    <Confetti v-model="confetti" />

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
      <p class="mb-2 text-xs text-gray-400">Vuốt ngang một việc để nộp ảnh / hoàn thành. Quá hạn giờ là không tích được nữa.</p>
      <div v-if="!tasksReady" class="py-6 text-center text-gray-400">Đang tải...</div>
      <div v-else-if="isRest" class="rounded-xl border border-dashed border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 p-6 text-center text-sky-800 dark:text-sky-200">
        Đang nghỉ. Nhiệm vụ chính sẽ quay lại vào ngày không nghỉ tiếp theo.
      </div>
      <div v-else-if="!mainToday.length" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
        Hôm nay không có nhiệm vụ chính.
        <NuxtLink v-if="can('edit')" to="/settings" class="block pt-1 text-primary hover:underline">Thêm trong Cài đặt</NuxtLink>
      </div>
      <div v-else class="flex flex-col gap-2">
        <MainTaskRow
          v-for="task in mainToday"
          :key="task.id"
          :task="task"
          :completion="completionOf(task.id)"
          :streak="streaks[task.lineageId]"
          :queued="isQueued(task.id, today)"
          :can-act="canTickMain"
          :ticked-by="tickedBy(task.id)"
          @complete="onCompleteRequest(task)"
          @uncomplete="onUncomplete(task)"
          @proof-files="(files) => openProof(task, files)"
        />
      </div>
    </section>
    </template>

    <template #side>
    <!-- Nhiệm vụ phụ -->
    <section>
      <p class="mb-2 text-xs text-gray-400">Vuốt từ trái sang để sửa, từ phải sang để xóa.</p>
      <div class="flex flex-col gap-2">
        <SideTaskRow
          v-for="task in sideToday"
          :key="task.id"
          :task="task"
          :today="today"
          :can-act="can('add')"
          :can-edit="can('edit') || task.createdBy === user?.uid"
          @toggle="(done) => onToggleSide(task, done)"
          @edit="openSideEdit(task)"
          @delete="onDeleteSide(task)"
          @proof-files="(files) => openProof(task, files)"
        />
        <p v-if="tasksReady && !sideToday.length" class="py-2 text-sm text-gray-400">
          Chưa có nhiệm vụ phụ. Việc chưa xong sẽ tự dồn sang ngày hôm sau.
        </p>
        <SideTaskInput v-if="can('add')" class="mt-1" @add="onAddSide" @options="openSideOptions" />
      </div>
    </section>
    </template>
    </UTabs>

    <ProofUploadModal
      v-model:open="proofOpen"
      :task="proofTask"
      :folder="proofFolder"
      :initial-files="proofInitialFiles"
      :known-etags="knownEtags"
      @confirm="onProofConfirm"
      @queue="onQueueProofs"
    />
    <SideTaskForm v-model:open="sideFormOpen" :task="sideEditing" :initial-title="sideInitialTitle" @save="onSaveSide" />
  </div>
</template>
