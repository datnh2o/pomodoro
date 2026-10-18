/** Hộp xác nhận dùng chung (thay confirm() của trình duyệt), render bởi <ConfirmDialog> trong app.vue */
export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Màu nút xác nhận: error cho hành động xóa */
  color?: "primary" | "error" | "neutral";
  icon?: string;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

export const useConfirm = () => {
  const state = useState<ConfirmState>("confirm:state", () => ({ open: false, title: "", resolve: null }));

  const confirmAction = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      state.value.resolve?.(false);
      state.value = { ...options, open: true, resolve };
    });

  const settle = (value: boolean) => {
    state.value.resolve?.(value);
    state.value = { ...state.value, open: false, resolve: null };
  };

  return { state, confirmAction, settle };
};
