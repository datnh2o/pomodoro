<script setup lang="ts">
import type { Completion, MainTask } from "#shared/utils/models";

const props = defineProps<{
  task: MainTask;
  completion?: Completion;
  /** Người dùng có quyền tích/bỏ tích không */
  canAct: boolean;
  /** Số ngày liên tiếp đã hoàn thành (không tính hôm nay nếu chưa xong) */
  streak?: number;
  /** Ảnh đang chờ tải lên (mất mạng) */
  queued?: boolean;
}>();

const emit = defineEmits<{ complete: []; uncomplete: [] }>();

const { thumbnailUrl } = useProofUpload();
const done = computed(() => !!props.completion);

/** Vuốt sang trái hay sang phải đều là hành động chính: nộp ảnh / hoàn thành / bỏ tích */
const swipeAction = computed(() =>
  done.value
    ? { label: "Bỏ tích", icon: "i-lucide-undo-2", class: "bg-gray-200 text-gray-700" }
    : props.task.requiresProof
      ? { label: "Nộp ảnh", icon: "i-lucide-camera", class: "bg-green-600 text-white" }
      : { label: "Hoàn thành", icon: "i-lucide-circle-check", class: "bg-green-600 text-white" }
);
const onSwipe = () => (done.value ? emit("uncomplete") : emit("complete"));
</script>

<template>
  <SwipeableRow :left="swipeAction" :right="swipeAction" :disabled="!canAct" @swipe-left="onSwipe" @swipe-right="onSwipe">
  <div
    :class="[
      'flex items-start gap-3 rounded-xl border bg-white p-3 shadow-sm transition',
      done ? 'border-green-200 bg-green-50/60' : 'border-gray-200',
    ]"
  >
    <button
      type="button"
      :disabled="!canAct"
      :aria-label="done ? 'Bỏ tích' : 'Hoàn thành'"
      class="mt-0.5 shrink-0 rounded-full disabled:opacity-50"
      @click="done ? emit('uncomplete') : emit('complete')"
    >
      <UIcon
        :name="done ? 'i-lucide-circle-check' : task.requiresProof ? 'i-lucide-camera' : 'i-lucide-circle'"
        :class="['h-7 w-7', done ? 'text-green-600' : 'text-gray-400']"
      />
    </button>

    <div class="min-w-0 flex-1">
      <p :class="['font-semibold leading-tight', done && 'text-gray-500 line-through']">
        {{ task.title }}
      </p>
      <p v-if="task.note" class="mt-0.5 text-sm text-gray-500">{{ task.note }}</p>

      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        <UBadge v-if="task.reminderTime" color="warning" variant="subtle" size="sm" icon="i-lucide-bell">
          {{ task.reminderTime }}
        </UBadge>
        <UBadge v-if="task.requiresProof" color="neutral" variant="subtle" size="sm" icon="i-lucide-camera">
          Cần ảnh
        </UBadge>
        <UBadge v-if="streak" color="error" variant="subtle" size="sm" icon="i-lucide-flame">
          {{ streak }} ngày liên tiếp
        </UBadge>
        <UBadge v-if="queued && !done" color="warning" variant="subtle" size="sm" icon="i-lucide-cloud-upload">
          Chờ tải ảnh
        </UBadge>
      </div>

      <div v-if="completion?.proofs.length" class="mt-2 flex flex-wrap gap-1.5">
        <a
          v-for="proof in completion.proofs"
          :key="proof.publicId"
          :href="proof.url"
          target="_blank"
          rel="noopener"
          class="block h-14 w-14 overflow-hidden rounded-lg border border-gray-200"
        >
          <img :src="thumbnailUrl(proof.url, 112)" alt="Ảnh chứng minh" class="h-full w-full object-cover" loading="lazy" />
        </a>
      </div>
    </div>
  </div>
  </SwipeableRow>
</template>
