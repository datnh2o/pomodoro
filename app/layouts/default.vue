<script setup lang="ts">
const { mode } = useMode();
const { user, ready, signInWithGoogle, signOut } = useAuth();
const { showError } = useErrorToast();

const login = async () => {
  try {
    await signInWithGoogle();
  } catch (error) {
    showError("Sign-in failed", error);
  }
};

const logout = async () => {
  try {
    await signOut();
  } catch (error) {
    showError("Sign-out failed", error);
  }
};

const userMenu = computed(() => [
  [{ label: user.value?.email ?? "", disabled: true }],
  [
    {
      label: "Logout",
      icon: "i-heroicons-arrow-right-start-on-rectangle",
      click: logout,
    },
  ],
]);
</script>

<template>
  <div
    :class="[
      'flex min-h-screen flex-col text-white transition-colors duration-500',
      mode.bg,
    ]"
  >
    <header class="sticky top-0 z-10 bg-black/10 backdrop-blur">
      <UContainer class="flex h-14 items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2 text-lg font-bold">
          <IconsTomato :size="20" />
          Pomodoro Timer
        </NuxtLink>

        <!-- Trạng thái đăng nhập chỉ có ở client (Firebase Auth) -->
        <ClientOnly>
          <UDropdown
            v-if="user"
            :items="userMenu"
            :popper="{ placement: 'bottom-end' }"
          >
            <button
              type="button"
              class="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-black/10"
            >
              <!-- SDK Firebase đặt tên trường là photoURL (API thô mới là photoUrl).
                   Ảnh Google (lh3.googleusercontent.com) trả 429 nếu trình duyệt gửi kèm Referer,
                   nên tắt referrer cho riêng thẻ img này; UAvatar chuyển attrs thẳng xuống <img>. -->
              <UAvatar
                :src="user.photoURL ?? undefined"
                :alt="user.displayName ?? 'User'"
                size="sm"
                referrerpolicy="no-referrer"
              />
              <span class="font-bold">{{ user.displayName }}</span>
            </button>
          </UDropdown>

          <UButton v-else-if="ready" color="white" @click="login">
            <IconsGoogle class="h-4 w-4" />
            Sign in with Google
          </UButton>
        </ClientOnly>
      </UContainer>
    </header>

    <main class="flex-1">
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </main>

    <footer class="py-4 text-center text-sm text-white/80">
      &copy; {{ new Date().getFullYear() }} by Datnh2o
    </footer>
  </div>
</template>
