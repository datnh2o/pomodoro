import { weekdayOf } from "./dates";

export interface MemberPermissions {
  view: boolean;
  add: boolean;
  edit: boolean;
  /** Thông tin hiển thị, ghi lúc thêm thành viên (users/{uid} chỉ chính chủ đọc được) */
  displayName?: string | null;
  email?: string | null;
}

export interface Workspace {
  id: string;
  ownerUid: string;
  name: string;
  timezone: string;
  /**
   * Tiền phạt mỗi nhiệm vụ chính bỏ lỡ (VND), trước các thay đổi trong `penaltyChanges`.
   * Mức áp dụng cho một ngày cụ thể: penaltySettingsOn(ws, date).
   */
  penaltyAmount: number;
  /** Đổi mức phạt / phạt tăng dần đã hẹn, mỗi mục có hiệu lực từ `from` (luôn là ngày mai lúc đổi) */
  penaltyChanges?: PenaltyChange[];
  /** Tổng nợ cộng dồn từ các ngày đã chốt */
  penaltyTotal: number;
  /** Tiền thưởng khi xong hết nhiệm vụ chính trong ngày (mặc định DEFAULT_REWARD), trước `penaltyChanges` */
  rewardAmount?: number;
  /** Tổng thưởng cộng dồn từ các ngày đã chốt */
  rewardTotal?: number;
  /** Số ngày đã chốt có thưởng, tức số rương đã mở (tính cấp độ) */
  rewardDays?: number;
  /** Ngày bắt đầu tính (YYYY-MM-DD) */
  createdDate: string;
  /** Ngày cuối cùng đã chốt, null nếu chưa chốt ngày nào */
  lastClosedDate: string | null;
  members: Record<string, MemberPermissions>;
  /** Mã link chia sẻ chỉ đọc (/share/{token}); null = tắt */
  shareToken?: string | null;
  /** Giờ nhắc cuối ngày (HH:mm) nếu còn nhiệm vụ chính chưa xong; mặc định 21:00 */
  eveningReminderTime?: string | null;
  /** Giờ nhắc buổi sáng liệt kê việc hôm nay; null = tắt. Mặc định 07:00 */
  morningReminderTime?: string | null;
  /** Phạt tăng dần khi lỡ nhiều ngày liên tiếp (mặc định bật) */
  penaltyEscalation?: boolean;
  /** Số ngày lỡ liên tiếp tính đến ngày đã chốt gần nhất */
  missStreak?: number;
  /** Giới hạn ngày nghỉ mỗi tháng (mặc định 3) */
  restLimitPerMonth?: number;
  /** Chỉ được khai nghỉ hôm nay trước giờ này (mặc định 10:00) */
  restCutoffTime?: string;
  /** Email người giám sát nhận tổng kết tuần; null = tắt */
  supervisorEmail?: string | null;
  /** Giờ gửi tổng kết tuần vào Chủ nhật (mặc định 20:00) */
  weeklyReportTime?: string;
  /** Khóa tuần đã gửi gần nhất, tránh gửi trùng */
  lastWeeklyReportKey?: string | null;
  /**
   * Chế độ nghỉ: các ngày (YYYY-MM-DD) không tính nhiệm vụ chính, không phạt, không đứt chuỗi.
   * Chỉ được thêm cho hôm nay hoặc tương lai (không khai nghỉ lùi để tránh né phạt).
   */
  restDays?: string[];
}

/** Thưởng mặc định khi xong hết nhiệm vụ chính trong ngày (VND) */
export const DEFAULT_REWARD = 10_000;

export interface PenaltyChange {
  /** Có hiệu lực từ ngày này (YYYY-MM-DD) */
  from: string;
  amount: number;
  escalation: boolean;
  /** Mức thưởng (bản ghi cũ trước khi có thưởng thì không có: giữ mức trước đó) */
  reward?: number;
}

/** Mức phạt, phạt tăng dần và mức thưởng của một ngày */
export interface PenaltySettings {
  amount: number;
  escalation: boolean;
  reward: number;
}

type PenaltyFields = Pick<Workspace, "penaltyAmount" | "penaltyEscalation" | "rewardAmount" | "penaltyChanges">;

/** Mức phạt, phạt tăng dần và mức thưởng áp dụng cho ngày `date` */
export const penaltySettingsOn = (ws: PenaltyFields, date: string): PenaltySettings => {
  let settings: PenaltySettings = {
    amount: ws.penaltyAmount,
    escalation: ws.penaltyEscalation ?? true,
    reward: ws.rewardAmount ?? DEFAULT_REWARD,
  };
  const changes = [...(ws.penaltyChanges ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  for (const change of changes) {
    if (change.from > date) break;
    settings = { amount: change.amount, escalation: change.escalation, reward: change.reward ?? settings.reward };
  }
  return settings;
};

/**
 * Gộp các thay đổi mức phạt không còn cần lưu riêng vào mức gốc. `firstOpenDate` là ngày sớm nhất
 * chưa chốt: mọi ngày trước đó đã chốt xong nên thay đổi có hiệu lực tới ngày này gộp được.
 */
export const foldPenaltyChanges = (ws: PenaltyFields, firstOpenDate: string) => {
  const base = penaltySettingsOn(ws, firstOpenDate);
  return {
    penaltyAmount: base.amount,
    penaltyEscalation: base.escalation,
    rewardAmount: base.reward,
    penaltyChanges: (ws.penaltyChanges ?? []).filter((c) => c.from > firstOpenDate),
  };
};

export const isRestDay = (restDays: string[] | undefined, date: string): boolean =>
  !!restDays && restDays.includes(date);

export const DEFAULT_EVENING_REMINDER = "21:00";
export const DEFAULT_MORNING_REMINDER = "07:00";
export const DEFAULT_REST_LIMIT = 3;
export const DEFAULT_REST_CUTOFF = "10:00";
export const DEFAULT_WEEKLY_REPORT_TIME = "20:00";
/** Nhắc trước hạn bao nhiêu phút */
export const DEADLINE_WARNING_MINUTES = 30;

/** Đăng ký Web Push của một thiết bị (workspaces/{ws}/pushSubscriptions/{id}) */
export interface PushSubscriptionDoc {
  uid: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  createdAt: number;
}

export interface Proof {
  url: string;
  publicId: string;
  takenAt: number;
  /** MD5 từ Cloudinary, để phát hiện nộp lại ảnh cũ */
  etag?: string;
}

export interface Completion {
  at: number;
  byUid: string;
  proofs: Proof[];
}

export interface DayDoc {
  date: string;
  completions: Record<string, Completion>;
  closed: boolean;
  missedTaskIds: string[];
  penalty: number;
  closedAt?: number;
  /** Ngày này được khai nghỉ lúc chốt */
  rest?: boolean;
  /** Hệ số phạt tăng dần đã áp dụng */
  multiplier?: number;
  /** Tiền thưởng lúc chốt: xong hết nhiệm vụ chính của ngày (ngày trước khi có thưởng thì không có) */
  reward?: number;
  /** Lúc chủ sở hữu mở rương của ngày (ms), đồng bộ mọi thiết bị. Chỉ là hiệu ứng: thưởng tính lúc chốt */
  chestOpenedAt?: number;
}

export interface MainTask {
  id: string;
  type: "main";
  title: string;
  note: string;
  requiresProof: boolean;
  /** Các thứ lặp lại: 0 = CN ... 6 = T7 */
  weekdays: number[];
  /** Giờ nhắc HH:mm, null nếu không nhắc */
  reminderTime: string | null;
  /** Hạn hoàn thành HH:mm trong ngày; quá giờ là không tích được nữa. null = tới hết ngày */
  deadlineTime?: string | null;
  /** Có hiệu lực từ ngày (YYYY-MM-DD) */
  effectiveFrom: string;
  /** Hết hiệu lực từ ngày này (không tính ngày này), null = còn hiệu lực */
  endsOn: string | null;
  /** Nối các phiên bản của cùng một nhiệm vụ (khi sửa lịch tạo bản mới) */
  lineageId: string;
  order: number;
  createdBy: string;
  createdAt: number;
}

export interface SideTask {
  id: string;
  type: "side";
  title: string;
  note: string;
  /** Cần ảnh chứng minh khi tích (không liên quan tiền phạt) */
  requiresProof: boolean;
  /** Giờ nhắc HH:mm, nhắc mỗi ngày cho tới khi xong */
  reminderTime: string | null;
  /** Ngày tạo; chưa xong thì tự hiện lại các ngày sau */
  createdDate: string;
  doneDate: string | null;
  doneAt: number | null;
  doneBy?: string | null;
  proofs?: Proof[];
  createdBy: string;
  createdAt: number;
  /** Server đã gửi nhắc đẩy "được giao việc" cho các thành viên khác (null = chưa) */
  assignNotifiedAt?: number | null;
}

/** Nhiệm vụ phụ mới tạo trong vòng N phút được coi là "vừa được giao" */
export const ASSIGN_NOTIFY_WINDOW_MS = 10 * 60_000;

/** Điền mặc định cho tài liệu nhiệm vụ phụ cũ (trước khi có ảnh/giờ nhắc) */
export const normalizeTask = (task: Task): Task => {
  if (task.type !== "side") return task;
  const raw = task as Partial<SideTask> & { id: string; type: "side" };
  return {
    ...task,
    note: raw.note ?? "",
    requiresProof: raw.requiresProof ?? false,
    reminderTime: raw.reminderTime ?? null,
    proofs: raw.proofs ?? [],
  };
};

/** Một việc có thể nhắc giờ: nhiệm vụ chính hoặc phụ */
export interface ReminderTarget {
  id: string;
  title: string;
  requiresProof: boolean;
  reminderTime: string | null;
}

/** Nhiệm vụ phụ còn hiện trong ngày `date` (chưa xong, tạo từ ngày đó trở về trước) */
/** Giờ "đến lượt" của một việc (xếp thứ tự, chia buổi): giờ nhắc (lúc định làm), không có thì hạn giờ */
export const slotTimeOf = (task: MainTask | SideTask): string | null =>
  task.reminderTime || (task.type === "main" ? task.deadlineTime || null : null);

export const isSidePendingOn = (task: SideTask, date: string): boolean =>
  task.doneDate === null && task.createdDate <= date;

export type Task = MainTask | SideTask;

export const isMainTask = (task: Task): task is MainTask => task.type === "main";
export const isSideTask = (task: Task): task is SideTask => task.type === "side";

/** Nhiệm vụ chính đã quá hạn trong ngày (so với giờ HH:mm hiện tại) */
export const isPastDeadline = (task: MainTask, nowHHmm: string): boolean =>
  !!task.deadlineTime && nowHHmm > task.deadlineTime;

/** Nhiệm vụ chính có được lên lịch vào ngày `date` không */
export const isScheduledOn = (task: MainTask, date: string): boolean =>
  task.effectiveFrom <= date &&
  (task.endsOn === null || task.endsOn > date) &&
  task.weekdays.includes(weekdayOf(date));

/** Nhiệm vụ chính còn hiệu lực (hoặc sắp có hiệu lực) tính từ ngày `date` */
export const isActiveFrom = (task: MainTask, date: string): boolean =>
  task.endsOn === null || task.endsOn > date;

export const OWNER_PERMISSIONS: MemberPermissions = { view: true, add: true, edit: true };
