<script setup lang="ts">
import type { MainTask, Proof } from "#shared/utils/models";

const props = defineProps<{ task: MainTask | null; folder: string }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ confirm: [proofs: Proof[]] }>();

const { isConfigured, upload, thumbnailUrl } = useProofUpload();
const { showError } = useErrorToast();

interface PendingFile {
  id: number;
  name: string;
  preview: string;
  status: "uploading" | "done" | "error";
  proof?: Proof;
  error?: string;
}

const files = ref<PendingFile[]>([]);
const confirming = ref(false);
let nextId = 0;

const uploadedProofs = computed(() =>
  files.value.filter((f) => f.status === "done" && f.proof).map((f) => f.proof as Proof)
);
const uploading = computed(() => files.value.some((f) => f.status === "uploading"));
const canConfirm = computed(() => uploadedProofs.value.length > 0 && !uploading.value && !confirming.value);

const reset = () => {
  files.value.forEach((f) => URL.revokeObjectURL(f.preview));
  files.value = [];
};

watch(open, (value) => {
  if (!value) reset();
});

const onPick = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  input.value = "";
  for (const file of picked) {
    const entry: PendingFile = {
      id: nextId++,
      name: file.name,
      preview: URL.createObjectURL(file),
      status: "uploading",
    };
    files.value.push(entry);
    try {
      const proof = await upload(file, props.folder);
      const current = files.value.find((f) => f.id === entry.id);
      if (current) {
        current.proof = proof;
        current.status = "done";
      }
    } catch (error) {
      const current = files.value.find((f) => f.id === entry.id);
      if (current) {
        current.status = "error";
        current.error = (error as Error).message;
      }
      showError("Tải ảnh thất bại", error);
    }
  }
};

const remove = (id: number) => {
  const entry = files.value.find((f) => f.id === id);
  if (entry) URL.revokeObjectURL(entry.preview);
  files.value = files.value.filter((f) => f.id !== id);
};

const confirm = async () => {
  if (!canConfirm.value) return;
  confirming.value = true;
  try {
    emit("confirm", uploadedProofs.value);
    open.value = false;
  } finally {
    confirming.value = false;
  }
};
</script>

<template>
  <UModal
    v-model:open="open"
    :title="task?.title ?? 'Ảnh chứng minh'"
    description="Chụp hoặc chọn ít nhất một ảnh để hoàn thành nhiệm vụ."
  >
    <template #body>
      <UAlert
        v-if="!isConfigured"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Chưa cấu hình nơi lưu ảnh"
        description="Điền NUXT_PUBLIC_CLOUDINARY_CLOUD_NAME và NUXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET trong .env rồi khởi động lại."
        class="mb-4"
      />

      <div class="flex flex-col gap-3">
        <label
          class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-6 text-gray-600 hover:bg-gray-50"
        >
          <UIcon name="i-lucide-camera" class="h-8 w-8" />
          <span class="text-sm font-medium">Chụp ảnh hoặc chọn từ thư viện</span>
          <input type="file" accept="image/*" capture="environment" multiple class="sr-only" @change="onPick" />
        </label>

        <ul v-if="files.length" class="grid grid-cols-3 gap-2">
          <li v-for="file in files" :key="file.id" class="relative aspect-square overflow-hidden rounded-lg border border-gray-200">
            <img
              :src="file.status === 'done' && file.proof ? thumbnailUrl(file.proof.url, 240) : file.preview"
              :alt="file.name"
              class="h-full w-full object-cover"
            />
            <div
              v-if="file.status !== 'done'"
              :class="['absolute inset-0 flex items-center justify-center text-white', file.status === 'error' ? 'bg-red-600/70' : 'bg-black/40']"
            >
              <UIcon :name="file.status === 'error' ? 'i-lucide-x' : 'i-lucide-loader-circle'" :class="['h-6 w-6', file.status === 'uploading' && 'animate-spin']" />
            </div>
            <button
              type="button"
              class="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
              aria-label="Bỏ ảnh"
              @click="remove(file.id)"
            >
              <UIcon name="i-lucide-x" class="h-3.5 w-3.5" />
            </button>
          </li>
        </ul>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="close">Hủy</UButton>
        <UButton color="success" icon="i-lucide-circle-check" :loading="uploading || confirming" :disabled="!canConfirm" @click="confirm">
          Hoàn thành ({{ uploadedProofs.length }} ảnh)
        </UButton>
      </div>
    </template>
  </UModal>
</template>
