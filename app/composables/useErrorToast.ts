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
    } else if (err?.code === "auth/popup-closed-by-user") {
      description = "The sign-in popup was closed before finishing.";
    }

    toast.add({
      title,
      description,
      color: "red",
      icon: "i-heroicons-exclamation-triangle",
      timeout: 6000,
    });
  };

  return { showError };
};
