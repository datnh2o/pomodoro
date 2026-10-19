export type ModeKey = "pomodoro" | "short" | "long";

export interface Mode {
  key: ModeKey;
  name: string;
  /** Thời lượng mặc định tính bằng giây (người dùng đổi được trong cài đặt Pomodoro) */
  duration: number;
  /** Có hiện nút bỏ qua (skip) khi đang chạy không */
  skippable: boolean;
  /** Class Tailwind — viết đầy đủ để Tailwind quét được (xem tailwind.config.ts) */
  bg: string;
  bgCard: string;
  bgActive: string;
  text: string;
}

export const MODES: Record<ModeKey, Mode> = {
  pomodoro: {
    key: "pomodoro",
    name: "Pomodoro",
    duration: 25 * 60,
    skippable: true,
    bg: "bg-pomodoro",
    bgCard: "bg-pomodoro-light",
    bgActive: "bg-pomodoro-dark",
    text: "text-pomodoro",
  },
  short: {
    key: "short",
    name: "Short Break",
    duration: 5 * 60,
    skippable: true,
    bg: "bg-short",
    bgCard: "bg-short-light",
    bgActive: "bg-short-dark",
    text: "text-short",
  },
  long: {
    key: "long",
    name: "Long Break",
    duration: 15 * 60,
    skippable: false,
    bg: "bg-long",
    bgCard: "bg-long-light",
    bgActive: "bg-long-dark",
    text: "text-long",
  },
};

export const MODE_LIST: Mode[] = Object.values(MODES);
