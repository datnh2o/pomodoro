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
  const remaining = useState<number>("pomodoro:remaining", () => currentMode().duration);
  const running = useState<boolean>("pomodoro:running", () => false);
  const musicId = useState<string>("pomodoro:music", () => findMusicSource(readSavedMusic() ?? DEFAULT_MUSIC_SOURCE).id);
  const music = computed(() => findMusicSource(musicId.value));
  const toast = useToast();

  const formatted = computed(() => {
    const minutes = Math.floor(remaining.value / 60);
    const seconds = remaining.value % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  });

  // ---- Nhạc ----

  /** Đài trực tuyến lỗi (mất mạng, đài ngừng phát) khi đang chạy: báo và chuyển về bản có sẵn */
  const onMusicError = () => {
    const source = loadedSource();
    if (!source?.live || !running.value) return;
    toast.add({
      title: `Không phát được ${source.name}`,
      description: "Đã chuyển sang bản lofi có sẵn.",
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
    }
    if (loadedUrl !== source.url) {
      musicAudio.src = source.url;
      musicAudio.loop = !source.live;
      loadedUrl = source.url;
    }
    musicAudio.play().catch(() => {});
  };

  /** Dừng nhạc. Đài trực tuyến thì ngắt hẳn để không tốn dữ liệu; phát lại sẽ vào đúng lúc đài đang phát */
  const pauseMusic = () => {
    if (!musicAudio) return;
    musicAudio.pause();
    if (loadedSource()?.live) {
      loadedUrl = null;
      musicAudio.removeAttribute("src");
      musicAudio.load();
    }
  };

  /** Đổi nguồn nhạc (nhớ trên máy này); đồng hồ đang chạy thì phát luôn nguồn mới */
  const setMusic = (id: string) => {
    pauseMusic();
    musicId.value = findMusicSource(id).id;
    saveMusic(musicId.value);
    if (running.value) playMusic();
  };

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
    stop();
    remaining.value = currentMode().duration;
    // Bản có sẵn thì tua về đầu; đài trực tuyến đã ngắt khi dừng
    if (musicAudio && loadedSource()) musicAudio.currentTime = 0;
  };

  const start = () => {
    if (running.value) return;
    // Tính theo mốc thời gian kết thúc để không bị trôi khi tab nền bị throttle
    endTime = Date.now() + remaining.value * 1000;
    running.value = true;
    interval = setInterval(tick, 250);
    playMusic();
  };

  const toggle = () => (running.value ? stop() : start());

  /** Bấm chọn chế độ: đặt lại đồng hồ (không tự chạy). Bấm lại chế độ đang chọn thì bỏ qua. */
  const selectMode = (next: ModeKey) => {
    if (next === modeKey.value) return;
    setMode(next);
    reset();
  };

  /** Hết giờ: chuông, sang chế độ kế tiếp và tự chạy. Nhạc không dừng, không tua lại mà phát tiếp */
  const finish = () => {
    stopCountdown();
    alertSound ??= new Audio("/alert.mp3");
    alertSound.play().catch(() => {});
    setMode(currentMode().next);
    remaining.value = currentMode().duration;
    start();
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

  return { modeKey, mode, remaining, running, formatted, start, stop, reset, toggle, selectMode, musicId, music, setMusic };
};
