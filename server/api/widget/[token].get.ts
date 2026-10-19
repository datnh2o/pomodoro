import { useAdminDb } from "../../utils/adminDb";
import { loadWidgetData } from "../../lib/widget";

/**
 * Dữ liệu gọn cho widget màn hình chính (script Scriptable trên iPhone), dùng mã link chia sẻ chỉ đọc.
 * Khác /api/share: chỉ đọc ~10 tài liệu mỗi lần vì widget tự làm mới nhiều lần mỗi ngày (gói Spark).
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  if (!/^[a-f0-9]{32}$/.test(token)) {
    throw createError({ statusCode: 404, statusMessage: "Mã không hợp lệ" });
  }
  const data = await loadWidgetData(useAdminDb(), token);
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "Link chia sẻ không tồn tại hoặc đã bị tắt" });
  }
  setHeader(event, "Cache-Control", "public, max-age=60");
  return data;
});
