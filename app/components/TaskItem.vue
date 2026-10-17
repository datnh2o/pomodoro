<script setup lang="ts">
import type { Task, TaskDraft, TaskPatch } from "~/composables/useTasks";

const props = defineProps<{ task: Task }>();

const emit = defineEmits<{
  update: [patch: TaskPatch];
  delete: [];
}>();

const isEditing = ref(false);

const menu = [
  [
    { label: "Edit", icon: "i-heroicons-pencil-square", click: () => (isEditing.value = true) },
    { label: "Delete", icon: "i-heroicons-trash", click: () => emit("delete") },
  ],
];

const onSave = (draft: TaskDraft) => {
  emit("update", draft);
  isEditing.value = false;
};
</script>

<template>
  <TaskForm v-if="isEditing" :task="props.task" @submit="onSave" @cancel="isEditing = false" />

  <div v-else class="flex items-start gap-3 rounded-lg bg-white p-3 text-gray-900 shadow-sm">
    <UCheckbox
      :model-value="task.done"
      class="mt-1"
      :aria-label="`Mark ${task.title} as done`"
      @update:model-value="(value: boolean) => emit('update', { done: value })"
    />

    <div :class="['min-w-0 flex-1', task.done && 'opacity-60']">
      <div class="flex items-center gap-2">
        <p :class="['truncate text-lg font-bold', task.done && 'line-through']">
          {{ task.title }}
        </p>

        <UBadge color="gray" variant="solid" class="ml-auto shrink-0 gap-1">
          {{ task.pomos }} pomos
          <UIcon name="i-heroicons-clock" class="h-3.5 w-3.5" />
        </UBadge>

        <UDropdown :items="menu" :popper="{ placement: 'bottom-end' }">
          <UButton
            color="gray"
            variant="ghost"
            size="xs"
            icon="i-heroicons-ellipsis-vertical"
            aria-label="Task actions"
          />
        </UDropdown>
      </div>

      <p v-if="task.note" class="mt-1 flex items-start gap-1 text-sm text-gray-600">
        <UIcon name="i-heroicons-document-text" class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="whitespace-pre-line">{{ task.note }}</span>
      </p>
    </div>
  </div>
</template>
