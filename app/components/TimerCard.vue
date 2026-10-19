<script setup lang="ts">
// Trạng thái đồng hồ nằm ở usePomodoro (dùng chung cả app) nên rời màn này vẫn đếm và phát nhạc tiếp
const { mode, running, formatted, toggle, reset } = usePomodoro();
</script>

<template>
  <div class="py-6 text-center">
    <div
      class="py-8 text-[96px] font-bold leading-none tabular-nums sm:text-[120px]"
    >
      {{ formatted }}
    </div>

    <div class="relative flex justify-center pb-2">
      <button
        type="button"
        :class="[
          'h-12.5 w-50 rounded-md bg-white text-[22px] font-bold shadow-md transition',
          'hover:bg-white/90 active:translate-y-0.5 active:shadow-none',
          mode.text,
        ]"
        @click="toggle"
      >
        {{ running ? "Pause" : "Start" }}
      </button>

      <button
        v-if="running && mode.skippable"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 transition hover:bg-black/10"
        aria-label="Reset timer"
        title="Reset timer"
        @click="reset"
      >
        <UIcon name="i-lucide-skip-forward" class="h-8 w-8" />
      </button>
    </div>
  </div>
</template>
