<script setup lang="ts">
import { isPastDeadline, type Completion, type MainTask } from "#shared/utils/models";
import { currentTimeHHmm } from "#shared/utils/dates";

const props = defineProps<{
  task: MainTask;
  completion?: Completion;
  /** Người dùng có quyền tích/bỏ tích không (chỉ chủ sở hữu) */
  canAct: boolean;
  /** Ảnh đang chờ tải lên (mất mạng) */
  queued?: boolean;
  /** Tên người đã tích nếu không phải mình */
  tickedBy?: string | null;
}>();

const emit = defineEmits<{ complete: []; uncomplete: []; proofFiles: [files: File[]] }>();

const { thumbnailUrl, proofViewUrl } = useProofUpload();
const { nowHHmm } = useClock();
const done = computed(() => !!props.completion);
const overdue = computed(() => !done.value && isPastDeadline(props.task, nowHHmm.value));
const actionable = computed(() => props.canAct && !overdue.value);

// Mở camera ngay khi bấm (trong cùng cử chỉ người dùng), bỏ bước bấm thêm trong modal
const cameraInput = ref<HTMLInputElement | null>(null);
const primaryAction = () => {
  if (!actionable.value) return;
  if (done.value) return emit("uncomplete");
  if (props.task.requiresProof) {
    cameraInput.value?.click();
    return;
  }
  emit("complete");
};
const onCameraPick = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  // Hủy chọn ảnh thì vẫn mở modal để chọn lại; có ảnh thì tải luôn
  if (files.length) emit("proofFiles", files);
  else emit("complete");
};

const formatTime = (ts: number) => currentTimeHHmm(new Date(ts));

/** Vuốt sang trái hay sang phải đều là hành động chính: nộp ảnh / hoàn thành / bỏ tích */
const swipeAction = computed(() =>
  done.value
    ? { label: "Bỏ tích", icon: "i-lucide-undo-2", class: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300" }
    : props.task.requiresProof
      ? { label: "Nộp ảnh", icon: "i-lucide-camera", class: "bg-green-600 text-white" }
      : { label: "Hoàn thành", icon: "i-lucide-circle-check", class: "bg-green-600 text-white" }
);
const onSwipe = () => primaryAction();
</script>

<template>
  <SwipeableRow :left="swipeAction" :right="swipeAction" :disabled="!actionable" @swipe-left="onSwipe" @swipe-right="onSwipe">
  <div
    :class="[
      'flex items-start gap-3 rounded-xl border bg-white dark:bg-gray-900 p-3 shadow-sm transition',
      done ? 'border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/40' : overdue ? 'border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/30' : 'border-gray-200 dark:border-gray-800',
    ]"
  >
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" multiple class="sr-only" tabindex="-1" @change="onCameraPick" />
    <button
      type="button"
      :disabled="!actionable"
      :aria-label="done ? 'Bỏ tích' : overdue ? 'Đã quá hạn' : 'Hoàn thành'"
      class="mt-0.5 shrink-0 rounded-full disabled:opacity-50"
      @click="primaryAction"
    >
      <UIcon
        :name="done ? 'i-lucide-circle-check' : overdue ? 'i-lucide-circle-x' : task.requiresProof ? 'i-lucide-camera' : 'i-lucide-circle'"
        :class="['h-7 w-7', done ? 'text-green-600' : overdue ? 'text-red-500' : 'text-gray-400']"
      />
    </button>

    <div class="min-w-0 flex-1">
      <p :class="['font-semibold leading-tight', done && 'text-gray-500 dark:text-gray-400 line-through']">
        {{ task.title }}
      </p>
      <p v-if="task.note" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{{ task.note }}</p>

      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        <UBadge v-if="overdue" color="error" variant="solid" size="sm" icon="i-lucide-alarm-clock-off">
          Quá hạn {{ task.deadlineTime }}
        </UBadge>
        <UBadge v-else-if="task.deadlineTime" color="error" variant="subtle" size="sm" icon="i-lucide-alarm-clock">
          Hạn {{ task.deadlineTime }}
        </UBadge>
        <UBadge v-if="task.reminderTime" color="warning" variant="subtle" size="sm" icon="i-lucide-bell">
          {{ task.reminderTime }}
        </UBadge>
        <UBadge v-if="task.requiresProof" color="neutral" variant="subtle" size="sm" icon="i-lucide-camera">
          Cần ảnh
        </UBadge>
        <UBadge v-if="queued && !done" color="warning" variant="subtle" size="sm" icon="i-lucide-cloud-upload">
          Chờ tải ảnh
        </UBadge>
        <UBadge v-if="done && tickedBy" color="info" variant="subtle" size="sm" icon="i-lucide-user">
          {{ tickedBy }} tích
        </UBadge>
        <span v-if="!canAct && !done" class="text-xs text-gray-400">Chỉ chủ sở hữu tích được</span>
      </div>

      <div v-if="completion?.proofs.length" class="mt-2 flex flex-wrap gap-1.5">
        <a
          v-for="proof in completion.proofs"
          :key="proof.publicId"
          :href="proofViewUrl(proof)"
          target="_blank"
          rel="noopener"
          class="relative block h-14 w-14 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
          :title="`Chụp lúc ${formatTime(proof.takenAt)}`"
        >
          <img :src="thumbnailUrl(proof.url, 112)" alt="Ảnh chứng minh" class="h-full w-full object-cover" loading="lazy" />
          <span class="absolute inset-x-0 bottom-0 bg-black/50 text-center text-[9px] leading-3 text-white">{{ formatTime(proof.takenAt) }}</span>
        </a>
      </div>
    </div>
  </div>
  </SwipeableRow>
</template>
