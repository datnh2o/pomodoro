/** Mọi mốc "ngày" trong app tính theo giờ Việt Nam, bất kể máy đang ở múi giờ nào. */
export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";

// en-CA cho định dạng YYYY-MM-DD
const keyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const longFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: APP_TIMEZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Khóa ngày dạng YYYY-MM-DD theo giờ VN */
export const dateKey = (date: Date = new Date()): string => keyFormatter.format(date);
export const todayKey = (): string => dateKey();

/** Giờ HH:mm theo giờ VN của một thời điểm (mặc định: bây giờ) */
export const currentTimeHHmm = (date: Date = new Date()): string => timeFormatter.format(date);

const keyToUtcDate = (key: string): Date => new Date(`${key}T00:00:00Z`);

/** Thứ trong tuần của một khóa ngày: 0 = CN ... 6 = T7 */
export const weekdayOf = (key: string): number => keyToUtcDate(key).getUTCDay();

export const addDays = (key: string, days: number): string => {
  const d = keyToUtcDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const tomorrowKey = (): string => addDays(todayKey(), 1);
export const yesterdayKey = (): string => addDays(todayKey(), -1);

/** Liệt kê các khóa ngày từ `from` đến `to` (bao gồm cả hai đầu) */
export const dateRange = (from: string, to: string): string[] => {
  const keys: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) keys.push(k);
  return keys;
};

/** "Thứ Sáu, 17/10/2026" */
export const formatDateVi = (key: string): string => {
  const text = longFormatter.format(keyToUtcDate(key));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** "17/10" */
export const formatShortVi = (key: string): string => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

export const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export const formatMoney = (amount: number): string => `${amount.toLocaleString("vi-VN")} ₫`;
