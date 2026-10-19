<script setup lang="ts">
/**
 * Rương phần thưởng vẽ bằng SVG.
 *  - locked: chưa xong hết nhiệm vụ chính (xám)
 *  - ready: xong hết, chờ mở (rung, phát sáng)
 *  - open: đã mở (nắp bật, tia sáng)
 */
const props = withDefaults(defineProps<{ state: "locked" | "ready" | "open"; size?: number }>(), { size: 48 });

const clipId = `chest-lid-${useId()}`;
const label = computed(
  () => ({ locked: "Rương: xong hết nhiệm vụ chính để mở", ready: "Rương: sẵn sàng mở", open: "Rương đã mở" })[props.state]
);
</script>

<template>
  <svg
    :width="size"
    :height="Math.round((size * 104) / 120)"
    viewBox="0 0 120 104"
    role="img"
    :aria-label="label"
    :class="['chest', `chest--${state}`]"
  >
    <defs>
      <radialGradient :id="`${clipId}-glow`">
        <stop offset="0%" stop-color="#fde68a" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#fde68a" stop-opacity="0" />
      </radialGradient>
      <clipPath :id="clipId">
        <path d="M14 52 V38 Q14 18 36 18 H84 Q106 18 106 38 V52 Z" />
      </clipPath>
    </defs>

    <!-- Hào quang phía sau -->
    <circle class="chest__halo" cx="60" cy="56" r="56" :fill="`url(#${clipId}-glow)`" />
    <g class="chest__rays">
      <path v-for="i in 8" :key="i" d="M60 52 L54 0 H66 Z" fill="#fef3c7" :transform="`rotate(${i * 45} 60 52)`" />
    </g>

    <!-- Thân rương -->
    <rect x="14" y="50" width="92" height="46" rx="6" fill="#92400e" />
    <rect x="18" y="54" width="84" height="36" rx="3" fill="#b45309" />
    <path d="M18 66 H102 M18 78 H102" stroke="#92400e" stroke-width="2" />
    <rect x="26" y="50" width="9" height="46" fill="#fbbf24" />
    <rect x="85" y="50" width="9" height="46" fill="#fbbf24" />
    <rect x="14" y="88" width="92" height="8" rx="3" fill="#f59e0b" />

    <!-- Ánh sáng bên trong khi mở -->
    <ellipse class="chest__inner" cx="60" cy="51" rx="40" ry="7" fill="#fef08a" />

    <!-- Ổ khóa -->
    <rect x="51" y="52" width="18" height="20" rx="3" fill="#fde68a" stroke="#b45309" stroke-width="1.5" />
    <circle cx="60" cy="60" r="2.5" fill="#78350f" />
    <rect x="59" y="61" width="2" height="6" fill="#78350f" />

    <!-- Nắp -->
    <g class="chest__lid">
      <path d="M14 52 V38 Q14 18 36 18 H84 Q106 18 106 38 V52 Z" fill="#b45309" />
      <g :clip-path="`url(#${clipId})`">
        <path d="M14 34 H106" stroke="#92400e" stroke-width="2" />
        <rect x="26" y="14" width="9" height="40" fill="#fbbf24" />
        <rect x="85" y="14" width="9" height="40" fill="#fbbf24" />
      </g>
      <rect x="14" y="46" width="92" height="7" rx="2" fill="#f59e0b" />
      <rect x="54" y="42" width="12" height="11" rx="2" fill="#fde68a" stroke="#b45309" stroke-width="1.5" />
    </g>

    <!-- Lấp lánh khi sẵn sàng -->
    <g class="chest__sparkles" fill="#fef9c3">
      <path d="M10 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
      <path d="M108 12 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" />
      <path d="M112 62 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" />
    </g>
  </svg>
</template>

<style scoped>
.chest {
  overflow: visible;
}
.chest__lid {
  transform-origin: 14px 52px;
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.chest__halo,
.chest__rays,
.chest__inner,
.chest__sparkles {
  opacity: 0;
  transition: opacity 0.4s ease;
}
.chest__rays {
  transform-origin: 60px 52px;
}

/* Chưa mở được */
.chest--locked {
  filter: grayscale(1);
  opacity: 0.55;
}

/* Sẵn sàng: rung từng đợt, hào quang nhịp thở */
.chest--ready {
  transform-origin: 50% 90%;
  animation: chest-wiggle 2.4s ease-in-out infinite;
}
.chest--ready .chest__halo {
  opacity: 1;
  animation: chest-pulse 1.6s ease-in-out infinite;
}
.chest--ready .chest__sparkles {
  opacity: 1;
  animation: chest-twinkle 1.2s ease-in-out infinite alternate;
}

/* Đã mở: nắp bật lên, tia sáng xoay chậm */
.chest--open .chest__lid {
  transform: translate(-4px, -16px) rotate(-22deg);
}
.chest--open .chest__halo,
.chest--open .chest__inner {
  opacity: 1;
}
.chest--open .chest__rays {
  opacity: 0.55;
  animation: chest-spin 9s linear infinite;
}

@keyframes chest-wiggle {
  0%, 60%, 100% { transform: rotate(0deg); }
  66% { transform: rotate(-6deg); }
  72% { transform: rotate(6deg); }
  78% { transform: rotate(-4deg); }
  84% { transform: rotate(3deg); }
}
@keyframes chest-pulse {
  0%, 100% { transform: scale(0.9); transform-origin: 60px 56px; }
  50% { transform: scale(1.05); transform-origin: 60px 56px; }
}
@keyframes chest-twinkle {
  from { opacity: 0.3; }
  to { opacity: 1; }
}
@keyframes chest-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .chest--ready,
  .chest--ready .chest__halo,
  .chest--ready .chest__sparkles,
  .chest--open .chest__rays {
    animation: none;
  }
}
</style>
