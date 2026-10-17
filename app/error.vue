<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();

const title = computed(() =>
  props.error.statusCode === 404 ? "404 Not Found" : "An error occurred"
);

useHead({ title });
</script>

<template>
  <div
    class="flex min-h-screen flex-col items-center justify-center gap-4 bg-pomodoro p-6 text-center text-white"
  >
    <IconsTomato :size="48" />
    <h1 class="text-2xl font-bold">{{ title }}</h1>
    <p v-if="error.statusMessage" class="text-white/80">
      {{ error.statusMessage }}
    </p>
    <UButton color="white" @click="clearError({ redirect: '/' })">
      Home page
    </UButton>
  </div>
</template>
