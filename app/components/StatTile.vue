<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  hint?: string;
  icon?: string;
  tone?: "neutral" | "good" | "bad";
}>();
</script>

<template>
  <div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
    <p class="flex items-center gap-1 text-xs text-gray-500">
      <UIcon v-if="icon" :name="icon" class="h-3.5 w-3.5" />
      {{ label }}
    </p>
    <p
      :class="[
        'mt-1 text-2xl font-bold tabular-nums leading-none',
        tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : 'text-gray-900',
      ]"
    >
      {{ value }}
    </p>
    <p v-if="hint" class="mt-1 text-xs text-gray-500">{{ hint }}</p>
  </div>
</template>
