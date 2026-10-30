<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import { initialOf } from "~/utils/avatar";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [] }>();

const { user, usesPassword, updateDisplayName, updatePhotoURL, changeEmail, refreshUser, googlePhotoURL } = useAuth();
const { updateOwnMemberInfo } = useWorkspace();
const { showError } = useErrorToast();
const toast = useToast();

interface FormState {
  displayName: string;
  email: string;
  currentPassword: string;
}

const state = reactive<FormState>({ displayName: "", email: "", currentPassword: "" });
const saving = ref(false);
const needsPassword = ref(false);

watch(open, (value) => {
  if (!value) return;
  state.displayName = user.value?.displayName ?? "";
  state.email = user.value?.email ?? "";
  state.currentPassword = "";
  needsPassword.value = usesPassword();
});

const emailChanged = computed(() => state.email.trim().toLowerCase() !== (user.value?.email ?? "").toLowerCase());

// Ảnh đại diện lấy từ Google: ghi ngay, không cần bấm Lưu
const usingGoogle = ref(false);
const useGoogleAvatar = async () => {
  usingGoogle.value = true;
  try {
    const url = await googlePhotoURL();
    if (!url) throw new Error("Tài khoản Google này không có ảnh đại diện.");
    await updatePhotoURL(url);
    await refreshUser();
    toast.add({ title: "Đã dùng ảnh Google", color: "success" });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/popup-closed-by-user") return;
    showError("Không lấy được ảnh Google", error);
  } finally {
    usingGoogle.value = false;
  }
};

const validate = (data: FormState): FormError[] => {
  const errors: FormError[] = [];
  if (!data.displayName.trim()) errors.push({ name: "displayName", message: "Nhập tên hiển thị" });
  if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) errors.push({ name: "email", message: "Email không hợp lệ" });
  if (emailChanged.value && needsPassword.value && !data.currentPassword) {
    errors.push({ name: "currentPassword", message: "Nhập mật khẩu hiện tại để đổi email" });
  }
  return errors;
};

const onSubmit = async (event: FormSubmitEvent<FormState>) => {
  const uid = user.value?.uid;
  if (!uid) return;
  saving.value = true;
  try {
    if (event.data.displayName.trim() !== (user.value?.displayName ?? "")) {
      await updateDisplayName(event.data.displayName);
    }
    let emailNote = "";
    if (emailChanged.value) {
      await changeEmail(event.data.email, event.data.currentPassword || undefined);
      emailNote = ` Đã gửi link xác minh tới ${event.data.email.trim()}, email đổi sau khi bạn bấm link.`;
    }
    await refreshUser();
    await updateOwnMemberInfo({ displayName: user.value?.displayName ?? null, email: user.value?.email ?? null });
    toast.add({ title: "Đã cập nhật hồ sơ", description: emailNote || undefined, color: "success", duration: emailNote ? 10_000 : 4000 });
    emit("saved");
    open.value = false;
  } catch (error) {
    showError("Không cập nhật được hồ sơ", error);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <UModal v-model:open="open" title="Hồ sơ">
    <template #body>
      <UForm id="profile-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="onSubmit">
        <div class="flex items-center gap-4">
          <UAvatar
            :src="user?.photoURL ?? undefined"
            :alt="state.displayName || 'Ảnh đại diện'"
            :text="initialOf(state.displayName, user?.email)"
            size="3xl"
            referrerpolicy="no-referrer"
          />
          <UButton color="neutral" variant="outline" size="sm" :loading="usingGoogle" @click="useGoogleAvatar">
            <IconsGoogle class="h-4 w-4" />
            Dùng ảnh Google
          </UButton>
        </div>

        <UFormField name="displayName" label="Tên hiển thị" required>
          <UInput v-model="state.displayName" size="lg" maxlength="80" class="w-full" />
        </UFormField>

        <UFormField name="email" label="Email" required :description="emailChanged ? 'Cần xác minh qua email mới' : undefined">
          <UInput v-model="state.email" type="email" size="lg" autocomplete="email" class="w-full" />
        </UFormField>

        <UFormField v-if="emailChanged && needsPassword" name="currentPassword" label="Mật khẩu hiện tại">
          <PasswordInput v-model="state.currentPassword" autocomplete="current-password" />
        </UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="close">Hủy</UButton>
        <UButton type="submit" form="profile-form" :loading="saving">Lưu</UButton>
      </div>
    </template>
  </UModal>
</template>
