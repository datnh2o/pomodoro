import type { Config } from "tailwindcss";

// Bảng màu 3 chế độ của app:
//   DEFAULT: nền trang, light: nền thẻ timer, dark: tab đang chọn.
// Các class bg-*/text-* được khai báo đầy đủ trong app/utils/modes.ts để Tailwind quét được;
// safelist bên dưới là lớp bảo vệ thêm.
export default <Partial<Config>>{
  theme: {
    extend: {
      colors: {
        pomodoro: { DEFAULT: "#BA4949", light: "#C15F5E", dark: "#A75250" },
        short: { DEFAULT: "#38858A", light: "#509396", dark: "#447F82" },
        long: { DEFAULT: "#397097", light: "#5181A2", dark: "#456F8C" },
      },
    },
  },
  safelist: [{ pattern: /^(bg|text)-(pomodoro|short|long)(-light|-dark)?$/ }],
};
