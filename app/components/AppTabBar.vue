<script setup lang="ts">
const tabs = [
  { to: "/", label: "Hôm nay", icon: "i-lucide-list-checks" },
  { to: "/pomodoro", label: "Pomodoro", icon: "i-lucide-timer" },
  { to: "/settings", label: "Cài đặt", icon: "i-lucide-settings" },
];
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur"
    style="padding-bottom: env(safe-area-inset-bottom)"
    aria-label="Điều hướng chính"
  >
    <ul class="mx-auto flex max-w-xl">
      <li v-for="tab in tabs" :key="tab.to" class="flex-1">
        <NuxtLink
          :to="tab.to"
          class="flex flex-col items-center gap-0.5 py-2 text-xs text-gray-500"
          active-class="!text-primary font-semibold"
        >
          <UIcon :name="tab.icon" class="h-6 w-6" />
          {{ tab.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
