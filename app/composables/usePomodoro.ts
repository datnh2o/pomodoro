import { MODES, type ModeKey } from "~/utils/modes";
import { DEFAULT_MUSIC_SOURCE, MUSIC_SOURCES, findMusicSource } from "~/utils/music";

// Vòng đếm và âm thanh sống ngoài component (app là SPA) để đồng hồ đếm và phát nhạc tiếp
// khi chuyển sang màn khác; rời trang Pomodoro không dừng gì cả.
let interval: ReturnType<typeof setInterval> | null = null;
let endTime = 0;
let alertSound: HTMLAudioElement | null = null;
let musicAudio: HTMLAudioElement | null = null;
/** URL đang nạp vào musicAudio (thuộc tính src trả về URL tuyệt đối nên giữ riêng để so) */
let loadedUrl: string | null = null;

const MUSIC_STORAGE_KEY = "pomodoro:music";
const SETTINGS_STORAGE_KEY = "pomodoro:settings";

/** Thời lượng (phút) và cấu trúc vòng: sau `longBreakAfter` lần nghỉ ngắn thì nghỉ dài, rồi vòng mới */
export interface PomodoroSettings {
  focus: number;
  short: number;
  long: number;
  longBreakAfter: number;
}
export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = { focus: 25, short: 5, long: 15, longBreakAfter: 2 };

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const readSavedSettings = (): PomodoroSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PomodoroSettings>) : {};
    return {
      focus: clampInt(parsed.focus, 1, 180, DEFAULT_POMODORO_SETTINGS.focus),
      short: clampInt(parsed.short, 1, 60, DEFAULT_POMODORO_SETTINGS.short),
      long: clampInt(parsed.long, 1, 120, DEFAULT_POMODORO_SETTINGS.long),
      longBreakAfter: clampInt(parsed.longBreakAfter, 1, 10, DEFAULT_POMODORO_SETTINGS.longBreakAfter),
    };
  } catch {
    return { ...DEFAULT_POMODORO_SETTINGS };
  }
};
const saveSettings = (settings: PomodoroSettings) => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
};

/** Nguồn nhạc đã chọn trên máy này; lưu trình duyệt có thể bị chặn nên mọi lỗi đều bỏ qua */
const readSavedMusic = () => {
  try {
    return localStorage.getItem(MUSIC_STORAGE_KEY);
  } catch {
    return null;
  }
};
const saveMusic = (id: string) => {
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
};

const loadedSource = () => MUSIC_SOURCES.find((s) => s.url !== null && s.url === loadedUrl);

/**
 * Đồng hồ Pomodoro dùng chung cho cả app. Hết giờ thì phát chuông, chuyển sang chế độ kế tiếp
 * và tự chạy, kể cả khi đang ở màn khác.
 */
export const usePomodoro = () => {
  const { key: modeKey, mode, setMode } = useMode();
  // Vòng đếm có thể sống lâu hơn component đã gọi start(), nên đọc thẳng state dùng chung thay vì computed của component
  const currentMode = () => MODES[modeKey.value];
  const settings = useState<PomodoroSettings>("pomodoro:settings", () =>
    import.meta.client ? readSavedSettings() : { ...DEFAULT_POMODORO_SETTINGS }
  );
  /** Thời lượng (giây) của một chế độ theo cài đặt hiện tại */
  const durationOf = (key: ModeKey) =>
    (key === "pomodoro" ? settings.value.focus : key === "short" ? settings.value.short : settings.value.long) * 60;
  /** Số lần nghỉ ngắn đã xong trong vòng hiện tại */
  const shortBreaksDone = useState<number>("pomodoro:shortBreaksDone", () => 0);
  const remaining = useState<number>("pomodoro:remaining", () => durationOf(modeKey.value));
  const running = useState<boolean>("pomodoro:running", () => false);

  /** Tiến độ vòng: phiên tập trung thứ mấy, tổng phiên một vòng, tổng phút một vòng */
  const cycle = computed(() => {
    const focusPerCycle = settings.value.longBreakAfter + 1;
    const focusIndex = Math.min(shortBreaksDone.value + 1, focusPerCycle);
    const totalMinutes =
      focusPerCycle * settings.value.focus + settings.value.longBreakAfter * settings.value.short + settings.value.long;
    const nextBreak: ModeKey = shortBreaksDone.value >= settings.value.longBreakAfter ? "long" : "short";
    return { focusIndex, focusPerCycle, totalMinutes, nextBreak, shortBreaksDone: shortBreaksDone.value };
  });
  const musicId = useState<string>("pomodoro:music", () => findMusicSource(readSavedMusic() ?? DEFAULT_MUSIC_SOURCE).id);
  const music = computed(() => findMusicSource(musicId.value));
  /** Muốn có nhạc khi đồng hồ chạy. Bấm dừng nhạc thì tắt tới khi bấm phát lại, kể cả sang phiên mới (không lưu) */
  const musicOn = useState<boolean>("pomodoro:musicOn", () => true);
  /** Nhạc đang phát thật, theo sự kiện của thẻ audio (đúng cả khi hệ thống dừng nhạc từ màn khoá, cuộc gọi) */
  const musicPlaying = useState<boolean>("pomodoro:musicPlaying", () => false);
  const toast = useToast();

  const formatted = computed(() => {
    const minutes = Math.floor(remaining.value / 60);
    const seconds = remaining.value % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  });

  // ---- Nhạc ----

  /** Đài trực tuyến lỗi (mất mạng, đài ngừng phát) khi đang phát: báo và chuyển về bản có sẵn */
  const onMusicError = () => {
    const source = loadedSource();
    if (!source?.live || !musicPlaying.value) return;
    toast.add({
      title: `Không phát được ${source.name}`,
      description: "Đã chuyển sang tiếng mưa có sẵn.",
      color: "warning",
      icon: "i-lucide-radio",
    });
    setMusic(DEFAULT_MUSIC_SOURCE);
  };

  /** Phát nguồn đang chọn; đã nạp đúng nguồn thì phát tiếp (đang phát thì không làm gì) */
  const playMusic = () => {
    const source = findMusicSource(musicId.value);
    if (!source.url) return;
    if (!musicAudio) {
      musicAudio = new Audio();
      musicAudio.addEventListener("error", onMusicError);
      musicAudio.addEventListener("play", () => (musicPlaying.value = true));
      musicAudio.addEventListener("pause", () => (musicPlaying.value = false));
    }
    const audio = musicAudio;
    if (loadedUrl !== source.url) {
      audio.src = source.url;
      audio.loop = !source.live;
      loadedUrl = source.url;
    }
    // Đặt ngay để nút phát/dừng đổi tức thì; play() bị từ chối (trình duyệt chặn tự phát) thì lấy lại trạng thái thật
    musicPlaying.value = true;
    audio.play().catch(() => (musicPlaying.value = !audio.paused));
  };

  /** Dừng nhạc. Đài trực tuyến thì ngắt hẳn để không tốn dữ liệu; phát lại sẽ vào đúng lúc đài đang phát */
  const pauseMusic = () => {
    if (!musicAudio) return;
    musicAudio.pause();
    musicPlaying.value = false;
    if (loadedSource()?.live) {
      loadedUrl = null;
      musicAudio.removeAttribute("src");
      musicAudio.load();
    }
  };

  /** Đổi nguồn nhạc (nhớ trên máy này). Đang phát, hoặc đồng hồ đang chạy mà nhạc đang bật, thì phát luôn nguồn mới */
  const setMusic = (id: string) => {
    const wasPlaying = musicPlaying.value;
    pauseMusic();
    musicId.value = findMusicSource(id).id;
    saveMusic(musicId.value);
    if (wasPlaying || (running.value && musicOn.value)) playMusic();
  };

  /** Nút phát/dừng nhạc, độc lập với đồng hồ: phát được cả khi đồng hồ dừng; dừng thì giữ im tới khi bấm phát lại */
  const toggleMusic = () => {
    if (!music.value.url) return;
    musicOn.value = !musicPlaying.value;
    if (musicOn.value) playMusic();
    else pauseMusic();
  };

  /** Chuyển kênh trước/sau, xoay vòng trong các nguồn có nhạc (bỏ qua "Tắt nhạc"; đang tắt thì vào đầu/cuối danh sách) */
  const stepMusic = (delta: 1 | -1) => {
    const playable = MUSIC_SOURCES.filter((s) => s.url !== null);
    const index = playable.findIndex((s) => s.id === musicId.value);
    const target = index < 0 ? (delta > 0 ? 0 : playable.length - 1) : (index + delta + playable.length) % playable.length;
    setMusic(playable[target]!.id);
  };
  const nextMusic = () => stepMusic(1);
  const prevMusic = () => stepMusic(-1);

  // ---- Đồng hồ ----

  /** Dừng đếm, không đụng tới nhạc */
  const stopCountdown = () => {
    if (interval) clearInterval(interval);
    interval = null;
    running.value = false;
  };

  const stop = () => {
    stopCountdown();
    pauseMusic();
  };

  const reset = () => {
    // Đồng hồ đang chạy thì dừng cả nhạc; nhạc đang phát riêng (đồng hồ dừng) thì để nguyên
    if (running.value) stop();
    remaining.value = durationOf(modeKey.value);
    // Bản có sẵn đang dừng thì tua về đầu; đài trực tuyến đã ngắt khi dừng
    if (musicAudio && loadedSource() && !musicPlaying.value) musicAudio.currentTime = 0;
  };

  const start = () => {
    if (running.value) return;
    // Tính theo mốc thời gian kết thúc để không bị trôi khi tab nền bị throttle
    endTime = Date.now() + remaining.value * 1000;
    running.value = true;
    interval = setInterval(tick, 250);
    if (musicOn.value) playMusic();
  };

  const toggle = () => (running.value ? stop() : start());

  /** Bấm chọn chế độ: đặt lại đồng hồ (không tự chạy). Bấm lại chế độ đang chọn thì bỏ qua. */
  const selectMode = (next: ModeKey) => {
    if (next === modeKey.value) return;
    setMode(next);
    reset();
  };

  /**
   * Chế độ kế tiếp theo vòng: tập trung → nghỉ ngắn, trừ khi đã đủ số lần nghỉ ngắn thì nghỉ dài;
   * hết nghỉ ngắn thì đếm thêm một, hết nghỉ dài thì bắt đầu vòng mới. Luôn quay về tập trung sau khi nghỉ.
   */
  const advanceCycle = (): ModeKey => {
    const current = modeKey.value;
    if (current === "pomodoro") {
      return shortBreaksDone.value >= settings.value.longBreakAfter ? "long" : "short";
    }
    if (current === "short") shortBreaksDone.value += 1;
    else shortBreaksDone.value = 0;
    return "pomodoro";
  };

  /** Hết giờ: chuông, sang chế độ kế tiếp theo vòng và tự chạy. Nhạc không dừng, không tua lại mà phát tiếp */
  const finish = () => {
    stopCountdown();
    alertSound ??= new Audio("/alert.mp3");
    alertSound.play().catch(() => {});
    setMode(advanceCycle());
    remaining.value = durationOf(modeKey.value);
    start();
  };

  /** Bắt đầu lại vòng từ phiên tập trung đầu tiên */
  const resetCycle = () => {
    shortBreaksDone.value = 0;
    setMode("pomodoro");
    reset();
  };

  /** Đổi thời lượng / cấu trúc vòng (lưu trên máy). Đồng hồ đang dừng thì cập nhật số đang hiện. */
  const updateSettings = (patch: Partial<PomodoroSettings>) => {
    settings.value = {
      focus: clampInt(patch.focus ?? settings.value.focus, 1, 180, settings.value.focus),
      short: clampInt(patch.short ?? settings.value.short, 1, 60, settings.value.short),
      long: clampInt(patch.long ?? settings.value.long, 1, 120, settings.value.long),
      longBreakAfter: clampInt(patch.longBreakAfter ?? settings.value.longBreakAfter, 1, 10, settings.value.longBreakAfter),
    };
    saveSettings(settings.value);
    if (shortBreaksDone.value > settings.value.longBreakAfter) shortBreaksDone.value = settings.value.longBreakAfter;
    if (!running.value) remaining.value = durationOf(modeKey.value);
  };

  function tick() {
    const left = Math.round((endTime - Date.now()) / 1000);
    if (left > 0) {
      remaining.value = left;
      return;
    }
    remaining.value = 0;
    finish();
  }

  return {
    modeKey, mode, remaining, running, formatted, start, stop, reset, toggle, selectMode,
    musicId, music, setMusic, musicPlaying, toggleMusic, nextMusic, prevMusic,
    settings, cycle, durationOf, updateSettings, resetCycle,
  };
};
