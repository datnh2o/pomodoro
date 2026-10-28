<script setup lang="ts">
import { formatMoney } from "#shared/utils/dates";
import { levelOf, playCoinSound } from "~/utils/game";

const props = defineProps<{
  /** Tiền thưởng của hôm nay */
  amount: number;
  /** Tổng số rương tính cả rương hôm nay */
  chests: number;
  /** Hôm nay đã mở rương trên máy này chưa */
  opened: boolean;
  /** Chuỗi ngày liên tiếp hoàn thành đủ nhiệm vụ chính */
  streak: number;
}>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ opened: [] }>();

const phase = ref<"closed" | "opening" | "open">("closed");
const shown = ref(0);
const confetti = ref(false);
const actionId = `chest-action-${useId()}`;

const level = computed(() => levelOf(props.chests));
const leveledUp = computed(() => props.amount > 0 && levelOf(props.chests - 1).level < level.value.level);

watch(open, (value) => {
  if (!value) return;
  phase.value = props.opened ? "open" : "closed";
  shown.value = props.opened ? props.amount : 0;
  nextTick(() => document.getElementById(actionId)?.focus());
});

// Đã mở trên thiết bị khác trong lúc cửa sổ này còn chờ: chuyển luôn sang đã mở, không mở lại
watch(
  () => props.opened,
  (value) => {
    if (!value || phase.value !== "closed") return;
    phase.value = "open";
    shown.value = props.amount;
  }
);

/** Số tiền chạy từ 0 lên (ease-out) */
const countUp = () => {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 900);
    shown.value = Math.round(props.amount * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const openChest = () => {
  if (phase.value !== "closed") return;
  phase.value = "opening";
  playCoinSound();
  navigator.vibrate?.([30, 40, 60]);
  setTimeout(() => {
    phase.value = "open";
    confetti.value = true;
    emit("opened");
    countUp();
  }, 500);
};

const close = () => {
  open.value = false;
};

// Xu bay tỏa ra từ miệng rương
const coins = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI - Math.PI; // nửa trên
  const reach = 80 + (i % 3) * 22;
  return {
    id: i,
    dx: `${Math.round(Math.cos(angle) * reach)}px`,
    dy: `${Math.round(Math.sin(angle) * reach) - 30}px`,
    delay: `${(i % 6) * 45}ms`,
  };
});
</script>

<template>
  <Teleport to="body">
    <Transition name="chest-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chest-modal-title"
        @keydown.esc="close"
        @click.self="close"
      >
        <div class="relative w-full max-w-sm rounded-3xl bg-linear-to-b from-amber-400 via-orange-500 to-rose-600 p-6 text-center text-white shadow-2xl">
          <button type="button" class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10" aria-label="Đóng" @click="close">
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>

          <p id="chest-modal-title" class="px-6 text-xl font-black uppercase tracking-wide drop-shadow">
            {{ phase === "open" ? "Phần thưởng!" : "Xong nhiệm vụ!" }}
          </p>
          <p class="mt-1 text-sm text-amber-50">
            {{ phase === "open" ? "Xong hết nhiệm vụ chính của ngày" : "Chạm vào rương để mở" }}
          </p>

          <!-- Chừa chỗ phía trên cho nắp bật lên khi mở -->
          <button
            type="button"
            class="relative mx-auto mt-12 block"
            :aria-label="phase === 'closed' ? 'Mở rương' : 'Rương đã mở'"
            :disabled="phase !== 'closed'"
            @click="openChest"
          >
            <TreasureChest :state="phase === 'open' ? 'open' : 'ready'" :size="176" :class="phase === 'opening' && 'chest-shake'" />
            <template v-if="phase === 'open' && amount > 0">
              <span
                v-for="coin in coins"
                :key="coin.id"
                class="coin pointer-events-none absolute left-1/2 top-[42%] flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-amber-600 bg-yellow-300 text-xs font-black text-amber-700"
                :style="{ '--dx': coin.dx, '--dy': coin.dy, animationDelay: coin.delay }"
                aria-hidden="true"
              >₫</span>
            </template>
          </button>

          <template v-if="phase === 'open'">
            <p v-if="amount > 0" class="text-4xl font-black tabular-nums drop-shadow-md">+{{ formatMoney(shown) }}</p>

            <div class="mt-4 rounded-2xl bg-black/15 p-3 text-left">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-bold">
                  Cấp {{ level.level }} · {{ level.title }}
                  <span v-if="leveledUp" class="level-up ml-1 rounded-full bg-yellow-300 px-2 py-0.5 text-[11px] font-black text-amber-800">LÊN CẤP!</span>
                </p>
                <p class="text-xs tabular-nums">{{ level.nextAt ? `${chests}/${level.nextAt}` : chests }} rương</p>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-black/20">
                <div class="h-full rounded-full bg-yellow-200 transition-[width] duration-700" :style="{ width: `${Math.round(level.progress * 100)}%` }" />
              </div>
              <p class="mt-1.5 text-xs text-amber-50">
                <UIcon name="i-lucide-flame" class="mr-0.5 inline-block h-3.5 w-3.5 align-text-bottom" />
                Chuỗi {{ streak }} ngày liên tiếp hoàn thành đủ
              </p>
            </div>
            <p v-if="amount > 0" class="mt-3 text-[11px] text-amber-50/90">
              Tiền thưởng vào ví khi chốt ngày lúc 0h.
            </p>
          </template>

          <UButton
            :id="actionId"
            size="xl"
            color="neutral"
            variant="solid"
            block
            class="mt-4 justify-center bg-white font-bold text-orange-600 hover:bg-amber-50 disabled:bg-white/80 aria-disabled:bg-white/80"
            :disabled="phase === 'opening'"
            @click="phase === 'open' ? close() : openChest()"
          >
            {{ phase === "open" ? "Nhận thưởng" : "Mở rương" }}
          </UButton>
        </div>
      </div>
    </Transition>
  </Teleport>
  <Confetti v-model="confetti" />
</template>

<style scoped>
.chest-modal-enter-active,
.chest-modal-leave-active {
  transition: opacity 0.25s ease;
}
.chest-modal-enter-from,
.chest-modal-leave-to {
  opacity: 0;
}

.chest-shake {
  animation: chest-shake 0.5s ease-in-out;
}
@keyframes chest-shake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  20% { transform: translate(-3px, 1px) rotate(-5deg); }
  40% { transform: translate(3px, -1px) rotate(5deg); }
  60% { transform: translate(-3px, 0) rotate(-4deg) scale(1.04); }
  80% { transform: translate(2px, -2px) rotate(3deg) scale(1.08); }
}

.coin {
  animation: coin-burst 1.1s cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
@keyframes coin-burst {
  0% { transform: translate(-50%, 0) scale(0.3); opacity: 0; }
  15% { opacity: 1; }
  70% { transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--dx)), calc(var(--dy) + 40px)) scale(0.9); opacity: 0; }
}

.level-up {
  display: inline-block;
  animation: level-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both;
}
@keyframes level-pop {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .chest-shake,
  .coin,
  .level-up {
    animation: none;
  }
  .coin {
    display: none;
  }
}
</style>
