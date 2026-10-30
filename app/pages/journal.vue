<script setup lang="ts">
import type { DayMap, DaySummary } from "~/composables/useHistory";
import { isMainTask, isRestDay, isScheduledOn, isSideTask, type MainTask, type SideTask } from "#shared/utils/models";
import { PERIODS, groupByPeriod, slotTimeOf } from "~/utils/periods";
import { addDays, formatDateVi, formatMoney, todayKey, weekdayOf } from "#shared/utils/dates";

const { user } = useAuth();
const { workspace, can, isOwner } = useWorkspace();
const { tasks, ready: tasksReady, uncompleteSideTask } = useTasks();
const { dayDoc, uncomplete } = useDay();
const { fetchDays, computeStats } = useHistory();
const { showError } = useErrorToast();

const today = computed(() => todayKey());
/** Tháng đang xem, dạng YYYY-MM */
const month = ref(today.value.slice(0, 7));
const selected = ref<string>(today.value);
const days = ref<DayMap>({});
const loading = ref(false);

// Bỏ tích (tích nhầm) chỉ cho hôm nay, trước khi chốt: việc chính cần chủ sở hữu, việc phụ cần quyền thêm
const canUntickMain = computed(() => selected.value === today.value && isOwner.value && !dayDoc.value?.closed);
const canUntickSide = (task: SideTask) => selected.value === today.value && (can("edit") || task.createdBy === user.value?.uid);
const onUntickMain = async (task: MainTask) => {
  try {
    await uncomplete(task);
  } catch (error) {
    showError("Không bỏ tích được", error);
  }
};
const onUntickSide = async (task: SideTask) => {
  try {
    await uncompleteSideTask(task);
  } catch (error) {
    showError("Không bỏ tích được", error);
  }
};

const monthStart = computed(() => `${month.value}-01`);
const monthEnd = computed(() => {
  const [y, m] = month.value.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.value}-${String(last).padStart(2, "0")}`;
});
const monthLabel = computed(() => {
  const [y, m] = month.value.split("-");
  return `Tháng ${Number(m)}/${y}`;
});

const shiftMonth = (delta: number) => {
  const [y, m] = month.value.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  month.value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const load = async () => {
  const ws = workspace.value;
  if (!ws || !tasksReady.value) return;
  loading.value = true;
  try {
    days.value = await fetchDays(ws.id, monthStart.value, monthEnd.value);
  } catch (error) {
    showError("Không tải được nhật ký", error);
  } finally {
    loading.value = false;
  }
};
watch([month, tasksReady, () => workspace.value?.id], load, { immediate: true });

/** Gộp dữ liệu hôm nay (realtime) vào bản đã tải */
const mergedDays = computed<DayMap>(() => {
  const map = { ...days.value };
  if (dayDoc.value && dayDoc.value.date >= monthStart.value && dayDoc.value.date <= monthEnd.value) {
    map[dayDoc.value.date] = dayDoc.value;
  }
  return map;
});

const stats = computed(() => {
  const ws = workspace.value;
  if (!ws) return null;
  return computeStats({ from: monthStart.value, to: monthEnd.value, days: mergedDays.value, tasks: tasks.value, earliest: ws.createdDate, restDays: ws.restDays });
});

/** Ô lịch: thêm ô trống đầu tháng để T2 đứng cột đầu */
const cells = computed(() => {
  const list: (DaySummary | null)[] = [];
  const firstWeekday = weekdayOf(monthStart.value); // 0 = CN
  const lead = (firstWeekday + 6) % 7; // số ô trống trước ngày 1 (tuần bắt đầu T2)
  for (let i = 0; i < lead; i++) list.push(null);
  for (let d = monthStart.value; d <= monthEnd.value; d = addDays(d, 1)) {
    list.push(stats.value?.days[d] ?? { date: d, status: "none", scheduled: 0, completed: 0, penalty: 0, reward: 0 });
  }
  return list;
});

const STATUS_STYLE: Record<DaySummary["status"], { cell: string; label: string; icon: string }> = {
  full: { cell: "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 ring-green-300 dark:ring-green-700", label: "Đủ", icon: "i-lucide-circle-check" },
  partial: { cell: "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 ring-amber-300 dark:ring-amber-700", label: "Thiếu", icon: "i-lucide-minus" },
  missed: { cell: "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 ring-red-300 dark:ring-red-700", label: "Bỏ lỡ", icon: "i-lucide-circle-x" },
  today: { cell: "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ring-primary", label: "Hôm nay", icon: "i-lucide-clock" },
  rest: { cell: "bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 ring-sky-300 dark:ring-sky-700", label: "Nghỉ", icon: "i-lucide-palmtree" },
  none: { cell: "bg-gray-50 dark:bg-gray-950 text-gray-400 ring-gray-200 dark:ring-gray-800", label: "Không có việc", icon: "i-lucide-minus" },
  future: { cell: "bg-white dark:bg-gray-900 text-gray-300 ring-gray-100", label: "", icon: "" },
};

// ---- Chi tiết ngày đã chọn ----
const selectedDay = computed(() => mergedDays.value[selected.value]);
const selectedSummary = computed(() => stats.value?.days[selected.value]);

interface DetailRow {
  task: MainTask;
  done: boolean;
}
const selectedIsRest = computed(() => isRestDay(workspace.value?.restDays, selected.value));
/** Giờ "đến lượt" để sắp xếp và chia buổi, giống màn Hôm nay */
const slotKey = (t: MainTask | SideTask) => slotTimeOf(t) ?? "99:99";
const selectedMain = computed<DetailRow[]>(() =>
  (selectedIsRest.value ? [] : tasks.value)
    .filter(isMainTask)
    .filter((t) => isScheduledOn(t, selected.value))
    .sort((a, b) => slotKey(a).localeCompare(slotKey(b)) || a.order - b.order)
    .map((task) => {
      const completion = selectedDay.value?.completions[task.id];
      return { task, done: !!completion };
    })
);
const selectedSide = computed(() =>
  tasks.value
    .filter(isSideTask)
    .filter((t) => t.doneDate === selected.value)
    .sort((a, b) => slotKey(a).localeCompare(slotKey(b)) || (a.doneAt ?? 0) - (b.doneAt ?? 0))
);
/** Chia theo buổi; mỗi nhóm giữ cả việc chính (dạng DetailRow) và việc phụ */
const selectedGroups = computed(() => {
  const mainByPeriod = groupByPeriod(selectedMain.value.map((r) => r.task));
  const sideByPeriod = groupByPeriod(selectedSide.value);
  const rowOf = new Map(selectedMain.value.map((r) => [r.task.id, r]));
  return PERIODS.map((p) => ({
    ...p,
    main: (mainByPeriod.find((g) => g.key === p.key)?.items ?? []).map((t) => rowOf.get(t.id)!),
    side: sideByPeriod.find((g) => g.key === p.key)?.items ?? [],
  })).filter((g) => g.main.length || g.side.length);
});
const showPeriodHeader = computed(() => selectedGroups.value.length > 1 || selectedGroups.value[0]?.key !== "anytime");
</script>

<template>
  <div class="flex flex-col gap-5">
    <section class="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <div class="mb-3 flex items-center justify-between">
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" aria-label="Tháng trước" @click="shiftMonth(-1)" />
        <h2 class="font-bold">{{ monthLabel }}</h2>
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" aria-label="Tháng sau" :disabled="month >= today.slice(0, 7)" @click="shiftMonth(1)" />
      </div>

      <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400">
        <span v-for="d in ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']" :key="d">{{ d }}</span>
      </div>
      <div class="mt-1 grid grid-cols-7 gap-1">
        <template v-for="(cell, index) in cells" :key="index">
          <span v-if="!cell" />
          <button
            v-else
            type="button"
            :disabled="cell.status === 'future'"
            :class="[
              'relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm ring-1 transition',
              STATUS_STYLE[cell.status].cell,
              selected === cell.date && 'ring-2 ring-gray-900 dark:ring-white',
            ]"
            :aria-label="`${cell.date}: ${STATUS_STYLE[cell.status].label}`"
            @click="selected = cell.date"
          >
            <span class="font-semibold leading-none">{{ Number(cell.date.slice(8, 10)) }}</span>
            <span v-if="cell.scheduled" class="mt-0.5 text-[10px] leading-none tabular-nums">{{ cell.completed }}/{{ cell.scheduled }}</span>
            <!-- Ngày có thưởng (đã mở rương) -->
            <UIcon v-if="cell.reward" name="i-lucide-coins" class="absolute right-0.5 top-0.5 h-3 w-3 text-amber-500" />
          </button>
        </template>
      </div>


      <p v-if="stats" class="mt-3 text-sm text-gray-600 dark:text-gray-400">
        <b class="text-amber-700 dark:text-amber-300">+{{ formatMoney(stats.reward) }}</b> ·
        <b class="text-red-600 dark:text-red-400">−{{ formatMoney(stats.penalty) }}</b> ·
        <b>{{ stats.fullDays }}/{{ stats.countedDays }}</b> ngày đủ
      </p>
    </section>

    <!-- Chi tiết ngày -->
    <section>
      <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ formatDateVi(selected) }}</h3>
      <div v-if="loading" class="py-4 text-center text-gray-400">Đang tải...</div>
      <template v-else>
        <p v-if="selectedIsRest" class="mb-2 text-sm text-sky-700 dark:text-sky-300">Ngày nghỉ: không tính nhiệm vụ chính.</p>
        <p v-if="selectedSummary?.reward" class="mb-2 text-sm text-amber-700 dark:text-amber-300">
          <UIcon name="i-lucide-coins" class="mr-0.5 inline-block h-4 w-4 align-text-bottom" />
          Xong hết nhiệm vụ chính, mở rương +{{ formatMoney(selectedSummary.reward) }}.
        </p>
        <p v-if="selectedSummary?.penalty" class="mb-2 text-sm text-red-600 dark:text-red-400">
          Mất {{ formatMoney(selectedSummary.penalty) }} vì bỏ lỡ {{ selectedSummary.scheduled - selectedSummary.completed }} việc<template v-if="(selectedDay?.multiplier ?? 1) > 1">, phạt ×{{ selectedDay?.multiplier }} do lỡ liên tiếp</template>.
        </p>
        <div v-if="!selectedMain.length && !selectedSide.length" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-5 text-center text-sm text-gray-500 dark:text-gray-400">
          Không có nhiệm vụ nào trong ngày này.
        </div>
        <div v-else class="flex flex-col gap-2">
        <template v-for="group in selectedGroups" :key="group.key">
          <PeriodHeader
            v-if="showPeriodHeader"
            :label="group.label"
            :icon="group.icon"
            :done="group.main.filter((r) => r.done).length + group.side.length"
            :total="group.main.length + group.side.length"
          />
          <ul class="flex flex-col gap-2">
          <li v-for="row in group.main" :key="row.task.id" class="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
            <div class="flex items-center gap-2">
              <UIcon :name="row.done ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" :class="['h-5 w-5 shrink-0', row.done ? 'text-green-600' : 'text-red-500']" />
              <span :class="['font-medium', !row.done && 'text-gray-500 dark:text-gray-400']">{{ row.task.title }}</span>
              <span v-if="slotTimeOf(row.task)" class="text-xs text-gray-400">{{ slotTimeOf(row.task) }}</span>
              <span class="ml-auto text-xs text-gray-400">{{ row.done ? "Đã làm" : selected < today ? "Bỏ lỡ" : "Chưa làm" }}</span>
              <UButton v-if="row.done && canUntickMain" size="xs" color="neutral" variant="outline" icon="i-lucide-undo-2" @click="onUntickMain(row.task)">Bỏ tích</UButton>
            </div>
          </li>
          <li v-for="task in group.side" :key="task.id" class="rounded-xl bg-white dark:bg-gray-900 p-3 text-sm shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-check" class="h-4 w-4 text-green-600" />
              <span>{{ task.title }}</span>
              <span v-if="slotTimeOf(task)" class="text-xs text-gray-400">{{ slotTimeOf(task) }}</span>
              <UBadge color="neutral" variant="subtle" size="sm" class="ml-auto">Phụ</UBadge>
              <UButton v-if="canUntickSide(task)" size="xs" color="neutral" variant="outline" icon="i-lucide-undo-2" @click="onUntickSide(task)">Bỏ tích</UButton>
            </div>
          </li>
          </ul>
        </template>
        </div>
      </template>
    </section>
  </div>
</template>
