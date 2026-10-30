<script setup lang="ts">
const emit = defineEmits<{ add: [title: string]; options: [title: string] }>();

const { showError } = useErrorToast();
const toast = useToast();
const { supported, listening, interim, listenOnce, stop } = useSpeech();

const title = ref("");
const submitting = ref(false);

const submit = async () => {
  const text = title.value.trim();
  if (!text || submitting.value) return;
  submitting.value = true;
  try {
    emit("add", text);
    title.value = "";
  } finally {
    submitting.value = false;
  }
};

/** Mở form đầy đủ (ảnh, giờ nhắc, ghi chú) với tiêu đề đã gõ */
const openOptions = () => {
  emit("options", title.value.trim());
  title.value = "";
};

const dictate = async () => {
  if (listening.value) {
    stop();
    return;
  }
  const before = title.value;
  baseTitle.value = before;
  try {
    const text = await listenOnce();
    if (text) {
      title.value = before ? `${before} ${text}` : text;
    } else {
      title.value = before;
      toast.add({
        title: "Không nghe thấy gì",
        description: "Bấm mic rồi nói ngay, nói to rõ gần micro. Thử lại nhé.",
        color: "warning",
        icon: "i-lucide-mic-off",
      });
    }
  } catch (error) {
    title.value = before;
    showError("Không nhận được giọng nói", error);
  }
};

// Hiện lời đang nói ngay trong ô nhập, nối sau phần đã gõ trước đó
const baseTitle = ref("");
watch(interim, (text) => {
  if (listening.value && text) title.value = baseTitle.value ? `${baseTitle.value} ${text}` : text;
});
</script>

<template>
  <form class="flex items-center gap-2" @submit.prevent="submit">
    <UInput
      v-model="title"
      class="flex-1"
      size="lg"
      :placeholder="listening ? 'Đang nghe…' : 'Thêm việc phụ'"
      maxlength="200"
    />
    <UButton
      v-if="supported"
      type="button"
      :color="listening ? 'error' : 'neutral'"
      :variant="listening ? 'solid' : 'outline'"
      size="lg"
      :icon="listening ? 'i-lucide-mic-off' : 'i-lucide-mic'"
      :aria-label="listening ? 'Dừng nghe' : 'Nói để thêm'"
      @click="dictate"
    />
    <UButton
      type="button"
      color="neutral"
      variant="outline"
      size="lg"
      icon="i-lucide-sliders-horizontal"
      aria-label="Tùy chọn"
      title="Tùy chọn"
      @click="openOptions"
    />
    <UButton type="submit" size="lg" icon="i-lucide-plus" :disabled="!title.trim()" aria-label="Thêm" />
  </form>
</template>
