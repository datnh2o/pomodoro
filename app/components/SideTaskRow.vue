<script setup lang="ts">
import type { SideTask } from "#shared/utils/models";
import { formatShortVi } from "#shared/utils/dates";

const props = defineProps<{
  task: SideTask;
  today: string;
  canAct: boolean;
  canEdit: boolean;
}>();

const emit = defineEmits<{ complete: []; edit: []; delete: []; proofFiles: [files: File[]] }>();

const { thumbnailUrl, proofViewUrl } = useProofUpload();

// Việc cần ảnh: mở camera ngay trong cử chỉ bấm
const cameraInput = ref<HTMLInputElement | null>(null);
// Đã xong là chốt, không bỏ tích
const onCompleteClick = () => {
  if (!props.canAct || done.value) return;
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
  if (files.length) emit("proofFiles", files);
  else emit("complete");
};
const done = computed(() => props.task.doneDate !== null);
const carriedOver = computed(() => !done.value && props.task.createdDate < props.today);

const editAction = { label: "Sửa", icon: "i-lucide-pencil", class: "bg-sky-600 text-white" };
const deleteAction = { label: "Xóa", icon: "i-lucide-trash-2", class: "bg-red-600 text-white" };

const menu = computed(() => [
  [
    { label: "Sửa", icon: "i-lucide-pencil", onSelect: () => emit("edit") },
    { label: "Xóa", icon: "i-lucide-trash-2", color: "error" as const, onSelect: () => emit("delete") },
  ],
]);
</script>

<template>
  <SwipeableRow
    :left="canEdit ? editAction : undefined"
    :right="canEdit ? deleteAction : undefined"
    @swipe-right="emit('edit')"
    @swipe-left="emit('delete')"
  >
  <div :class="['flex items-start gap-3 rounded-xl border bg-white dark:bg-gray-900 p-3 shadow-sm', done ? 'border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/40' : 'border-gray-200 dark:border-gray-800']">
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" multiple class="sr-only" tabindex="-1" @change="onCameraPick" />
    <button
      type="button"
      :disabled="!canAct || done"
      :aria-label="done ? 'Đã hoàn thành' : 'Hoàn thành'"
      class="mt-0.5 shrink-0 rounded-full disabled:opacity-50"
      @click="onCompleteClick"
    >
      <UIcon
        :name="done ? 'i-lucide-circle-check' : task.requiresProof ? 'i-lucide-camera' : 'i-lucide-circle'"
        :class="['h-6 w-6', done ? 'text-green-600' : 'text-gray-400']"
      />
    </button>

    <div class="min-w-0 flex-1">
      <p :class="['leading-tight', done && 'text-gray-500 dark:text-gray-400 line-through']">{{ task.title }}</p>
      <p v-if="task.note" class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{{ task.note }}</p>
      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        <UBadge v-if="task.reminderTime" color="warning" variant="subtle" size="sm" icon="i-lucide-bell">{{ task.reminderTime }}</UBadge>
        <UBadge v-if="task.requiresProof" color="neutral" variant="subtle" size="sm" icon="i-lucide-camera">Cần ảnh</UBadge>
        <span v-if="carriedOver" class="text-xs text-amber-600 dark:text-amber-400">Dồn từ {{ formatShortVi(task.createdDate) }}</span>
      </div>
      <div v-if="done && task.proofs?.length" class="mt-2 flex flex-wrap gap-1.5">
        <a v-for="proof in task.proofs" :key="proof.publicId" :href="proofViewUrl(proof)" target="_blank" rel="noopener" class="block h-14 w-14 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <img :src="thumbnailUrl(proof.url, 112)" alt="Ảnh chứng minh" class="h-full w-full object-cover" loading="lazy" />
        </a>
      </div>
    </div>

    <UDropdownMenu v-if="canEdit" :items="menu" :content="{ align: 'end' }">
      <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical" aria-label="Tùy chọn nhiệm vụ phụ" />
    </UDropdownMenu>
  </div>
  </SwipeableRow>
</template>
