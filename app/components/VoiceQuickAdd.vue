<script setup lang="ts">
import type { SideTaskInput } from "~/composables/useTasks";

/**
 * Nút nổi cố định: bấm là nghe giọng nói và thêm ngay một nhiệm vụ phụ, có Hoàn tác.
 * Trình duyệt không hỗ trợ giọng nói thì mở form gõ tay.
 */
const { supported, listening, interim, listenOnce, stop } = useSpeech();
const { can } = useWorkspace();
const { createSideTask, deleteTaskById } = useTasks();
const { showError } = useErrorToast();
const toast = useToast();

const open = ref(false);
const busy = ref(false);
const formOpen = ref(false);

const addTitle = async (title: string) => {
  const id = await createSideTask({ title });
  toast.add({
    title: "Đã thêm nhiệm vụ phụ",
    description: title,
    color: "success",
    icon: "i-lucide-mic",
    duration: 8000,
    actions: [
      {
        label: "Hoàn tác",
        color: "neutral",
        variant: "outline",
        onClick: async () => {
          try {
            await deleteTaskById(id);
          } catch (error) {
            showError("Không hoàn tác được", error);
          }
        },
      },
    ],
  });
};

const start = async () => {
  if (!can("add")) return;
  if (!supported.value) {
    formOpen.value = true;
    return;
  }
  if (listening.value) {
    stop();
    return;
  }
  open.value = true;
  try {
    const text = await listenOnce();
    if (!text) {
      toast.add({ title: "Không nghe thấy gì", description: "Bấm mic rồi nói ngay.", color: "warning", icon: "i-lucide-mic-off" });
      return;
    }
    busy.value = true;
    await addTitle(text);
  } catch (error) {
    showError("Không thêm được", error);
  } finally {
    busy.value = false;
    open.value = false;
  }
};

const onFormSave = async (input: Required<SideTaskInput>) => {
  try {
    await createSideTask(input);
    toast.add({ title: "Đã thêm nhiệm vụ phụ", description: input.title, color: "success" });
  } catch (error) {
    showError("Không thêm được", error);
  }
};
</script>

<template>
  <div v-if="can('add')">
    <!-- Nút nổi, nằm trên thanh tab -->
    <button
      type="button"
      class="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition active:scale-95"
      style="bottom: calc(4.75rem + env(safe-area-inset-bottom))"
      :aria-label="supported ? 'Nói để thêm nhiệm vụ phụ' : 'Thêm nhiệm vụ phụ'"
      @click="start"
    >
      <UIcon :name="supported ? 'i-lucide-mic' : 'i-lucide-plus'" class="h-7 w-7" />
    </button>

    <!-- Bảng đang nghe -->
    <Transition enter-active-class="transition" enter-from-class="translate-y-4 opacity-0" leave-active-class="transition" leave-to-class="translate-y-4 opacity-0">
      <div
        v-if="open"
        class="fixed inset-x-4 z-30 mx-auto max-w-xl rounded-2xl bg-gray-900 p-4 text-white shadow-2xl"
        style="bottom: calc(9.25rem + env(safe-area-inset-bottom))"
        role="status"
        aria-live="polite"
      >
        <div class="flex items-center gap-3">
          <span class="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <span v-if="listening" class="absolute inset-0 animate-ping rounded-full bg-red-500/60" />
            <span class="relative flex h-10 w-10 items-center justify-center rounded-full bg-red-500">
              <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-mic'" :class="['h-5 w-5', busy && 'animate-spin']" />
            </span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-gray-300">{{ busy ? "Đang lưu..." : "Đang nghe, nói tên việc cần làm" }}</p>
            <p class="truncate font-medium">{{ interim || "…" }}</p>
          </div>
          <UButton color="neutral" variant="ghost" size="sm" class="text-white" @click="stop">Xong</UButton>
        </div>
      </div>
    </Transition>

    <SideTaskForm v-model:open="formOpen" @save="onFormSave" />
  </div>
</template>
