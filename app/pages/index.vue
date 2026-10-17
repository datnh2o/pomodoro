<script setup lang="ts">
import { MODE_LIST, type ModeKey } from "~/utils/modes";
import type { Task, TaskDraft, TaskPatch } from "~/composables/useTasks";

const { key: modeKey, mode, setMode } = useMode();
const { user, ready, isAuthenticated } = useAuth();
const { fetchTasks, createTask, updateTask, deleteTask, clearTasks } = useTasks();
const { showError } = useErrorToast();

// ---- Timer ----
// Chỉ tự chạy khi chuyển tiếp sau lúc hết giờ; bấm tab thủ công thì không tự chạy.
const autoStart = ref(false);

const selectMode = (next: ModeKey, options: { autoStart?: boolean } = {}) => {
  autoStart.value = options.autoStart ?? false;
  setMode(next);
};

const onTimerFinished = () => selectMode(mode.value.next, { autoStart: true });

// ---- Tasks ----
const tasks = ref<Task[]>([]);
const loading = ref(false);
const isCreating = ref(false);

const doneCount = computed(() => tasks.value.filter((task) => task.done).length);
const progress = computed(() =>
  tasks.value.length ? Math.round((doneCount.value / tasks.value.length) * 100) : 0
);

const loadTasks = async () => {
  loading.value = true;
  try {
    tasks.value = await fetchTasks();
  } catch (error) {
    showError("Failed to load tasks", error);
  } finally {
    loading.value = false;
  }
};

// Tải task sau khi biết trạng thái đăng nhập; đăng xuất thì xóa danh sách.
watch(
  user,
  (current) => {
    if (current) {
      loadTasks();
    } else {
      tasks.value = [];
      isCreating.value = false;
    }
  },
  { immediate: true }
);

const onCreate = async (draft: TaskDraft) => {
  try {
    tasks.value.push(await createTask(draft));
    isCreating.value = false;
  } catch (error) {
    // Giữ form mở để người dùng không mất dữ liệu đã nhập
    showError("Failed to create task", error);
  }
};

const onUpdate = async (task: Task, patch: TaskPatch) => {
  const index = tasks.value.findIndex((item) => item.id === task.id);
  if (index === -1) return;
  const previous = tasks.value[index]!;
  // Cập nhật lạc quan, hoàn tác nếu Firestore từ chối
  tasks.value[index] = { ...previous, ...patch };
  try {
    await updateTask(task.id, patch);
  } catch (error) {
    tasks.value[index] = previous;
    showError("Failed to update task", error);
  }
};

const onDelete = async (task: Task) => {
  try {
    await deleteTask(task.id);
    tasks.value = tasks.value.filter((item) => item.id !== task.id);
  } catch (error) {
    showError("Failed to delete task", error);
  }
};

const onClearAll = async () => {
  try {
    await clearTasks();
    tasks.value = [];
  } catch (error) {
    showError("Failed to clear tasks", error);
  }
};

const taskMenu = computed(() => [
  [
    {
      label: "Clear all tasks",
      icon: "i-heroicons-trash",
      disabled: !tasks.value.length,
      click: onClearAll,
    },
  ],
]);

const addTaskLabel = computed(() => {
  if (!ready.value) return "Loading…";
  return isAuthenticated.value ? "Add Task" : "Sign in to add tasks";
});

const addTaskButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/60 py-3 font-bold transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent";
</script>

<template>
  <div class="mx-auto flex w-full max-w-xl flex-col gap-6">
    <!-- Timer -->
    <section :class="['rounded-xl p-4 transition-colors duration-500', mode.bgCard]">
      <nav class="flex justify-center gap-1" aria-label="Timer mode">
        <button
          v-for="item in MODE_LIST"
          :key="item.key"
          type="button"
          :class="[
            'rounded-lg px-3 py-1.5 text-base transition',
            item.key === modeKey ? [mode.bgActive, 'font-bold'] : 'hover:bg-black/10',
          ]"
          :aria-pressed="item.key === modeKey"
          @click="selectMode(item.key)"
        >
          {{ item.name }}
        </button>
      </nav>

      <TimerCard :mode="mode" :auto-start="autoStart" @finished="onTimerFinished" />
    </section>

    <!-- Tasks -->
    <section>
      <div class="flex items-center justify-between pb-2">
        <h2 class="text-lg font-bold">Tasks</h2>
        <div class="flex items-center gap-2">
          <span class="text-sm text-white/80">{{ doneCount }}/{{ tasks.length }} done</span>
          <UDropdown :items="taskMenu" :popper="{ placement: 'bottom-end' }">
            <button
              type="button"
              class="rounded-full p-1.5 transition hover:bg-black/10"
              aria-label="Task options"
            >
              <UIcon name="i-heroicons-ellipsis-vertical" class="h-5 w-5" />
            </button>
          </UDropdown>
        </div>
      </div>

      <div class="mb-4 h-1 overflow-hidden rounded-full bg-white/25" role="progressbar"
        :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
        <div class="h-full rounded-full bg-white transition-all duration-300" :style="{ width: `${progress}%` }" />
      </div>

      <div class="flex flex-col gap-2">
        <TaskItem
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          @update="(patch) => onUpdate(task, patch)"
          @delete="onDelete(task)"
        />
        <p
          v-if="isAuthenticated && !loading && !tasks.length"
          class="py-4 text-center text-white/70"
        >
          No tasks yet. Add one below.
        </p>
      </div>

      <!-- Phụ thuộc trạng thái đăng nhập (chỉ biết ở client) nên render riêng phía client
           để server và client không lệch nhau khi hydrate. -->
      <ClientOnly>
        <div class="mt-3">
          <TaskForm v-if="isCreating" @submit="onCreate" @cancel="isCreating = false" />
          <button
            v-else
            type="button"
            :disabled="!isAuthenticated"
            :class="addTaskButtonClass"
            @click="isCreating = true"
          >
            <UIcon name="i-heroicons-plus-circle" class="h-5 w-5" />
            {{ addTaskLabel }}
          </button>
        </div>
        <template #fallback>
          <div class="mt-3">
            <button type="button" disabled :class="addTaskButtonClass">
              <UIcon name="i-heroicons-plus-circle" class="h-5 w-5" />
              Loading…
            </button>
          </div>
        </template>
      </ClientOnly>
    </section>
  </div>
</template>
