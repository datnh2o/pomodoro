<script setup lang="ts">
import type { Mode } from "~/utils/modes";

const props = defineProps<{
  mode: Mode;
  /** Tự chạy ngay khi đổi chế độ (dùng khi chuyển tiếp sau lúc hết giờ) */
  autoStart: boolean;
}>();

const emit = defineEmits<{ finished: [] }>();

const remaining = ref(props.mode.duration);
const running = ref(false);

let endTime = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let alertSound: HTMLAudioElement | null = null;
let lofiSound: HTMLAudioElement | null = null;

const formatted = computed(() => {
  const minutes = Math.floor(remaining.value / 60);
  const seconds = remaining.value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
});

onMounted(() => {
  alertSound = new Audio("/alert.mp3");
  lofiSound = new Audio("/lofi.mp3");
  lofiSound.loop = true;
});

const stop = () => {
  if (interval) clearInterval(interval);
  interval = null;
  running.value = false;
  lofiSound?.pause();
};

const reset = () => {
  stop();
  remaining.value = props.mode.duration;
  if (lofiSound) lofiSound.currentTime = 0;
};

const finish = () => {
  reset();
  alertSound?.play().catch(() => {});
  emit("finished");
};

const tick = () => {
  const left = Math.round((endTime - Date.now()) / 1000);
  if (left > 0) {
    remaining.value = left;
    return;
  }
  remaining.value = 0;
  finish();
};

const start = () => {
  if (running.value) return;
  lofiSound?.play().catch(() => {});
  // Tính theo mốc thời gian kết thúc để không bị trôi khi tab nền bị throttle
  endTime = Date.now() + remaining.value * 1000;
  running.value = true;
  interval = setInterval(tick, 250);
};

const toggle = () => (running.value ? stop() : start());

// Đổi chế độ: đặt lại đồng hồ; tự chạy nếu được yêu cầu (sau khi chế độ trước hết giờ)
watch(
  () => props.mode,
  () => {
    reset();
    if (props.autoStart) start();
  }
);

onBeforeUnmount(stop);
</script>

<template>
  <div class="py-6 text-center">
    <div class="py-8 text-[96px] font-bold leading-none tabular-nums sm:text-[120px]">
      {{ formatted }}
    </div>

    <div class="relative flex justify-center pb-2">
      <button
        type="button"
        :class="[
          'h-[50px] w-[200px] rounded-md bg-white text-[22px] font-bold shadow-md transition',
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
