<script setup lang="ts">
import type { SideTask } from "#shared/utils/models";
import { formatShortVi } from "#shared/utils/dates";

const props = defineProps<{
  task: SideTask;
  today: string;
  canAct: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{ toggle: [done: boolean]; delete: [] }>();

const done = computed(() => props.task.doneDate !== null);
const carriedOver = computed(() => !done.value && props.task.createdDate < props.today);
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
    <UCheckbox
      :model-value="done"
      :disabled="!canAct"
      size="lg"
      :aria-label="`Đánh dấu ${task.title}`"
      @update:model-value="(value) => emit('toggle', value === true)"
    />
    <div class="min-w-0 flex-1">
      <p :class="['leading-tight', done && 'text-gray-500 line-through']">{{ task.title }}</p>
      <p v-if="carriedOver" class="mt-0.5 text-xs text-amber-600">
        Dồn từ {{ formatShortVi(task.createdDate) }}
      </p>
    </div>
    <UButton
      v-if="canDelete"
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-trash-2"
      aria-label="Xóa nhiệm vụ phụ"
      @click="emit('delete')"
    />
  </div>
</template>
