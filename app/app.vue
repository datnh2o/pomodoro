<script setup lang="ts">
import type { ToasterProps } from "@nuxt/ui";

// Vị trí toast: prop `toaster` thuộc <UApp> (nơi render Toaster), không phải <NuxtPage>.
const toaster: ToasterProps = { position: "top-center" };
</script>

<template>
  <!-- UApp cung cấp toaster (useToast), tooltip và overlay cho Nuxt UI -->
  <UApp :toaster="toaster">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
