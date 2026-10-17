<script setup lang="ts">
import type { MainTask } from "~/utils/models";
import type { MainTaskInput } from "~/composables/useTasks";
import { isActiveFrom } from "~/utils/models";
import { formatMoney, formatShortVi, todayKey, WEEKDAY_LABELS } from "~/utils/dates";

const { user } = useAuth();
const { workspace, can, isOwner, updatePenaltyAmount } = useWorkspace();
const { mainTasks, createMainTask, updateMainTask, archiveMainTask } = useTasks();
const { permission, requestPermission } = useReminders();
const { resetPassword } = useAuth();
const { showError } = useErrorToast();
const toast = useToast();

const today = computed(() => todayKey());
const activeMain = computed(() => mainTasks.value.filter((t) => isActiveFrom(t, today.value)));

const weekdaysLabel = (task: MainTask) =>
  task.weekdays.length === 7 ? "Hằng ngày" : [...task.weekdays].sort((a, b) => (a || 7) - (b || 7)).map((d) => WEEKDAY_LABELS[d]).join(", ");

// ---- Form nhiệm vụ chính ----
const formOpen = ref(false);
const editing = ref<MainTask | null>(null);

const openCreate = () => {
  editing.value = null;
  formOpen.value = true;
};
const openEdit = (task: MainTask) => {
  editing.value = task;
  formOpen.value = true;
};

const onSave = async (input: MainTaskInput) => {
  try {
    if (editing.value) {
      const replaced = await updateMainTask(editing.value, input);
      toast.add({
        title: "Đã lưu",
        description: replaced ? "Lịch mới có hiệu lực từ ngày mai." : undefined,
        color: "success",
      });
    } else {
      await createMainTask(input);
      toast.add({ title: "Đã thêm nhiệm vụ chính", color: "success" });
    }
  } catch (error) {
    showError("Không lưu được", error);
  }
};

const onArchive = async (task: MainTask) => {
  if (!confirm(`Ngừng "${task.title}"? Hôm nay vẫn tính, từ mai sẽ không còn.`)) return;
  try {
    await archiveMainTask(task);
  } catch (error) {
    showError("Không ngừng được", error);
  }
};

const taskMenu = (task: MainTask) => [
  [
    { label: "Sửa", icon: "i-lucide-pencil", onSelect: () => openEdit(task) },
    { label: "Ngừng từ ngày mai", icon: "i-lucide-archive", color: "error" as const, onSelect: () => onArchive(task) },
  ],
];

// ---- Mức phạt ----
const penaltyInput = ref("");
watch(() => workspace.value?.penaltyAmount, (v) => { penaltyInput.value = String(v ?? ""); }, { immediate: true });
const savePenalty = async () => {
  const amount = Number(penaltyInput.value);
  if (!Number.isInteger(amount) || amount < 0) {
    showError("Mức phạt không hợp lệ", new Error("Nhập số nguyên không âm"));
    return;
  }
  try {
    await updatePenaltyAmount(amount);
    toast.add({ title: "Đã cập nhật mức phạt", description: formatMoney(amount), color: "success" });
  } catch (error) {
    showError("Không lưu được", error);
  }
};

// ---- Tài khoản ----
const onChangePassword = async () => {
  if (!user.value?.email) return;
  try {
    await resetPassword(user.value.email);
    toast.add({ title: "Đã gửi email đổi mật khẩu", description: user.value.email, color: "success" });
  } catch (error) {
    showError("Không gửi được email", error);
  }
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Nhiệm vụ chính -->
    <section>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500">Nhiệm vụ chính</h2>
        <UButton v-if="can('edit')" size="sm" icon="i-lucide-plus" @click="openCreate">Thêm</UButton>
      </div>

      <div v-if="!activeMain.length" class="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-500">
        Chưa có nhiệm vụ chính nào.
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="task in activeMain"
          :key="task.id"
          class="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200"
        >
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ task.title }}</p>
            <p class="text-sm text-gray-500">{{ weekdaysLabel(task) }}</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <UBadge v-if="task.requiresProof" color="neutral" variant="subtle" size="sm" icon="i-lucide-camera">Cần ảnh</UBadge>
              <UBadge v-if="task.reminderTime" color="warning" variant="subtle" size="sm" icon="i-lucide-bell">{{ task.reminderTime }}</UBadge>
              <UBadge v-if="task.effectiveFrom > today" color="info" variant="subtle" size="sm">Từ {{ formatShortVi(task.effectiveFrom) }}</UBadge>
              <UBadge v-if="task.endsOn" color="error" variant="subtle" size="sm">Ngừng từ {{ formatShortVi(task.endsOn) }}</UBadge>
            </div>
          </div>
          <UDropdownMenu v-if="can('edit') && !task.endsOn" :items="taskMenu(task)" :content="{ align: 'end' }">
            <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-ellipsis-vertical" aria-label="Tùy chọn" />
          </UDropdownMenu>
        </li>
      </ul>
    </section>

    <!-- Mức phạt -->
    <section v-if="isOwner" class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Mức phạt</h2>
      <p class="mb-3 text-sm text-gray-600">Số tiền mất cho mỗi nhiệm vụ chính bỏ lỡ trong ngày.</p>
      <form class="flex items-center gap-2" @submit.prevent="savePenalty">
        <UInput v-model="penaltyInput" type="number" min="0" step="1000" class="w-40" />
        <span class="text-gray-500">₫</span>
        <UButton type="submit" color="neutral" variant="outline">Lưu</UButton>
      </form>
      <p class="mt-3 text-sm">Tổng nợ hiện tại: <b class="text-red-600">{{ formatMoney(workspace?.penaltyTotal ?? 0) }}</b></p>
    </section>

    <!-- Thông báo -->
    <section class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Thông báo</h2>
      <p class="mb-3 text-sm text-gray-600">
        Nhắc trong app khi tới giờ nhiệm vụ (khi app đang mở). Nhắc đẩy khi app đóng sẽ có ở bản sau.
      </p>
      <UButton
        v-if="permission === 'default'"
        color="neutral"
        variant="outline"
        icon="i-lucide-bell"
        @click="requestPermission"
      >
        Cho phép thông báo
      </UButton>
      <p v-else-if="permission === 'granted'" class="text-sm text-green-700">Đã cho phép thông báo.</p>
      <p v-else-if="permission === 'denied'" class="text-sm text-red-600">Thông báo đang bị chặn trong cài đặt trình duyệt.</p>
      <p v-else class="text-sm text-gray-500">Trình duyệt này không hỗ trợ thông báo.</p>
    </section>

    <!-- Tài khoản -->
    <section class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Tài khoản</h2>
      <p class="font-medium">{{ user?.displayName ?? "Chưa đặt tên" }}</p>
      <p class="text-sm text-gray-500">{{ user?.email }}</p>
      <p class="mt-1 text-xs text-gray-400">Workspace: {{ workspace?.name }} · Vai trò: {{ isOwner ? "chủ sở hữu" : "thành viên" }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-key-round" @click="onChangePassword">Đổi mật khẩu</UButton>
      </div>
      <p class="mt-3 text-xs text-gray-400">Thành viên và phân quyền sẽ có ở bản sau (Phase 3).</p>
    </section>

    <MainTaskForm v-model:open="formOpen" :task="editing" @save="onSave" />
  </div>
</template>
