<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  hint?: string;
  icon?: string;
  tone?: "neutral" | "good" | "bad";
  /** Chữ số nhỏ hơn cho lưới 3 cột trên điện thoại */
  compact?: boolean;
}>();
</script>

<template>
  <div class="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
    <p class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <UIcon v-if="icon" :name="icon" class="h-3.5 w-3.5" />
      {{ label }}
    </p>
    <p
      :class="[
        'mt-1 font-bold tabular-nums leading-none',
        compact ? 'text-xl' : 'text-2xl',
        tone === 'good' ? 'text-green-700 dark:text-green-300' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100',
      ]"
    >
      {{ value }}
    </p>
    <p v-if="hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ hint }}</p>
  </div>
</template>
