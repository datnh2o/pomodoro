<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import type { MainTask } from "#shared/utils/models";
import type { MainTaskInput } from "~/composables/useTasks";
import { ALL_WEEKDAYS, WEEKDAY_GROUPS, WEEKDAY_LABELS, formatWeekdays } from "#shared/utils/dates";

const props = defineProps<{ task: MainTask | null }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ save: [input: MainTaskInput] }>();

interface FormState {
  title: string;
  note: string;
  weekdays: number[];
  reminderTime: string;
  deadlineTime: string;
}

const blank = (): FormState => ({
  title: "",
  note: "",
  weekdays: [...ALL_WEEKDAYS],
  reminderTime: "",
  deadlineTime: "",
});

const state = reactive<FormState>(blank());
const saving = ref(false);

watch(open, (value) => {
  if (!value) return;
  const t = props.task;
  Object.assign(state, t
    ? { title: t.title, note: t.note, weekdays: [...t.weekdays], reminderTime: t.reminderTime ?? "", deadlineTime: t.deadlineTime ?? "" }
    : blank());
});

const toggleWeekday = (day: number) => {
  state.weekdays = state.weekdays.includes(day)
    ? state.weekdays.filter((d) => d !== day)
    : [...state.weekdays, day];
};

/** Bấm tên nhóm (Ngày thường / Cuối tuần): chọn cả nhóm, đã chọn đủ thì bỏ cả nhóm */
const isGroupSelected = (days: readonly number[]) => days.every((d) => state.weekdays.includes(d));
const toggleGroup = (days: readonly number[]) => {
  state.weekdays = isGroupSelected(days)
    ? state.weekdays.filter((d) => !days.includes(d))
    : [...new Set([...state.weekdays, ...days])];
};

const scheduleChanged = computed(() => {
  const t = props.task;
  if (!t) return false;
  const same = t.weekdays.length === state.weekdays.length && t.weekdays.every((d) => state.weekdays.includes(d));
  return !same || (t.deadlineTime ?? "") !== state.deadlineTime;
});

const validate = (data: FormState): FormError[] => {
  const errors: FormError[] = [];
  if (!data.title.trim()) errors.push({ name: "title", message: "Nhập tên nhiệm vụ" });
  if (data.weekdays.length === 0) errors.push({ name: "weekdays", message: "Chọn ít nhất một ngày" });
  return errors;
};

const onSubmit = async (event: FormSubmitEvent<FormState>) => {
  saving.value = true;
  try {
    emit("save", {
      title: event.data.title.trim(),
      note: event.data.note.trim(),
      weekdays: [...event.data.weekdays].sort((a, b) => a - b),
      reminderTime: event.data.reminderTime || null,
      deadlineTime: event.data.deadlineTime || null,
    });
    open.value = false;
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <UModal v-model:open="open" :title="task ? 'Sửa nhiệm vụ chính' : 'Thêm nhiệm vụ chính'">
    <template #body>
      <UForm id="main-task-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField name="title" label="Tên nhiệm vụ" required>
          <UInput v-model="state.title" size="lg" placeholder="Ví dụ: Tập gym" maxlength="120" autofocus class="w-full" />
        </UFormField>

        <UFormField name="note" label="Ghi chú">
          <UTextarea v-model="state.note" :rows="2" placeholder="Tùy chọn" maxlength="300" class="w-full" />
        </UFormField>

        <UFormField name="weekdays" label="Lặp lại vào" :hint="formatWeekdays(state.weekdays)">
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            <div v-for="group in WEEKDAY_GROUPS" :key="group.label" class="flex flex-col items-start gap-1">
              <UButton
                type="button"
                size="xs"
                :color="isGroupSelected(group.days) ? 'primary' : 'neutral'"
                :variant="isGroupSelected(group.days) ? 'soft' : 'ghost'"
                :aria-pressed="isGroupSelected(group.days)"
                @click="toggleGroup(group.days)"
              >
                {{ group.label }}
              </UButton>
              <div class="flex gap-1.5">
                <UButton
                  v-for="day in group.days"
                  :key="day"
                  type="button"
                  size="sm"
                  :color="state.weekdays.includes(day) ? 'primary' : 'neutral'"
                  :variant="state.weekdays.includes(day) ? 'solid' : 'outline'"
                  class="w-11 justify-center"
                  :aria-pressed="state.weekdays.includes(day)"
                  @click="toggleWeekday(day)"
                >
                  {{ WEEKDAY_LABELS[day] }}
                </UButton>
              </div>
            </div>
          </div>
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField name="reminderTime" label="Giờ nhắc" description="Để trống nếu không nhắc">
            <UInput v-model="state.reminderTime" type="time" class="w-full" />
          </UFormField>
          <UFormField name="deadlineTime" label="Hạn trong ngày" description="Quá giờ là không tích được">
            <UInput v-model="state.deadlineTime" type="time" class="w-full" />
          </UFormField>
        </div>

        <UAlert
          v-if="scheduleChanged"
          color="info"
          variant="subtle"
          icon="i-lucide-calendar-clock"
          title="Có hiệu lực từ ngày mai"
          description="Đổi lịch hay hạn giờ không áp dụng cho hôm nay, để tránh sửa cho khỏi bị phạt."
        />
      </UForm>
    </template>

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="close">Hủy</UButton>
        <UButton type="submit" form="main-task-form" :loading="saving">Lưu</UButton>
      </div>
    </template>
  </UModal>
</template>
