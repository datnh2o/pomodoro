<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import type { SubAccountInput } from "~/composables/useMembers";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ save: [input: SubAccountInput] }>();

const blank = (): SubAccountInput => ({ displayName: "", email: "", password: "", add: true, edit: false });
const state = reactive<SubAccountInput>(blank());
const saving = ref(false);

watch(open, (value) => {
  if (value) Object.assign(state, blank());
});

const validate = (data: SubAccountInput): FormError[] => {
  const errors: FormError[] = [];
  if (!data.displayName.trim()) errors.push({ name: "displayName", message: "Nhập tên" });
  if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) errors.push({ name: "email", message: "Email không hợp lệ" });
  if (data.password.length < 6) errors.push({ name: "password", message: "Mật khẩu ít nhất 6 ký tự" });
  return errors;
};

const onSubmit = async (event: FormSubmitEvent<SubAccountInput>) => {
  saving.value = true;
  try {
    emit("save", { ...event.data });
    open.value = false;
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <UModal v-model:open="open" title="Thêm tài khoản con" description="Tài khoản này đăng nhập bằng email + mật khẩu và dùng chung bảng nhiệm vụ của bạn.">
    <template #body>
      <UForm id="sub-account-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField name="displayName" label="Tên hiển thị" required>
          <UInput v-model="state.displayName" size="lg" class="w-full" autofocus />
        </UFormField>
        <UFormField name="email" label="Email đăng nhập" required>
          <UInput v-model="state.email" type="email" size="lg" class="w-full" autocomplete="off" />
        </UFormField>
        <UFormField name="password" label="Mật khẩu" required description="Người dùng có thể đổi sau bằng Quên mật khẩu.">
          <PasswordInput v-model="state.password" autocomplete="new-password" />
        </UFormField>
        <div class="flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
          <p class="text-sm font-medium">Quyền</p>
          <USwitch :model-value="true" disabled label="Xem (luôn có)" />
          <USwitch v-model="state.add" label="Thêm: tạo nhiệm vụ phụ, tích hoàn thành, tải ảnh" />
          <USwitch v-model="state.edit" label="Sửa: thêm/sửa/ngừng nhiệm vụ chính" />
        </div>
      </UForm>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="close">Hủy</UButton>
        <UButton type="submit" form="sub-account-form" :loading="saving">Tạo tài khoản</UButton>
      </div>
    </template>
  </UModal>
</template>
