<script setup lang="ts">
import { MODE_LIST } from "~/utils/modes";
import { MUSIC_SOURCES, type MusicSource } from "~/utils/music";

// Bấm tab chế độ thủ công thì không tự chạy; hết giờ tự chuyển tiếp theo vòng nằm trong usePomodoro
const { modeKey, mode, selectMode, musicId, music, setMusic, musicPlaying, toggleMusic, prevMusic, nextMusic, cycle, settings } =
  usePomodoro();
const settingsOpen = ref(false);

const musicIcon = (s: MusicSource) => (s.url === null ? "i-lucide-volume-x" : s.live ? "i-lucide-radio" : "i-lucide-cloud-rain");
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

    <!-- Tiến độ vòng: mỗi chấm là một phiên tập trung; sau N lần nghỉ ngắn là nghỉ dài -->
    <div class="flex flex-col items-center gap-1 pb-3">
      <div class="flex items-center gap-2" aria-label="Tiến độ vòng">
        <span
          v-for="i in cycle.focusPerCycle"
          :key="i"
          :class="[
            'h-2.5 w-2.5 rounded-full transition',
            i < cycle.focusIndex || (i === cycle.focusIndex && modeKey !== 'pomodoro') ? 'bg-white' : i === cycle.focusIndex ? 'bg-white ring-2 ring-white/50' : 'bg-white/30',
          ]"
        />
        <button type="button" class="ml-2 rounded-full p-1 hover:bg-black/10" aria-label="Cài đặt vòng Pomodoro" @click="settingsOpen = true">
          <UIcon name="i-lucide-settings-2" class="h-4 w-4" />
        </button>
      </div>
      <p class="text-xs text-white/75">
        Phiên {{ cycle.focusIndex }}/{{ cycle.focusPerCycle }} ·
        {{ cycle.nextBreak === "long" ? "nghỉ dài sắp tới" : `nghỉ dài sau ${settings.longBreakAfter - cycle.shortBreaksDone} lần nghỉ ngắn nữa` }}
        · một vòng {{ cycle.totalMinutes }} phút
      </p>
    </div>

    <!-- Nguồn nhạc: tiếng mưa đi kèm app hoặc đài lofi trực tuyến. Phát/dừng và chuyển kênh độc lập với đồng hồ -->
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
      <div class="flex items-center gap-5" role="group" aria-label="Điều khiển nhạc">
        <button type="button" class="rounded-full p-2 transition hover:bg-black/10" aria-label="Kênh trước" title="Kênh trước" @click="prevMusic">
          <UIcon name="i-lucide-skip-back" class="h-5 w-5" />
        </button>
        <button
          type="button"
          class="rounded-full bg-white/20 p-2.5 transition enabled:hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
          :aria-label="musicPlaying ? 'Dừng nhạc' : 'Phát nhạc'"
          :title="musicPlaying ? 'Dừng nhạc' : 'Phát nhạc'"
          :disabled="!music.url"
          @click="toggleMusic"
        >
          <UIcon :name="musicPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="h-6 w-6" />
        </button>
        <button type="button" class="rounded-full p-2 transition hover:bg-black/10" aria-label="Kênh sau" title="Kênh sau" @click="nextMusic">
          <UIcon name="i-lucide-skip-forward" class="h-5 w-5" />
        </button>
      </div>
      <p class="text-xs text-white/75">
        <template v-if="music.homepage">
          Đài phát trực tuyến 24/7 ·
          <a :href="music.homepage" target="_blank" rel="noopener" class="underline">{{ hostOf(music.homepage) }}</a>
        </template>
        <template v-else-if="music.url">Tiếng mưa đi kèm app, phát lặp lại</template>
        <template v-else>Chỉ có chuông khi hết giờ</template>
      </p>
    </div>
    <PomodoroSettingsModal v-model:open="settingsOpen" />
  </section>
</template>
