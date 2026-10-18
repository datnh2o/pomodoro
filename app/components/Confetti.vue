<script setup lang="ts">
/** Pháo giấy nhẹ bằng CSS, không thư viện. Hiện ~2 giây rồi tự ẩn. */
const show = defineModel<boolean>({ default: false });
const pieces = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 7) * 60}ms`,
  color: ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"][i % 6],
  rotate: `${(i * 53) % 360}deg`,
}));
watch(show, (value) => {
  if (value) setTimeout(() => (show.value = false), 2200);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      <span
        v-for="piece in pieces"
        :key="piece.id"
        class="confetti-piece absolute top-0 block h-3 w-2 rounded-sm"
        :style="{ left: piece.left, backgroundColor: piece.color, animationDelay: piece.delay, transform: `rotate(${piece.rotate})` }"
      />
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes confetti-fall {
  0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0.6; }
}
.confetti-piece {
  animation: confetti-fall 1.9s ease-in forwards;
}
</style>
