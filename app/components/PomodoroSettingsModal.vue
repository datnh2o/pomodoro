<script setup lang="ts">
import { DEFAULT_POMODORO_SETTINGS, type PomodoroSettings } from "~/composables/usePomodoro";

const open = defineModel<boolean>("open", { default: false });
const { settings, updateSettings, resetCycle } = usePomodoro();

const form = reactive<Record<keyof PomodoroSettings, string>>({ focus: "", short: "", long: "", longBreakAfter: "" });
watch(open, (value) => {
  if (!value) return;
  form.focus = String(settings.value.focus);
  form.short = String(settings.value.short);
  form.long = String(settings.value.long);
  form.longBreakAfter = String(settings.value.longBreakAfter);
});

/** Tổng phút một vòng theo số đang nhập, để tinh chỉnh cho tròn giờ */
const previewTotal = computed(() => {
  const f = Number(form.focus) || 0, s = Number(form.short) || 0, l = Number(form.long) || 0, n = Number(form.longBreakAfter) || 0;
  return (n + 1) * f + n * s + l;
});
const sequence = computed(() => {
  const n = Number(form.longBreakAfter) || 0;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push("Tập trung", "Nghỉ ngắn");
  parts.push("Tập trung", "Nghỉ dài");
  return parts.join(" → ");
});

const save = () => {
  updateSettings({
    focus: Number(form.focus),
    short: Number(form.short),
    long: Number(form.long),
    longBreakAfter: Number(form.longBreakAfter),
  });
  open.value = false;
};
const useDefaults = () => {
  form.focus = String(DEFAULT_POMODORO_SETTINGS.focus);
  form.short = String(DEFAULT_POMODORO_SETTINGS.short);
  form.long = String(DEFAULT_POMODORO_SETTINGS.long);
  form.longBreakAfter = String(DEFAULT_POMODORO_SETTINGS.longBreakAfter);
};
const onResetCycle = () => {
  resetCycle();
  open.value = false;
};
</script>

<template>
  <UModal v-model:open="open" title="Cài đặt vòng Pomodoro" description="Lưu trên máy này. Hết giờ tự chuyển theo vòng.">
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Tập trung" description="phút">
            <UInput v-model="form.focus" type="number" inputmode="numeric" min="1" max="180" class="w-full" />
          </UFormField>
          <UFormField label="Nghỉ ngắn" description="phút">
            <UInput v-model="form.short" type="number" inputmode="numeric" min="1" max="60" class="w-full" />
          </UFormField>
          <UFormField label="Nghỉ dài" description="phút">
            <UInput v-model="form.long" type="number" inputmode="numeric" min="1" max="120" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Nghỉ dài sau bao nhiêu lần nghỉ ngắn" description="Sau đó bắt đầu vòng mới">
          <UInput v-model="form.longBreakAfter" type="number" inputmode="numeric" min="1" max="10" class="w-28" />
        </UFormField>
        <div class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
          <p class="text-gray-600 dark:text-gray-300">{{ sequence }}</p>
          <p class="mt-1 font-semibold">Một vòng: {{ previewTotal }} phút</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-rotate-ccw" @click="useDefaults">Mặc định 25/5/15</UButton>
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-refresh-cw" @click="onResetCycle">Bắt đầu lại vòng</UButton>
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="close">Hủy</UButton>
        <UButton @click="save">Lưu</UButton>
      </div>
    </template>
  </UModal>
</template>
