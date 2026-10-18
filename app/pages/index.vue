<script setup lang="ts">
import { isRestDay, isSidePendingOn, type MainTask, type Proof, type ReminderTarget, type SideTask } from "#shared/utils/models";
import type { SideTaskInput } from "~/composables/useTasks";
import type { DayMap } from "~/composables/useHistory";
import { STREAK_LOOKBACK_DAYS } from "~/composables/useHistory";
import { addDays, formatDateVi, formatMoney } from "#shared/utils/dates";

const { user } = useAuth();
const { workspace, can } = useWorkspace();
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
const mainToday = computed(() => (isRest.value ? [] : mainTasksFor(today.value)));
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

const onCompleteRequest = async (task: MainTask) => {
  if (task.requiresProof) {
    proofTask.value = task;
    proofOpen.value = true;
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
    proofTask.value = task;
    proofOpen.value = true;
    return;
  }
  try {
    await setSideTaskDone(task, done);
  } catch (error) {
    showError("Không cập nhật được", error);
  }
};
const onDeleteSide = async (task: SideTask) => {
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
    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <p class="text-sm text-gray-500">{{ formatDateVi(today) }}</p>
      <div class="mt-1 flex items-end justify-between gap-3">
        <p class="text-2xl font-bold">
          {{ doneMain.length }}/{{ mainToday.length }}
          <span class="text-base font-normal text-gray-500">nhiệm vụ chính</span>
        </p>
        <div class="text-right">
          <p class="text-xs text-gray-500">Tổng nợ</p>
          <p class="font-bold text-red-600">{{ formatMoney(workspace?.penaltyTotal ?? 0) }}</p>
        </div>
      </div>
      <UProgress :model-value="progress" color="success" size="sm" class="mt-3" />
      <p v-if="isRest" class="mt-2 text-sm text-sky-700">
        <UIcon name="i-lucide-palmtree" class="mr-1 inline h-4 w-4 align-text-bottom" />
        Hôm nay là ngày nghỉ: không tính nhiệm vụ chính, không phạt, không đứt chuỗi.
      </p>
      <p v-else-if="pendingMain.length" class="mt-2 text-sm text-amber-700">
        <UIcon name="i-lucide-triangle-alert" class="mr-1 inline h-4 w-4 align-text-bottom" />
        Còn {{ pendingMain.length }} việc, nếu bỏ lỡ sẽ mất {{ formatMoney(atRisk) }}
      </p>
      <p v-else-if="mainToday.length" class="mt-2 text-sm text-green-700">
        <UIcon name="i-lucide-party-popper" class="mr-1 inline h-4 w-4 align-text-bottom" />
        Xong hết nhiệm vụ chính hôm nay!
      </p>
    </section>

    <!-- Nhiệm vụ chính -->
    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Nhiệm vụ chính</h2>
      <div v-if="!tasksReady" class="py-6 text-center text-gray-400">Đang tải...</div>
      <div v-else-if="isRest" class="rounded-xl border border-dashed border-sky-300 bg-sky-50 p-6 text-center text-sky-800">
        Đang nghỉ. Nhiệm vụ chính sẽ quay lại vào ngày không nghỉ tiếp theo.
      </div>
      <div v-else-if="!mainToday.length" class="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500">
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
          :can-act="can('add') && !dayDoc?.closed"
          @complete="onCompleteRequest(task)"
          @uncomplete="onUncomplete(task)"
        />
      </div>
    </section>

    <!-- Nhiệm vụ phụ -->
    <section>
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Nhiệm vụ phụ</h2>
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
        />
        <p v-if="tasksReady && !sideToday.length" class="py-2 text-sm text-gray-400">
          Chưa có nhiệm vụ phụ. Việc chưa xong sẽ tự dồn sang ngày hôm sau.
        </p>
        <SideTaskInput v-if="can('add')" class="mt-1" @add="onAddSide" @options="openSideOptions" />
      </div>
    </section>

    <ProofUploadModal v-model:open="proofOpen" :task="proofTask" :folder="proofFolder" @confirm="onProofConfirm" @queue="onQueueProofs" />
    <SideTaskForm v-model:open="sideFormOpen" :task="sideEditing" :initial-title="sideInitialTitle" @save="onSaveSide" />
  </div>
</template>
