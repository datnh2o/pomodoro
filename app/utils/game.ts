/** Cấp độ theo số rương đã mở (số ngày xong hết nhiệm vụ chính). `from` = số rương để lên cấp đó. */
const LEVELS = [
  { from: 0, title: "Tân binh" },
  { from: 3, title: "Khởi động" },
  { from: 7, title: "Chăm chỉ" },
  { from: 14, title: "Kiên trì" },
  { from: 30, title: "Bền bỉ" },
  { from: 60, title: "Kỷ luật thép" },
  { from: 100, title: "Chiến binh" },
  { from: 180, title: "Bậc thầy" },
  { from: 365, title: "Huyền thoại" },
] as const;

export interface LevelInfo {
  /** Bắt đầu từ 1 */
  level: number;
  title: string;
  chests: number;
  /** Số rương cần để lên cấp kế tiếp; null nếu đã cấp cao nhất */
  nextAt: number | null;
  /** Tiến độ trong cấp hiện tại, 0..1 */
  progress: number;
}

export const levelOf = (chests: number): LevelInfo => {
  let index = 0;
  while (index + 1 < LEVELS.length && chests >= LEVELS[index + 1]!.from) index++;
  const current = LEVELS[index]!;
  const next = LEVELS[index + 1];
  return {
    level: index + 1,
    title: current.title,
    chests,
    nextAt: next?.from ?? null,
    progress: next ? (chests - current.from) / (next.from - current.from) : 1,
  };
};

/** Tiếng "ting ting" nhặt xu, tổng hợp bằng Web Audio (không cần file); gọi trong cử chỉ người dùng */
export const playCoinSound = () => {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes: [number, number][] = [
      [988, 0],
      [1319, 0.08],
      [1760, 0.2],
    ];
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.3);
    }
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    /* không có âm thanh cũng không sao */
  }
};
