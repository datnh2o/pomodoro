<script setup lang="ts">
import type { MainTask } from "#shared/utils/models";
import type { MainTaskInput } from "~/composables/useTasks";
import type { SubAccountInput } from "~/composables/useMembers";
import { DEFAULT_EVENING_REMINDER, isActiveFrom } from "#shared/utils/models";
import { formatMoney, formatShortVi, todayKey, WEEKDAY_LABELS } from "#shared/utils/dates";

const { user } = useAuth();
const { workspace, can, isOwner, updatePenaltyAmount } = useWorkspace();
const { mainTasks, createMainTask, updateMainTask, archiveMainTask } = useTasks();
const push = usePush();
const { resetPassword } = useAuth();
const { updateEveningReminder } = useWorkspace();

// ---- Nhắc đẩy ----
const onTogglePush = async (enabled: boolean) => {
  try {
    if (enabled) {
      await push.subscribe();
      toast.add({ title: "Đã bật nhắc đẩy trên thiết bị này", color: "success", icon: "i-lucide-bell" });
    } else {
      await push.unsubscribe();
    }
  } catch (error) {
    showError("Không bật được nhắc đẩy", error);
  }
};

const eveningInput = ref("");
watch(() => workspace.value?.eveningReminderTime, (v) => { eveningInput.value = v ?? DEFAULT_EVENING_REMINDER; }, { immediate: true });
const saveEvening = async () => {
  try {
    await updateEveningReminder(eveningInput.value || null);
    toast.add({ title: "Đã lưu giờ nhắc cuối ngày", color: "success" });
  } catch (error) {
    showError("Không lưu được", error);
  }
};
const { members, createSubAccount, updateMember, removeMember, shareUrl, enableShareLink, disableShareLink } = useMembers();
const { showError } = useErrorToast();
const toast = useToast();

// ---- Thành viên ----
const subAccountOpen = ref(false);
const memberBusy = ref<string | null>(null);

const onCreateSubAccount = async (input: SubAccountInput) => {
  try {
    await createSubAccount(input);
    toast.add({
      title: "Đã tạo tài khoản con",
      description: `${input.email} đăng nhập tại cùng địa chỉ app này.`,
      color: "success",
    });
  } catch (error) {
    showError("Không tạo được tài khoản", error);
  }
};

const onTogglePermission = async (uid: string, key: "add" | "edit", value: boolean) => {
  const member = workspace.value?.members[uid];
  if (!member) return;
  memberBusy.value = uid;
  try {
    const next = { add: member.add, edit: member.edit, [key]: value };
    // Quyền sửa bao hàm quyền thêm
    if (key === "edit" && value) next.add = true;
    if (key === "add" && !value) next.edit = false;
    await updateMember(uid, next);
  } catch (error) {
    showError("Không đổi được quyền", error);
  } finally {
    memberBusy.value = null;
  }
};

const onRemoveMember = async (uid: string, name: string) => {
  if (!confirm(`Gỡ ${name} khỏi bảng này? Họ vẫn đăng nhập được nhưng sẽ dùng bảng riêng.`)) return;
  try {
    await removeMember(uid);
  } catch (error) {
    showError("Không gỡ được", error);
  }
};

// ---- Link chia sẻ ----
const shareBusy = ref(false);
const onToggleShare = async (enabled: boolean) => {
  shareBusy.value = true;
  try {
    if (enabled) await enableShareLink();
    else await disableShareLink();
  } catch (error) {
    showError("Không cập nhật được link", error);
  } finally {
    shareBusy.value = false;
  }
};
const copyShareUrl = async () => {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    toast.add({ title: "Đã sao chép link", color: "success" });
  } catch {
    toast.add({ title: "Không sao chép được", description: shareUrl.value, color: "warning" });
  }
};

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

    <!-- Thành viên (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500">Thành viên</h2>
        <UButton size="sm" icon="i-lucide-user-plus" @click="subAccountOpen = true">Tài khoản con</UButton>
      </div>
      <p class="mb-3 text-sm text-gray-600">Tài khoản con dùng chung bảng nhiệm vụ này với quyền bạn cấp.</p>
      <ul class="divide-y divide-gray-100">
        <li v-for="member in members" :key="member.uid" class="flex flex-col gap-2 py-3">
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ member.displayName || member.email || member.uid }}</p>
              <p v-if="member.displayName && member.email" class="truncate text-xs text-gray-500">{{ member.email }}</p>
            </div>
            <UBadge v-if="member.isOwner" color="primary" variant="subtle" size="sm">Chủ sở hữu</UBadge>
            <UButton
              v-else
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-user-minus"
              aria-label="Gỡ thành viên"
              @click="onRemoveMember(member.uid, member.displayName || member.email || 'thành viên')"
            />
          </div>
          <div v-if="!member.isOwner" class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <USwitch
              :model-value="member.add"
              :disabled="memberBusy === member.uid"
              label="Thêm"
              @update:model-value="(v) => onTogglePermission(member.uid, 'add', v)"
            />
            <USwitch
              :model-value="member.edit"
              :disabled="memberBusy === member.uid"
              label="Sửa"
              @update:model-value="(v) => onTogglePermission(member.uid, 'edit', v)"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- Link chia sẻ (owner) -->
    <section v-if="isOwner" class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Link chia sẻ</h2>
      <p class="mb-3 text-sm text-gray-600">
        Ai có link sẽ xem được (không sửa) nhiệm vụ hôm nay, tổng nợ và thống kê tháng. Tắt là link hết hiệu lực.
      </p>
      <USwitch :model-value="!!workspace?.shareToken" :disabled="shareBusy" label="Bật link chia sẻ" @update:model-value="onToggleShare" />
      <div v-if="shareUrl" class="mt-3 flex items-center gap-2">
        <UInput :model-value="shareUrl" readonly class="flex-1" />
        <UButton color="neutral" variant="outline" icon="i-lucide-copy" aria-label="Sao chép" @click="copyShareUrl" />
        <UButton color="neutral" variant="outline" icon="i-lucide-external-link" aria-label="Mở" :to="shareUrl" target="_blank" />
      </div>
    </section>

    <!-- Thông báo -->
    <section class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Thông báo</h2>
      <p class="mb-3 text-sm text-gray-600">
        Khi app đang mở, tới giờ nhiệm vụ sẽ có nhắc trong app. Bật nhắc đẩy để được nhắc cả khi app đóng:
        đúng giờ từng nhiệm vụ và một lần cuối ngày nếu còn việc chưa xong.
      </p>

      <UAlert
        v-if="push.needsHomeScreen.value"
        color="info"
        variant="subtle"
        icon="i-lucide-smartphone"
        title="Trên iPhone cần thêm app ra màn hình chính"
        description="Safari > nút Chia sẻ > Thêm vào MH chính, rồi mở app từ icon đó và bật nhắc đẩy."
        class="mb-3"
      />
      <p v-else-if="!push.supported.value" class="mb-3 text-sm text-gray-500">Trình duyệt này không hỗ trợ nhắc đẩy.</p>
      <p v-else-if="push.permission.value === 'denied'" class="mb-3 text-sm text-red-600">Thông báo đang bị chặn trong cài đặt trình duyệt.</p>

      <USwitch
        :model-value="push.subscribed.value"
        :disabled="push.busy.value || !push.supported.value || push.permission.value === 'denied'"
        label="Nhắc đẩy trên thiết bị này"
        @update:model-value="onTogglePush"
      />

      <form v-if="isOwner" class="mt-4 flex flex-wrap items-center gap-2" @submit.prevent="saveEvening">
        <label class="text-sm text-gray-700" for="evening-time">Nhắc cuối ngày lúc</label>
        <UInput id="evening-time" v-model="eveningInput" type="time" class="w-32" />
        <UButton type="submit" color="neutral" variant="outline" size="sm">Lưu</UButton>
      </form>
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
    </section>

    <MainTaskForm v-model:open="formOpen" :task="editing" @save="onSave" />
    <SubAccountForm v-model:open="subAccountOpen" @save="onCreateSubAccount" />
  </div>
</template>
