<script setup lang="ts">
import { MODE_LIST } from "~/utils/modes";
import { MUSIC_SOURCES, type MusicSource } from "~/utils/music";

// Bấm tab chế độ thủ công thì không tự chạy; hết giờ tự chuyển tiếp nằm trong usePomodoro
const { modeKey, mode, selectMode, musicId, music, setMusic } = usePomodoro();

const musicIcon = (s: MusicSource) => (s.url === null ? "i-lucide-volume-x" : s.live ? "i-lucide-radio" : "i-lucide-music");
const musicItems = MUSIC_SOURCES.map((s) => ({ label: s.name, value: s.id, icon: musicIcon(s) }));
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
</script>

<template>
  <section :class="['rounded-2xl p-4 text-white shadow-sm transition-colors duration-500', mode.bgCard]">
    <nav class="flex justify-center gap-1" aria-label="Chế độ">
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

    <TimerCard />

    <!-- Nguồn nhạc: bản đi kèm app hoặc đài lofi trực tuyến; đổi khi đang chạy thì phát luôn -->
    <div class="flex flex-col items-center gap-1.5 pb-1">
      <USelect
        :model-value="musicId"
        :items="musicItems"
        :icon="musicIcon(music)"
        variant="none"
        class="w-64"
        aria-label="Nhạc khi chạy Pomodoro"
        :ui="{ base: 'rounded-md bg-black/15 text-white', leadingIcon: 'text-white', trailingIcon: 'text-white/80' }"
        @update:model-value="(value) => setMusic(String(value))"
      />
      <p class="text-xs text-white/75">
        <template v-if="music.homepage">
          Đài phát trực tuyến 24/7 ·
          <a :href="music.homepage" target="_blank" rel="noopener" class="underline">{{ hostOf(music.homepage) }}</a>
        </template>
        <template v-else-if="music.url">Bản nhạc đi kèm app, phát lặp lại</template>
        <template v-else>Chỉ có chuông khi hết giờ</template>
      </p>
    </div>
  </section>
</template>
