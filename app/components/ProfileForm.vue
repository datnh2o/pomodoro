<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "@nuxt/ui";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [] }>();

const { user, usesPassword, updateDisplayName, updatePhotoURL, changeEmail, refreshUser } = useAuth();
const { updateOwnMemberInfo } = useWorkspace();
const { upload, isConfigured, thumbnailUrl } = useProofUpload();
const { showError } = useErrorToast();
const toast = useToast();

interface FormState {
  displayName: string;
  email: string;
  currentPassword: string;
}

const state = reactive<FormState>({ displayName: "", email: "", currentPassword: "" });
const avatarFile = ref<File | null>(null);
const avatarPreview = ref<string | null>(null);
const saving = ref(false);
const needsPassword = ref(false);

watch(open, (value) => {
  if (!value) return;
  state.displayName = user.value?.displayName ?? "";
  state.email = user.value?.email ?? "";
  state.currentPassword = "";
  avatarFile.value = null;
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value);
  avatarPreview.value = null;
  needsPassword.value = usesPassword();
});

const emailChanged = computed(() => state.email.trim().toLowerCase() !== (user.value?.email ?? "").toLowerCase());

const onPickAvatar = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  (event.target as HTMLInputElement).value = "";
  if (!file) return;
  avatarFile.value = file;
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value);
  avatarPreview.value = URL.createObjectURL(file);
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
    if (avatarFile.value) {
      if (!isConfigured.value) throw new Error("Chưa cấu hình Cloudinary để lưu ảnh đại diện.");
      const proof = await upload(avatarFile.value, `avatars/${uid}`);
      await updatePhotoURL(thumbnailUrl(proof.url, 256));
    }
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
  <UModal v-model:open="open" title="Cập nhật hồ sơ">
    <template #body>
      <UForm id="profile-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="onSubmit">
        <div class="flex items-center gap-4">
          <UAvatar
            :src="avatarPreview ?? user?.photoURL ?? undefined"
            :alt="state.displayName || 'Ảnh đại diện'"
            size="3xl"
            referrerpolicy="no-referrer"
          />
          <label class="cursor-pointer">
            <span class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <UIcon name="i-lucide-image-up" class="h-4 w-4" />
              Đổi ảnh
            </span>
            <input type="file" accept="image/*" class="sr-only" @change="onPickAvatar" />
          </label>
        </div>

        <UFormField name="displayName" label="Tên hiển thị" required>
          <UInput v-model="state.displayName" size="lg" maxlength="80" class="w-full" />
        </UFormField>

        <UFormField name="email" label="Email" required :description="emailChanged ? 'Email mới cần xác minh qua link gửi tới địa chỉ đó.' : undefined">
          <UInput v-model="state.email" type="email" size="lg" autocomplete="email" class="w-full" />
        </UFormField>

        <UFormField v-if="emailChanged && needsPassword" name="currentPassword" label="Mật khẩu hiện tại" description="Firebase yêu cầu xác nhận khi đổi email.">
          <PasswordInput v-model="state.currentPassword" autocomplete="current-password" />
        </UFormField>
        <p v-else-if="emailChanged" class="text-xs text-gray-500 dark:text-gray-400">
          Tài khoản Google: có thể hiện cửa sổ đăng nhập lại để xác nhận.
        </p>
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
