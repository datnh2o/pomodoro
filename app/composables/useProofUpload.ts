import type { Proof } from "#shared/utils/models";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/** Tải ảnh chứng minh lên Cloudinary bằng unsigned upload preset (không cần server). */
export const useProofUpload = () => {
  const config = useRuntimeConfig().public.cloudinary;

  const isConfigured = computed(() => !!config.cloudName && !!config.uploadPreset);

  /** Thu nhỏ ảnh trước khi tải để tiết kiệm dung lượng; lỗi (vd. HEIC trên desktop) thì gửi ảnh gốc. */
  const compress = async (file: File): Promise<Blob> => {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      return blob ?? file;
    } catch {
      return file;
    }
  };

  const upload = async (file: File, subfolder: string): Promise<Proof> => {
    if (!isConfigured.value) {
      throw new Error(
        "Chưa cấu hình Cloudinary. Điền NUXT_PUBLIC_CLOUDINARY_CLOUD_NAME và NUXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET."
      );
    }
    const body = new FormData();
    body.append("file", await compress(file), "proof.jpg");
    body.append("upload_preset", config.uploadPreset);
    body.append("folder", `${config.folder}/${subfolder}`);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error?.message ?? `Tải ảnh thất bại (HTTP ${response.status})`);
    }
    const data = (await response.json()) as { secure_url: string; public_id: string; etag?: string };
    return { url: data.secure_url, publicId: data.public_id, takenAt: Date.now(), etag: data.etag };
  };

  /** URL ảnh thu nhỏ vuông qua transformation của Cloudinary */
  const thumbnailUrl = (url: string, size = 160) =>
    url.replace("/upload/", `/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`);

  /** URL xem ảnh đầy đủ có đóng dấu giờ chụp ở góc (overlay của Cloudinary, không sửa ảnh gốc) */
  const proofViewUrl = (proof: Proof) => {
    const d = new Date(proof.takenAt);
    const stamp = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    // Cloudinary yêu cầu mã hóa hai lần các ký tự đặc biệt trong text overlay
    const text = encodeURIComponent(encodeURIComponent(stamp));
    return proof.url.replace("/upload/", `/upload/q_auto,f_auto/l_text:Arial_36_bold:${text},co_white,bo_6px_solid_rgb:00000080,b_rgb:00000080,g_south_east,x_16,y_16/`);
  };

  return { isConfigured, upload, thumbnailUrl, proofViewUrl };
};
