<script setup lang="ts">
/** Ô mật khẩu có nút con mắt để ẩn/hiện. */
withDefaults(
  defineProps<{
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    autocomplete?: string;
    placeholder?: string;
    id?: string;
  }>(),
  { size: "lg", autocomplete: "current-password", placeholder: "", id: undefined }
);

const model = defineModel<string>({ default: "" });
const visible = ref(false);
</script>

<template>
  <UInput
    :id="id"
    v-model="model"
    :type="visible ? 'text' : 'password'"
    :size="size"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        type="button"
        color="neutral"
        variant="link"
        size="sm"
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
        :aria-pressed="visible"
        tabindex="-1"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
