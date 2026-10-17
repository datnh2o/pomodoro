<script setup lang="ts">
import { formatDateVi, formatMoney } from "#shared/utils/dates";

definePageMeta({ layout: false });

interface ShareData {
  name: string;
  today: string;
  restToday: boolean;
  penaltyAmount: number;
  penaltyTotal: number;
  month: { penalty: number; fullDays: number; countedDays: number; missedCount: number };
  todayMain: Array<{
    id: string;
    title: string;
    requiresProof: boolean;
    reminderTime: string | null;
    done: boolean;
    proofs: string[];
    streak: number;
  }>;
  perTask: Array<{ lineageId: string; title: string; completed: number; scheduled: number; missed: number; currentStreak: number }>;
}

const route = useRoute();
const token = computed(() => String(route.params.token ?? ""));
const { thumbnailUrl } = useProofUpload();

const { data, error, pending, refresh } = await useFetch<ShareData>(() => `/api/share/${token.value}`, {
  server: false,
});

useHead({ title: computed(() => (data.value ? `${data.value.name} · Chia sẻ` : "Link chia sẻ")) });

const doneCount = computed(() => data.value?.todayMain.filter((t) => t.done).length ?? 0);
const rate = computed(() => {
  const m = data.value?.month;
  return m && m.countedDays ? `${Math.round((m.fullDays / m.countedDays) * 100)}%` : "–";
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <header class="border-b border-gray-200 bg-white">
      <UContainer class="flex h-14 max-w-xl items-center gap-2">
        <IconsTomato :size="22" class="text-primary" />
        <span class="font-bold">{{ data?.name ?? "Nhiệm vụ hằng ngày" }}</span>
        <UBadge color="neutral" variant="subtle" size="sm" icon="i-lucide-eye" class="ml-auto">Chỉ xem</UBadge>
      </UContainer>
    </header>

    <UContainer class="max-w-xl py-5">
      <div v-if="pending" class="flex justify-center py-20 text-gray-400">
        <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-lock"
        title="Không xem được"
        :description="error.statusMessage || error.message"
        :actions="[{ label: 'Thử lại', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
      />

      <div v-else-if="data" class="flex flex-col gap-5">
        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p class="text-sm text-gray-500">{{ formatDateVi(data.today) }}</p>
          <div class="mt-1 flex items-end justify-between gap-3">
            <p class="text-2xl font-bold">
              {{ doneCount }}/{{ data.todayMain.length }}
              <span class="text-base font-normal text-gray-500">nhiệm vụ chính</span>
            </p>
            <div class="text-right">
              <p class="text-xs text-gray-500">Tổng nợ</p>
              <p class="font-bold text-red-600">{{ formatMoney(data.penaltyTotal) }}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Hôm nay</h2>
          <p v-if="data.restToday" class="text-sm text-sky-700">Hôm nay là ngày nghỉ, không tính nhiệm vụ chính.</p>
          <p v-else-if="!data.todayMain.length" class="text-sm text-gray-500">Hôm nay không có nhiệm vụ chính.</p>
          <ul v-else class="flex flex-col gap-2">
            <li v-for="task in data.todayMain" :key="task.id" class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
              <div class="flex items-center gap-2">
                <UIcon :name="task.done ? 'i-lucide-circle-check' : 'i-lucide-circle'" :class="['h-5 w-5 shrink-0', task.done ? 'text-green-600' : 'text-gray-400']" />
                <span :class="['font-medium', task.done && 'text-gray-500 line-through']">{{ task.title }}</span>
                <UBadge v-if="task.streak" color="error" variant="subtle" size="sm" icon="i-lucide-flame" class="ml-auto">{{ task.streak }}</UBadge>
              </div>
              <div v-if="task.proofs.length" class="mt-2 flex flex-wrap gap-1.5">
                <a v-for="url in task.proofs" :key="url" :href="url" target="_blank" rel="noopener" class="block h-14 w-14 overflow-hidden rounded-lg border border-gray-200">
                  <img :src="thumbnailUrl(url, 112)" alt="Ảnh chứng minh" class="h-full w-full object-cover" loading="lazy" />
                </a>
              </div>
            </li>
          </ul>
        </section>

        <section class="grid grid-cols-3 gap-2">
          <StatTile label="Phạt tháng này" :value="formatMoney(data.month.penalty)" :tone="data.month.penalty ? 'bad' : 'good'" icon="i-lucide-wallet" />
          <StatTile label="Ngày làm đủ" :value="rate" :hint="`${data.month.fullDays}/${data.month.countedDays} ngày`" icon="i-lucide-calendar-check" />
          <StatTile label="Lần bỏ lỡ" :value="String(data.month.missedCount)" :tone="data.month.missedCount ? 'bad' : 'good'" icon="i-lucide-circle-x" />
        </section>

        <section v-if="data.perTask.length">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Tháng này theo nhiệm vụ</h2>
          <div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th class="px-3 py-2 font-medium">Nhiệm vụ</th>
                  <th class="px-2 py-2 text-right font-medium">Làm/Lịch</th>
                  <th class="px-3 py-2 text-right font-medium">Chuỗi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="row in data.perTask" :key="row.lineageId">
                  <td class="px-3 py-2 font-medium">{{ row.title }}</td>
                  <td class="px-2 py-2 text-right tabular-nums">{{ row.completed }}/{{ row.scheduled }}</td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    <UIcon name="i-lucide-flame" :class="['inline h-4 w-4 align-text-bottom', row.currentStreak ? 'text-orange-500' : 'text-gray-300']" />
                    {{ row.currentStreak }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p class="text-center text-xs text-gray-400">Cập nhật tối đa mỗi phút · Mức phạt {{ formatMoney(data.penaltyAmount) }}/nhiệm vụ</p>
      </div>
    </UContainer>
  </div>
</template>
