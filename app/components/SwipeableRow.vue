<script setup lang="ts">
/**
 * Dòng vuốt ngang để lộ hành động. `left` hiện khi vuốt từ trái sang phải,
 * `right` hiện khi vuốt từ phải sang trái. Vượt ngưỡng rồi thả tay thì phát sự kiện.
 * Cuộn dọc vẫn bình thường nhờ touch-action: pan-y.
 */
export interface SwipeAction {
  label: string;
  icon: string;
  /** Lớp màu nền + chữ của vùng hành động */
  class: string;
}

const props = defineProps<{
  left?: SwipeAction;
  right?: SwipeAction;
  disabled?: boolean;
}>();

const emit = defineEmits<{ swipeLeft: []; swipeRight: [] }>();

const THRESHOLD = 72;
const MAX = 120;

const dx = ref(0);
const animating = ref(false);
let startX = 0;
let startY = 0;
let pointerId: number | null = null;
let axis: "x" | "y" | null = null;

const reached = computed(() => Math.abs(dx.value) >= THRESHOLD);

const onPointerDown = (event: PointerEvent) => {
  if (props.disabled || (!props.left && !props.right)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  pointerId = event.pointerId;
  startX = event.clientX;
  startY = event.clientY;
  axis = null;
  animating.value = false;
};

const onPointerMove = (event: PointerEvent) => {
  if (pointerId !== event.pointerId) return;
  const moveX = event.clientX - startX;
  const moveY = event.clientY - startY;
  if (axis === null) {
    if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
    axis = Math.abs(moveX) > Math.abs(moveY) ? "x" : "y";
    if (axis === "x") (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  if (axis !== "x") return;
  let next = moveX;
  if (next > 0 && !props.left) next = 0;
  if (next < 0 && !props.right) next = 0;
  // Kháng lực khi kéo quá xa
  const sign = Math.sign(next);
  const abs = Math.min(Math.abs(next), MAX + (Math.abs(next) - MAX) * 0.2);
  dx.value = sign * abs;
};

const finish = (event: PointerEvent) => {
  if (pointerId !== event.pointerId) return;
  pointerId = null;
  if (axis === "x") {
    if (dx.value <= -THRESHOLD && props.right) emit("swipeLeft");
    else if (dx.value >= THRESHOLD && props.left) emit("swipeRight");
  }
  axis = null;
  animating.value = true;
  dx.value = 0;
};
</script>

<template>
  <div class="relative overflow-hidden rounded-xl">
    <!-- Nền hành động bên trái (lộ ra khi vuốt sang phải) -->
    <div
      v-if="left"
      :class="['absolute inset-y-0 left-0 flex w-full items-center gap-2 pl-4 text-sm font-semibold transition-opacity', left.class, dx > 0 ? 'opacity-100' : 'opacity-0']"
      aria-hidden="true"
    >
      <UIcon :name="left.icon" :class="['h-5 w-5 transition-transform', dx > 0 && reached && 'scale-125']" />
      {{ left.label }}
    </div>
    <!-- Nền hành động bên phải (lộ ra khi vuốt sang trái) -->
    <div
      v-if="right"
      :class="['absolute inset-y-0 right-0 flex w-full items-center justify-end gap-2 pr-4 text-sm font-semibold transition-opacity', right.class, dx < 0 ? 'opacity-100' : 'opacity-0']"
      aria-hidden="true"
    >
      {{ right.label }}
      <UIcon :name="right.icon" :class="['h-5 w-5 transition-transform', dx < 0 && reached && 'scale-125']" />
    </div>

    <div
      class="relative select-none"
      :style="{ transform: `translateX(${dx}px)`, transition: animating ? 'transform 200ms ease-out' : 'none', touchAction: 'pan-y' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="finish"
      @pointercancel="finish"
    >
      <slot />
    </div>
  </div>
</template>
