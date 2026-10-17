/** Lời dịch cho các mã lỗi Firebase Auth hay gặp */
const AUTH_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "Email này đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu.",
  "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
  "auth/wrong-password": "Mật khẩu không đúng.",
  "auth/user-not-found": "Không tìm thấy tài khoản với email này.",
  "auth/invalid-email": "Email không hợp lệ.",
  "auth/weak-password": "Mật khẩu quá yếu, cần ít nhất 6 ký tự.",
  "auth/too-many-requests": "Thử sai quá nhiều lần, vui lòng đợi một lúc rồi thử lại.",
  "auth/popup-closed-by-user": "Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.",
  "auth/network-request-failed": "Mất kết nối mạng.",
};

/** Hiển thị lỗi cho người dùng bằng toast của Nuxt UI, kèm gợi ý cho các lỗi Firebase hay gặp. */
export const useErrorToast = () => {
  const toast = useToast();

  const showError = (title: string, error: unknown) => {
    console.error(title, error);
    const err = error as { code?: string; message?: string } | undefined;
    let description = err?.message || String(error);

    if (err?.code === "permission-denied") {
      description =
        "Permission denied by Firestore rules. Deploy firestore.rules and make sure you are signed in.";
    } else if (description === "User is not authenticated") {
      description = "Please sign in with Google first.";
    } else if (err?.code && err.code in AUTH_MESSAGES) {
      description = AUTH_MESSAGES[err.code] as string;
    }

    toast.add({
      title,
      description,
      color: "error",
      icon: "i-lucide-triangle-alert",
      duration: 6000,
    });
  };

  return { showError };
};
