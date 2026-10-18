<script setup lang="ts">
import { todayKey } from "#shared/utils/dates";

const route = useRoute();
const { user, ready, signOut } = useAuth();
const { workspace, loading: workspaceLoading, bind: bindWorkspace, unbind: unbindWorkspace } = useWorkspace();
const { bind: bindTasks, unbind: unbindTasks } = useTasks();
const { today, bind: bindDay, unbind: unbindDay } = useDay();
const { showError } = useErrorToast();

// Chặn route: biết trạng thái đăng nhập rồi mà chưa có user thì về trang đăng nhập
watch(
  [ready, user],
  async ([isReady, current]) => {
    if (!isReady) return;
    if (!current) {
      unbindTasks();
      unbindDay();
      unbindWorkspace();
      if (route.path !== "/login") await navigateTo("/login");
      return;
    }
    try {
      await bindWorkspace();
    } catch (error) {
      showError("Không tải được dữ liệu", error);
    }
  },
  { immediate: true }
);

// Có workspace thì lắng nghe nhiệm vụ và kết quả hôm nay
watch(
  [() => workspace.value?.id, today],
  ([wsId, date]) => {
    if (!wsId) return;
    bindTasks(wsId);
    bindDay(wsId, date);
  },
  { immediate: true }
);

// Trạng thái mạng cho banner ngoại tuyến
const { online, bind: bindOnline } = useOnline();
onMounted(() => {
  const unbind = bindOnline();
  onBeforeUnmount(unbind);
});

// Đồng hồ dùng chung: qua nửa đêm (giờ VN) thì đổi "hôm nay", và cập nhật HH:mm cho hạn giờ
const { tick } = useClock();
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick();
  clock = setInterval(() => {
    tick();
    const key = todayKey();
    if (key !== today.value) today.value = key;
  }, 30_000);
});
onBeforeUnmount(() => clearInterval(clock));

const logout = async () => {
  try {
    await signOut();
  } catch (error) {
    showError("Đăng xuất thất bại", error);
  }
};

const userMenu = computed(() => [
  [{ label: user.value?.email ?? "", type: "label" as const }],
  [{ label: "Đăng xuất", icon: "i-lucide-log-out", onSelect: logout }],
]);

const booting = computed(() => !ready.value || (!!user.value && workspaceLoading.value && !workspace.value));

// Trang Pomodoro phủ màu chế độ lên toàn màn hình (nền + header)
const { mode } = useMode();
const isPomodoro = computed(() => route.path === "/pomodoro");
</script>

<template>
  <div
    :class="[
      'min-h-screen transition-colors duration-500',
      isPomodoro ? [mode.bg, 'text-white'] : 'bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100',
    ]"
  >
    <header
      :class="[
        'sticky top-0 z-10 border-b backdrop-blur transition-colors duration-500',
        isPomodoro ? 'border-white/10 bg-black/10' : 'border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90',
      ]"
    >
      <UContainer class="flex h-14 max-w-xl items-center justify-between">
        <NuxtLink to="/" :class="['flex items-center gap-2 text-lg font-bold', isPomodoro ? 'text-white' : 'text-primary']">
          <IconsTomato :size="22" />
          Nhiệm vụ hằng ngày
        </NuxtLink>

        <UDropdownMenu v-if="user" :items="userMenu" :content="{ align: 'end' }">
          <button type="button" :class="['flex items-center gap-2 rounded-full p-1', isPomodoro ? 'hover:bg-black/10' : 'hover:bg-gray-100 dark:hover:bg-gray-800']" aria-label="Tài khoản">
            <!-- Ảnh Google trả 429 nếu gửi kèm Referer, UAvatar bind $attrs xuống <img> -->
            <UAvatar
              :src="user.photoURL ?? undefined"
              :alt="user.displayName ?? user.email ?? 'Tài khoản'"
              size="sm"
              referrerpolicy="no-referrer"
            />
          </button>
        </UDropdownMenu>
      </UContainer>
    </header>

    <div v-if="!online" class="bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-white">
      <UIcon name="i-lucide-wifi-off" class="mr-1 inline h-4 w-4 align-text-bottom" />
      Đang ngoại tuyến. Thay đổi sẽ tự đồng bộ khi có mạng.
    </div>

    <main class="pb-32">
      <UContainer class="max-w-xl py-5">
        <div v-if="booting" class="flex justify-center py-20 text-gray-400">
          <UIcon name="i-lucide-loader-circle" class="h-8 w-8 animate-spin" />
        </div>
        <!-- Luôn mount <NuxtPage> (tránh cảnh báo NUXT_E4011), chỉ ẩn khi đang khởi động -->
        <div v-show="!booting">
          <slot />
        </div>
      </UContainer>
    </main>

    <VoiceQuickAdd v-if="user && workspace" />
    <AppTabBar v-if="user" />
  </div>
</template>
