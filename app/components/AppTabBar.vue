<script setup lang="ts">
const tabs = [
  { to: "/", label: "Hôm nay", icon: "i-lucide-list-checks" },
  { to: "/journal", label: "Nhật ký", icon: "i-lucide-calendar-days" },
  { to: "/stats", label: "Tổng hợp", icon: "i-lucide-chart-column" },
  { to: "/pomodoro", label: "Pomodoro", icon: "i-lucide-timer" },
  { to: "/settings", label: "Cài đặt", icon: "i-lucide-settings" },
];

// Pomodoro đang chạy (kể cả khi ở màn khác): tab hiện thời gian còn lại thay cho nhãn
const { running, formatted } = usePomodoro();
const showTimer = (to: string) => to === "/pomodoro" && running.value;
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur"
    style="padding-bottom: env(safe-area-inset-bottom)"
    aria-label="Điều hướng chính"
  >
    <ul class="mx-auto flex max-w-xl">
      <li v-for="tab in tabs" :key="tab.to" class="flex-1">
        <NuxtLink
          :to="tab.to"
          class="flex flex-col items-center gap-0.5 py-2 text-[11px] text-gray-500 dark:text-gray-400"
          active-class="!text-primary font-semibold"
        >
          <UIcon :name="tab.icon" :class="['h-6 w-6', showTimer(tab.to) && 'text-primary']" />
          <span v-if="showTimer(tab.to)" class="font-semibold tabular-nums text-primary">{{ formatted }}</span>
          <template v-else>{{ tab.label }}</template>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
