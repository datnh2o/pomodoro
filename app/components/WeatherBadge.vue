<script setup lang="ts">
import { describeWeather } from "~/composables/useWeather";

const { weather, status, load } = useWeather();
onMounted(() => load(false));

const info = computed(() => (weather.value ? describeWeather(weather.value.code) : null));
</script>

<template>
  <!-- Tối giản: chỉ biểu tượng và nhiệt độ; chạm để tải lại / bật vị trí -->
  <button
    v-if="status !== 'loading'"
    type="button"
    class="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400"
    :aria-label="status === 'ready' && info ? `${info.label}, ${weather?.temperature}°. Tải lại thời tiết` : 'Bật vị trí để xem thời tiết'"
    :title="status === 'ready' && info ? info.label : undefined"
    @click="load(true)"
  >
    <template v-if="status === 'ready' && weather && info">
      <UIcon :name="info.icon" class="h-4 w-4 text-sky-600" />
      <span class="font-semibold text-gray-900 dark:text-gray-100">{{ weather.temperature }}°</span>
    </template>
    <UIcon v-else :name="status === 'error' ? 'i-lucide-cloud-off' : 'i-lucide-map-pin'" class="h-4 w-4 text-gray-400" />
  </button>
  <UIcon v-else name="i-lucide-cloud" class="h-4 w-4 animate-pulse text-gray-300" />
</template>
