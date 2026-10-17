<script setup lang="ts">
import type { DayMap, DaySummary } from "~/composables/useHistory";
import { isMainTask, isRestDay, isScheduledOn, isSideTask, type MainTask } from "#shared/utils/models";
import { addDays, formatDateVi, formatMoney, todayKey, weekdayOf } from "#shared/utils/dates";

const { workspace } = useWorkspace();
const { tasks, ready: tasksReady } = useTasks();
const { dayDoc } = useDay();
const { fetchDays, computeStats } = useHistory();
const { thumbnailUrl } = useProofUpload();
const { showError } = useErrorToast();

const today = computed(() => todayKey());
/** Tháng đang xem, dạng YYYY-MM */
const month = ref(today.value.slice(0, 7));
const selected = ref<string>(today.value);
const days = ref<DayMap>({});
const loading = ref(false);

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
    list.push(stats.value?.days[d] ?? { date: d, status: "none", scheduled: 0, completed: 0, penalty: 0 });
  }
  return list;
});

const STATUS_STYLE: Record<DaySummary["status"], { cell: string; label: string; icon: string }> = {
  full: { cell: "bg-green-100 text-green-800 ring-green-300", label: "Đủ", icon: "i-lucide-circle-check" },
  partial: { cell: "bg-amber-100 text-amber-800 ring-amber-300", label: "Thiếu", icon: "i-lucide-minus" },
  missed: { cell: "bg-red-100 text-red-800 ring-red-300", label: "Bỏ lỡ", icon: "i-lucide-circle-x" },
  today: { cell: "bg-white text-gray-900 ring-primary", label: "Hôm nay", icon: "i-lucide-clock" },
  rest: { cell: "bg-sky-100 text-sky-800 ring-sky-300", label: "Nghỉ", icon: "i-lucide-palmtree" },
  none: { cell: "bg-gray-50 text-gray-400 ring-gray-200", label: "Không có việc", icon: "i-lucide-minus" },
  future: { cell: "bg-white text-gray-300 ring-gray-100", label: "", icon: "" },
};
const LEGEND = (["full", "partial", "missed", "rest", "none"] as const).map((k) => ({ key: k, ...STATUS_STYLE[k] }));

// ---- Chi tiết ngày đã chọn ----
const selectedDay = computed(() => mergedDays.value[selected.value]);
const selectedSummary = computed(() => stats.value?.days[selected.value]);

interface DetailRow {
  task: MainTask;
  done: boolean;
  proofs: { url: string; publicId: string }[];
}
const selectedIsRest = computed(() => isRestDay(workspace.value?.restDays, selected.value));
const selectedMain = computed<DetailRow[]>(() =>
  (selectedIsRest.value ? [] : tasks.value)
    .filter(isMainTask)
    .filter((t) => isScheduledOn(t, selected.value))
    .map((task) => {
      const completion = selectedDay.value?.completions[task.id];
      return { task, done: !!completion, proofs: completion?.proofs ?? [] };
    })
);
const selectedSide = computed(() =>
  tasks.value.filter(isSideTask).filter((t) => t.doneDate === selected.value)
);
</script>

<template>
  <div class="flex flex-col gap-5">
    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div class="mb-3 flex items-center justify-between">
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" aria-label="Tháng trước" @click="shiftMonth(-1)" />
        <h2 class="font-bold">{{ monthLabel }}</h2>
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" aria-label="Tháng sau" :disabled="month >= today.slice(0, 7)" @click="shiftMonth(1)" />
      </div>

      <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-gray-500">
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
              'flex aspect-square flex-col items-center justify-center rounded-lg text-sm ring-1 transition',
              STATUS_STYLE[cell.status].cell,
              selected === cell.date && 'ring-2 ring-gray-900',
            ]"
            :aria-label="`${cell.date}: ${STATUS_STYLE[cell.status].label}`"
            @click="selected = cell.date"
          >
            <span class="font-semibold leading-none">{{ Number(cell.date.slice(8, 10)) }}</span>
            <span v-if="cell.scheduled" class="mt-0.5 text-[10px] leading-none tabular-nums">{{ cell.completed }}/{{ cell.scheduled }}</span>
          </button>
        </template>
      </div>

      <ul class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        <li v-for="item in LEGEND" :key="item.key" class="flex items-center gap-1">
          <span :class="['inline-block h-3 w-3 rounded ring-1', item.cell]" />
          <UIcon :name="item.icon" class="h-3 w-3" />
          {{ item.label }}
        </li>
      </ul>

      <p v-if="stats" class="mt-3 text-sm text-gray-600">
        Tháng này: <b class="text-red-600">{{ formatMoney(stats.penalty) }}</b> tiền phạt ·
        <b>{{ stats.fullDays }}/{{ stats.countedDays }}</b> ngày làm đủ
      </p>
    </section>

    <!-- Chi tiết ngày -->
    <section>
      <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{{ formatDateVi(selected) }}</h3>
      <div v-if="loading" class="py-4 text-center text-gray-400">Đang tải...</div>
      <template v-else>
        <p v-if="selectedIsRest" class="mb-2 text-sm text-sky-700">Ngày nghỉ: không tính nhiệm vụ chính.</p>
        <p v-if="selectedSummary?.penalty" class="mb-2 text-sm text-red-600">
          Mất {{ formatMoney(selectedSummary.penalty) }} vì bỏ lỡ {{ selectedSummary.scheduled - selectedSummary.completed }} việc.
        </p>
        <div v-if="!selectedMain.length && !selectedSide.length" class="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">
          Không có nhiệm vụ nào trong ngày này.
        </div>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="row in selectedMain" :key="row.task.id" class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
            <div class="flex items-center gap-2">
              <UIcon :name="row.done ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" :class="['h-5 w-5 shrink-0', row.done ? 'text-green-600' : 'text-red-500']" />
              <span :class="['font-medium', !row.done && 'text-gray-500']">{{ row.task.title }}</span>
              <span class="ml-auto text-xs text-gray-400">{{ row.done ? "Đã làm" : selected < today ? "Bỏ lỡ" : "Chưa làm" }}</span>
            </div>
            <div v-if="row.proofs.length" class="mt-2 flex flex-wrap gap-1.5">
              <a v-for="proof in row.proofs" :key="proof.publicId" :href="proof.url" target="_blank" rel="noopener" class="block h-16 w-16 overflow-hidden rounded-lg border border-gray-200">
                <img :src="thumbnailUrl(proof.url, 128)" alt="Ảnh chứng minh" class="h-full w-full object-cover" loading="lazy" />
              </a>
            </div>
          </li>
          <li v-for="task in selectedSide" :key="task.id" class="flex items-center gap-2 rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-gray-200">
            <UIcon name="i-lucide-check" class="h-4 w-4 text-green-600" />
            <span>{{ task.title }}</span>
            <UBadge color="neutral" variant="subtle" size="sm" class="ml-auto">Phụ</UBadge>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>
