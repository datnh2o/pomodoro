<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "#ui/types";
import type { Task, TaskDraft } from "~/composables/useTasks";

const props = defineProps<{
  /** Task đang sửa; bỏ trống khi tạo mới */
  task?: Task;
}>();

const emit = defineEmits<{
  submit: [draft: TaskDraft];
  cancel: [];
}>();

interface FormState {
  title: string;
  pomos: number | string;
  note: string;
}

const state = reactive<FormState>({
  title: props.task?.title ?? "",
  pomos: props.task?.pomos ?? 1,
  note: props.task?.note ?? "",
});

const validate = (data: FormState): FormError[] => {
  const errors: FormError[] = [];
  if (!data.title.trim()) {
    errors.push({ path: "title", message: "Title is required" });
  }
  const pomos = Number(data.pomos);
  if (!Number.isInteger(pomos) || pomos < 1 || pomos > 10) {
    errors.push({ path: "pomos", message: "Enter a whole number from 1 to 10" });
  }
  return errors;
};

const onSubmit = (event: FormSubmitEvent<FormState>) => {
  emit("submit", {
    title: event.data.title.trim(),
    pomos: Number(event.data.pomos),
    note: event.data.note.trim() || null,
  });
};
</script>

<template>
  <UForm
    :state="state"
    :validate="validate"
    class="rounded-lg bg-white p-4 text-gray-900 shadow-sm"
    @submit="onSubmit"
  >
    <div class="flex flex-col gap-3">
      <UFormGroup name="title">
        <UInput
          v-model="state.title"
          size="lg"
          placeholder="What are you working on?"
          maxlength="255"
          autofocus
        />
      </UFormGroup>

      <UFormGroup name="pomos" label="Est Pomodoros" class="w-36">
        <UInput v-model="state.pomos" type="number" min="1" max="10" />
      </UFormGroup>

      <UFormGroup name="note">
        <UTextarea v-model="state.note" :rows="2" placeholder="Some notes..." maxlength="255" />
      </UFormGroup>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <UButton type="button" color="gray" variant="ghost" @click="emit('cancel')">
        Cancel
      </UButton>
      <UButton type="submit" color="black">Save</UButton>
    </div>
  </UForm>
</template>
