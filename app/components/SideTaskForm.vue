<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import type { SideTask } from "#shared/utils/models";
import type { SideTaskInput } from "~/composables/useTasks";

const props = defineProps<{
  /** Nhiệm vụ phụ đang sửa; bỏ trống khi tạo mới */
  task?: SideTask | null;
  /** Tiêu đề điền sẵn khi mở từ ô thêm nhanh */
  initialTitle?: string;
}>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ save: [input: Required<SideTaskInput>] }>();

interface FormState {
  title: string;
  note: string;
  reminderTime: string;
}

const state = reactive<FormState>({ title: "", note: "", reminderTime: "" });
const saving = ref(false);

watch(open, (value) => {
  if (!value) return;
  const t = props.task;
  Object.assign(state, t
    ? { title: t.title, note: t.note, reminderTime: t.reminderTime ?? "" }
    : { title: props.initialTitle ?? "", note: "", reminderTime: "" });
});

const validate = (data: FormState): FormError[] =>
  data.title.trim() ? [] : [{ name: "title", message: "Nhập tên nhiệm vụ" }];

const onSubmit = async (event: FormSubmitEvent<FormState>) => {
  saving.value = true;
  try {
    emit("save", {
      title: event.data.title.trim(),
      note: event.data.note.trim(),
      reminderTime: event.data.reminderTime || null,
    });
    open.value = false;
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <UModal v-model:open="open" :title="task ? 'Sửa nhiệm vụ phụ' : 'Thêm nhiệm vụ phụ'" description="Không tính vào tiền phạt. Chưa xong thì tự hiện lại ngày hôm sau.">
    <template #body>
      <UForm id="side-task-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField name="title" label="Tên nhiệm vụ" required>
          <UInput v-model="state.title" size="lg" maxlength="200" autofocus class="w-full" />
        </UFormField>
        <UFormField name="note" label="Ghi chú">
          <UTextarea v-model="state.note" :rows="2" placeholder="Tùy chọn" maxlength="300" class="w-full" />
        </UFormField>
        <UFormField name="reminderTime" label="Giờ nhắc" description="Nhắc mỗi ngày vào giờ này cho tới khi xong">
          <UInput v-model="state.reminderTime" type="time" class="w-36" />
        </UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="close">Hủy</UButton>
        <UButton type="submit" form="side-task-form" :loading="saving">Lưu</UButton>
      </div>
    </template>
  </UModal>
</template>
