/** Chữ cái đầu viết hoa của tên (hoặc email) để hiện thay ảnh đại diện; không có thì "?" */
export const initialOf = (...names: Array<string | null | undefined>): string => {
  const name = names.find((n) => n && n.trim())?.trim();
  return name ? name.charAt(0).toLocaleUpperCase("vi") : "?";
};
