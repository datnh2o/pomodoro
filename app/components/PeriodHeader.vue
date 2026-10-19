<script setup lang="ts">
defineProps<{
  label: string;
  icon: string;
  done: number;
  total: number;
  /** Buổi đang diễn ra */
  current?: boolean;
}>();
</script>

<template>
  <div
    :class="[
      'flex items-center gap-2 px-1 pt-3 first:pt-0 text-sm font-semibold uppercase tracking-wide',
      current ? 'text-primary' : 'text-gray-500 dark:text-gray-400',
    ]"
  >
    <UIcon :name="icon" class="h-4 w-4" />
    {{ label }}
    <UBadge v-if="current" color="primary" variant="subtle" size="sm" class="normal-case tracking-normal">Bây giờ</UBadge>
    <span class="ml-auto text-xs font-normal normal-case tracking-normal">{{ done }}/{{ total }}</span>
  </div>
</template>
