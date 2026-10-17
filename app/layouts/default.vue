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

// Qua nửa đêm (giờ VN) thì đổi "hôm nay"
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => {
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
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <UContainer class="flex h-14 max-w-xl items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2 text-lg font-bold text-primary">
          <IconsTomato :size="22" />
          Nhiệm vụ hằng ngày
        </NuxtLink>

        <UDropdownMenu v-if="user" :items="userMenu" :content="{ align: 'end' }">
          <button type="button" class="flex items-center gap-2 rounded-full p-1 hover:bg-gray-100" aria-label="Tài khoản">
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

    <main class="pb-24">
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

    <AppTabBar v-if="user" />
  </div>
</template>
