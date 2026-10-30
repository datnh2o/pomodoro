<script setup lang="ts">
import type { DayMap } from "~/composables/useHistory";
import { STREAK_LOOKBACK_DAYS } from "~/composables/useHistory";
import { addDays, formatMoney, formatMoneyShort, formatShortVi, todayKey, weekdayOf } from "#shared/utils/dates";

type Period = "week" | "month" | "year";

const { workspace } = useWorkspace();
const { tasks, ready: tasksReady } = useTasks();
const { dayDoc } = useDay();
const { fetchDays, computeStats } = useHistory();
const { showError } = useErrorToast();

const today = computed(() => todayKey());
const period = ref<Period>("week");
/** Ngày neo nằm trong kỳ đang xem */
const anchor = ref(today.value);
const days = ref<DayMap>({});
const loading = ref(false);

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Tuần" },
  { value: "month", label: "Tháng" },
  { value: "year", label: "Năm" },
];

/** Khoảng ngày của kỳ: tuần từ T2 đến CN */
const range = computed(() => {
  const a = anchor.value;
  if (period.value === "week") {
    const offset = (weekdayOf(a) + 6) % 7;
    const from = addDays(a, -offset);
    return { from, to: addDays(from, 6) };
  }
  if (period.value === "month") {
    const [y, m] = a.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${a.slice(0, 7)}-01`, to: `${a.slice(0, 7)}-${String(last).padStart(2, "0")}` };
  }
  return { from: `${a.slice(0, 4)}-01-01`, to: `${a.slice(0, 4)}-12-31` };
});

const rangeLabel = computed(() => {
  const { from, to } = range.value;
  if (period.value === "week") return `${formatShortVi(from)} – ${formatShortVi(to)}`;
  if (period.value === "month") return `Tháng ${Number(from.slice(5, 7))}/${from.slice(0, 4)}`;
  return `Năm ${from.slice(0, 4)}`;
});

const shift = (delta: number) => {
  const a = anchor.value;
  if (period.value === "week") anchor.value = addDays(a, 7 * delta);
  else if (period.value === "month") {
    const [y, m] = a.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    anchor.value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  } else anchor.value = `${Number(a.slice(0, 4)) + delta}-01-01`;
};
const canGoNext = computed(() => range.value.to < today.value);

const load = async () => {
  const ws = workspace.value;
  if (!ws || !tasksReady.value) return;
  loading.value = true;
  try {
    // Lấy thêm 120 ngày trước hôm nay để tính chuỗi hiện tại
    const from = [range.value.from, addDays(today.value, -STREAK_LOOKBACK_DAYS)].sort()[0]!;
    const to = [range.value.to, today.value].sort().at(-1)!;
    days.value = await fetchDays(ws.id, from, to);
  } catch (error) {
    showError("Không tải được thống kê", error);
  } finally {
    loading.value = false;
  }
};
watch([range, tasksReady, () => workspace.value?.id], load, { immediate: true });

const mergedDays = computed<DayMap>(() => {
  const map = { ...days.value };
  if (dayDoc.value) map[dayDoc.value.date] = dayDoc.value;
  return map;
});

const stats = computed(() => {
  const ws = workspace.value;
  if (!ws) return null;
  return computeStats({ from: range.value.from, to: range.value.to, days: mergedDays.value, tasks: tasks.value, earliest: ws.createdDate, restDays: ws.restDays });
});

const completionRate = computed(() =>
  stats.value && stats.value.countedDays ? Math.round((stats.value.fullDays / stats.value.countedDays) * 100) : null
);
const rate = (done: number, total: number) => (total ? `${Math.round((done / total) * 100)}%` : "–");
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Bộ lọc kỳ -->
    <section class="rounded-2xl bg-white dark:bg-gray-900 p-3 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
      <div class="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1 text-sm font-medium">
        <button
          v-for="item in PERIODS"
          :key="item.value"
          type="button"
          :class="['rounded-md py-1.5 transition', period === item.value ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-500 dark:text-gray-400']"
          :aria-pressed="period === item.value"
          @click="period = item.value; anchor = today"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="mt-2 flex items-center justify-between">
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" aria-label="Kỳ trước" @click="shift(-1)" />
        <span class="font-semibold">{{ rangeLabel }}</span>
        <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-right" aria-label="Kỳ sau" :disabled="!canGoNext" @click="shift(1)" />
      </div>
    </section>

    <div v-if="loading && !stats" class="py-6 text-center text-gray-400">Đang tải...</div>

    <template v-else-if="stats">
      <!-- Tiền: thưởng (mở rương), phạt, chênh lệch -->
      <section class="grid grid-cols-3 gap-2">
        <StatTile
          label="Tiền thưởng"
          compact
          :value="formatMoneyShort(stats.reward)"
          :tone="stats.reward ? 'good' : 'neutral'"
          icon="i-lucide-coins"
        />
        <StatTile
          label="Tiền phạt"
          compact
          :value="formatMoneyShort(stats.penalty)"
          :tone="stats.penalty ? 'bad' : 'good'"
          icon="i-lucide-wallet"
        />
        <StatTile
          label="Chênh lệch"
          compact
          :value="`${stats.reward - stats.penalty > 0 ? '+' : ''}${formatMoneyShort(stats.reward - stats.penalty)}`"
          :tone="stats.reward - stats.penalty >= 0 ? 'good' : 'bad'"
          icon="i-lucide-scale"
        />
      </section>

      <!-- Ô số liệu ngày -->
      <section class="grid grid-cols-3 gap-2">
        <StatTile
          label="Chuỗi"
          compact
          :value="`${stats.streak} ngày`"
          :hint="`Dài nhất: ${stats.longestStreak}`"
          :tone="stats.streak ? 'good' : 'neutral'"
          icon="i-lucide-flame"
        />
        <StatTile
          label="Ngày làm đủ"
          compact
          :value="completionRate === null ? '–' : `${completionRate}%`"
          :hint="`${stats.fullDays}/${stats.countedDays} ngày`"
          :tone="completionRate !== null && completionRate >= 80 ? 'good' : 'neutral'"
          icon="i-lucide-calendar-check"
        />
        <StatTile
          label="Lần bỏ lỡ"
          compact
          :value="String(stats.missedCount)"
          :tone="stats.missedCount ? 'bad' : 'good'"
          icon="i-lucide-circle-x"
        />
      </section>

      <!-- Theo từng nhiệm vụ -->
      <section>
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nhiệm vụ</h2>
        <div v-if="!stats.perTask.length" class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-5 text-center text-sm text-gray-500 dark:text-gray-400">
          Chưa có dữ liệu
        </div>
        <div v-else class="overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-950 text-left text-xs text-gray-500 dark:text-gray-400">
              <tr>
                <th class="px-3 py-2 font-medium">Nhiệm vụ</th>
                <th class="px-2 py-2 text-right font-medium">Làm/Lịch</th>
                <th class="px-3 py-2 text-right font-medium">Tỷ lệ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="row in stats.perTask" :key="row.lineageId">
                <td class="px-3 py-2">
                  <p class="font-medium">{{ row.title }}</p>
                  <p v-if="row.missed" class="text-xs text-red-600 dark:text-red-400">Lỡ {{ row.missed }}</p>
                </td>
                <td class="px-2 py-2 text-right tabular-nums">{{ row.completed }}/{{ row.scheduled }}</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ rate(row.completed, row.scheduled) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
