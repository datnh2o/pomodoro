<script setup lang="ts">
import { describeWeather } from "~/composables/useWeather";

const { weather, status, load } = useWeather();
onMounted(() => load(false));

const info = computed(() => (weather.value ? describeWeather(weather.value.code) : null));
</script>

<template>
  <div class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
    <template v-if="status === 'ready' && weather && info">
      <UIcon :name="info.icon" class="h-4 w-4 text-sky-600" />
      <span class="font-semibold text-gray-900 dark:text-gray-100">{{ weather.temperature }}°</span>
      <span>{{ info.label }}</span>
      <span class="text-gray-400">·</span>
      <span>{{ weather.min }}–{{ weather.max }}°</span>
      <template v-if="weather.rainChance >= 20">
        <span class="text-gray-400">·</span>
        <span>mưa {{ weather.rainChance }}%</span>
      </template>
      <button type="button" class="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Tải lại thời tiết" @click="load(true)">
        <UIcon name="i-lucide-refresh-cw" class="h-3.5 w-3.5" />
      </button>
    </template>
    <button
      v-else-if="status === 'no-location'"
      type="button"
      class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      @click="load(true)"
    >
      <UIcon name="i-lucide-map-pin" class="h-3.5 w-3.5" />
      Bật vị trí để xem thời tiết
    </button>
    <span v-else-if="status === 'loading'" class="text-xs text-gray-400">Đang lấy thời tiết...</span>
    <button v-else-if="status === 'error'" type="button" class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="load(true)">
      Không lấy được thời tiết, thử lại
    </button>
  </div>
</template>
