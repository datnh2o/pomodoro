import { currentTimeHHmm, todayKey } from "#shared/utils/dates";

/** Giờ hiện tại HH:mm (giờ VN), cập nhật mỗi 30 giây bởi layout; dùng cho hạn giờ nhiệm vụ. */
export const useClock = () => {
  const nowHHmm = useState<string>("clock:hhmm", () => currentTimeHHmm());
  const tick = () => {
    nowHHmm.value = currentTimeHHmm();
  };
  return { nowHHmm, tick, todayKey };
};
