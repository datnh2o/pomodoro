import { MODES, type ModeKey } from "~/utils/modes";

/** Chế độ đang chọn (Pomodoro / Short Break / Long Break), dùng chung giữa layout và page. */
export const useMode = () => {
  const key = useState<ModeKey>("mode", () => "pomodoro");
  const mode = computed(() => MODES[key.value]);
  const setMode = (next: ModeKey) => {
    key.value = next;
  };
  return { key, mode, setMode };
};
