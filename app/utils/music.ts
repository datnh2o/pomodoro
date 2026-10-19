export interface MusicSource {
  id: string;
  name: string;
  /** null = tắt nhạc */
  url: string | null;
  /** Đài phát trực tuyến 24/7 (khác bản nhạc đi kèm app trong public/) */
  live: boolean;
  /** Trang của đài, để ghi nguồn */
  homepage?: string;
}

/**
 * Nhạc khi chạy Pomodoro. Các đài lofi lấy từ danh bạ Radio Browser (radio-browser.info),
 * chỉ giữ link HTTPS và đã thử phát được trong trình duyệt (2026-10-19). Đài là của bên thứ ba,
 * có thể đổi link hoặc ngừng phát: khi lỗi app tự chuyển về bản có sẵn.
 */
export const MUSIC_SOURCES: MusicSource[] = [
  { id: "local", name: "Bản lofi có sẵn", url: "/lofi.mp3", live: false },
  { id: "reyfm", name: "REYFM #lofi", url: "https://listen.reyfm.de/lofi_128kbps.mp3", live: true, homepage: "https://www.reyfm.de/" },
  { id: "ilovechillhop", name: "I Love Chillhop", url: "https://ilm.stream12.radiohost.de/ilm_ilovechillhop_mp3-192", live: true, homepage: "https://www.ilovemusic.de/ilovechillhop/" },
  { id: "lautfm", name: "laut.fm lofi", url: "https://stream.laut.fm/lofi", live: true, homepage: "https://laut.fm/lofi" },
  { id: "0nlineradio", name: "0nlineradio Lo-Fi", url: "https://stream.0nlineradio.com/lo-fi", live: true, homepage: "https://0nlineradio.com/" },
  { id: "hotmix", name: "Hotmix Lo-Fi", url: "https://streaming.hotmixradio.com/hotmix-lofi-en-mp3", live: true, homepage: "https://hotmixradio.com/" },
  { id: "litt", name: "LITT Live Lofi Jazz", url: "https://das-sa39.cdnstream1.com/5582_128", live: true, homepage: "https://littlive.com/" },
  { id: "hunter", name: "Hunter.fm Lo-Fi", url: "https://live.hunter.fm/lofi_high", live: true, homepage: "https://hunter.fm/lofi/" },
  { id: "isekoi", name: "ISEKOI Chill Zone", url: "https://public.isekoi-radio.com/listen/chill/radio.mp3", live: true, homepage: "https://isekoi-radio.com/" },
  { id: "off", name: "Tắt nhạc", url: null, live: false },
];

export const DEFAULT_MUSIC_SOURCE = "local";

export const findMusicSource = (id: string | null | undefined): MusicSource =>
  MUSIC_SOURCES.find((s) => s.id === id) ?? MUSIC_SOURCES[0]!;
