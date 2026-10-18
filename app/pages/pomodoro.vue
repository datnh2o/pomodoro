<script setup lang="ts">
import { MODE_LIST, type ModeKey } from "~/utils/modes";

const { key: modeKey, mode, setMode } = useMode();

// Chỉ tự chạy khi chuyển tiếp sau lúc hết giờ; bấm tab thủ công thì không tự chạy.
const autoStart = ref(false);

const selectMode = (next: ModeKey, options: { autoStart?: boolean } = {}) => {
  autoStart.value = options.autoStart ?? false;
  setMode(next);
};

const onTimerFinished = () => selectMode(mode.value.next, { autoStart: true });
</script>

<template>
  <section :class="['rounded-2xl p-4 text-white shadow-sm transition-colors duration-500', mode.bgCard]">
    <nav class="flex justify-center gap-1" aria-label="Chế độ">
      <button
        v-for="item in MODE_LIST"
        :key="item.key"
        type="button"
        :class="[
          'rounded-lg px-3 py-1.5 text-base transition',
          item.key === modeKey ? [mode.bgActive, 'font-bold'] : 'hover:bg-black/10',
        ]"
        :aria-pressed="item.key === modeKey"
        @click="selectMode(item.key)"
      >
        {{ item.name }}
      </button>
    </nav>

    <TimerCard :mode="mode" :auto-start="autoStart" @finished="onTimerFinished" />
  </section>
</template>
