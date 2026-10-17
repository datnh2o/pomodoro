<script setup lang="ts">
import type { DayMap } from "~/composables/useHistory";
import { STREAK_LOOKBACK_DAYS } from "~/composables/useHistory";
import { addDays, formatMoney, formatShortVi, todayKey, weekdayOf } from "~/utils/dates";

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
    // Lấy thêm 120 ngày trước hôm nay để tính streak hiện tại
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
  return computeStats({ from: range.value.from, to: range.value.to, days: mergedDays.value, tasks: tasks.value, earliest: ws.createdDate });
});

const completionRate = computed(() =>
  stats.value && stats.value.countedDays ? Math.round((stats.value.fullDays / stats.value.countedDays) * 100) : null
);
const rate = (done: number, total: number) => (total ? `${Math.round((done / total) * 100)}%` : "–");
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Bộ lọc kỳ -->
    <section class="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
      <div class="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 text-sm font-medium">
        <button
          v-for="item in PERIODS"
          :key="item.value"
          type="button"
          :class="['rounded-md py-1.5 transition', period === item.value ? 'bg-white shadow' : 'text-gray-500']"
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
      <!-- Ô số liệu đầu bảng -->
      <section class="grid grid-cols-3 gap-2">
        <StatTile
          label="Tiền phạt"
          :value="formatMoney(stats.penalty)"
          :tone="stats.penalty ? 'bad' : 'good'"
          icon="i-lucide-wallet"
        />
        <StatTile
          label="Ngày làm đủ"
          :value="completionRate === null ? '–' : `${completionRate}%`"
          :hint="`${stats.fullDays}/${stats.countedDays} ngày, tính đến hôm qua`"
          :tone="completionRate !== null && completionRate >= 80 ? 'good' : 'neutral'"
          icon="i-lucide-calendar-check"
        />
        <StatTile
          label="Lần bỏ lỡ"
          :value="String(stats.missedCount)"
          :tone="stats.missedCount ? 'bad' : 'good'"
          icon="i-lucide-circle-x"
        />
      </section>

      <!-- Theo từng nhiệm vụ -->
      <section>
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Theo nhiệm vụ chính</h2>
        <div v-if="!stats.perTask.length" class="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">
          Chưa có ngày nào đã qua trong kỳ này.
        </div>
        <div v-else class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th class="px-3 py-2 font-medium">Nhiệm vụ</th>
                <th class="px-2 py-2 text-right font-medium">Làm/Lịch</th>
                <th class="px-2 py-2 text-right font-medium">Tỷ lệ</th>
                <th class="px-3 py-2 text-right font-medium">Chuỗi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="row in stats.perTask" :key="row.lineageId">
                <td class="px-3 py-2">
                  <p class="font-medium">{{ row.title }}</p>
                  <p v-if="row.missed" class="text-xs text-red-600">Bỏ lỡ {{ row.missed }} lần</p>
                </td>
                <td class="px-2 py-2 text-right tabular-nums">{{ row.completed }}/{{ row.scheduled }}</td>
                <td class="px-2 py-2 text-right tabular-nums">{{ rate(row.completed, row.scheduled) }}</td>
                <td class="px-3 py-2 text-right tabular-nums">
                  <span class="inline-flex items-center gap-0.5" :title="`Dài nhất trong kỳ: ${row.longestStreak}`">
                    <UIcon name="i-lucide-flame" :class="['h-4 w-4', row.currentStreak ? 'text-orange-500' : 'text-gray-300']" />
                    {{ row.currentStreak }}
                  </span>
                  <span class="block text-[11px] text-gray-400">max {{ row.longestStreak }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
