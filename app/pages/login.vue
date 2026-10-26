<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import { APP_NAME } from "#shared/utils/app";

definePageMeta({ layout: false });

const { user, ready, signInWithEmail, registerWithEmail, resetPassword, signInWithGoogle } = useAuth();
const { showError } = useErrorToast();
const toast = useToast();

// Đã đăng nhập thì vào thẳng app
watch([ready, user], ([isReady, current]) => {
  if (isReady && current) navigateTo("/");
}, { immediate: true });

const mode = ref<"login" | "register">("login");
const state = reactive({ displayName: "", email: "", password: "" });
const busy = ref(false);

const validate = (data: typeof state): FormError[] => {
  const errors: FormError[] = [];
  if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) errors.push({ name: "email", message: "Email không hợp lệ" });
  if (data.password.length < 6) errors.push({ name: "password", message: "Mật khẩu ít nhất 6 ký tự" });
  if (mode.value === "register" && !data.displayName.trim()) errors.push({ name: "displayName", message: "Nhập tên hiển thị" });
  return errors;
};

const onSubmit = async (event: FormSubmitEvent<typeof state>) => {
  busy.value = true;
  try {
    if (mode.value === "login") {
      await signInWithEmail(event.data.email, event.data.password);
    } else {
      await registerWithEmail(event.data.email, event.data.password, event.data.displayName);
    }
  } catch (error) {
    showError(mode.value === "login" ? "Đăng nhập thất bại" : "Tạo tài khoản thất bại", error);
  } finally {
    busy.value = false;
  }
};

const onGoogle = async () => {
  busy.value = true;
  try {
    await signInWithGoogle();
  } catch (error) {
    showError("Đăng nhập Google thất bại", error);
  } finally {
    busy.value = false;
  }
};

const onForgot = async () => {
  if (!state.email.trim()) {
    toast.add({ title: "Nhập email trước", description: "Điền email rồi bấm quên mật khẩu.", color: "warning" });
    return;
  }
  try {
    await resetPassword(state.email);
    toast.add({ title: "Đã gửi email đặt lại mật khẩu", description: state.email, color: "success" });
  } catch (error) {
    showError("Không gửi được email", error);
  }
};
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-pomodoro p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex items-center gap-2 text-lg font-bold text-primary">
          <IconsTomato :size="24" />
          {{ APP_NAME }}
        </div>
      </template>

      <div class="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1 text-sm font-medium">
        <button
          v-for="item in [{ value: 'login', label: 'Đăng nhập' }, { value: 'register', label: 'Tạo tài khoản' }] as const"
          :key="item.value"
          type="button"
          :class="['rounded-md py-1.5 transition', mode === item.value ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-500 dark:text-gray-400']"
          @click="mode = item.value"
        >
          {{ item.label }}
        </button>
      </div>

      <UForm :state="state" :validate="validate" class="flex flex-col gap-3" @submit="onSubmit">
        <UFormField v-if="mode === 'register'" name="displayName" label="Tên hiển thị">
          <UInput v-model="state.displayName" size="lg" autocomplete="name" class="w-full" />
        </UFormField>
        <UFormField name="email" label="Email">
          <UInput v-model="state.email" type="email" size="lg" autocomplete="email" class="w-full" />
        </UFormField>
        <UFormField name="password" label="Mật khẩu">
          <PasswordInput
            v-model="state.password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          />
        </UFormField>

        <UButton type="submit" size="lg" block :loading="busy">
          {{ mode === "login" ? "Đăng nhập" : "Tạo tài khoản" }}
        </UButton>
      </UForm>

      <div class="mt-3 flex items-center justify-between text-sm">
        <button v-if="mode === 'login'" type="button" class="text-primary hover:underline" @click="onForgot">
          Quên mật khẩu?
        </button>
      </div>

      <USeparator label="hoặc" class="my-4" />

      <UButton color="neutral" variant="outline" size="lg" block :disabled="busy" @click="onGoogle">
        <IconsGoogle class="h-4 w-4" />
        Đăng nhập bằng Google
      </UButton>
    </UCard>
  </div>
</template>
