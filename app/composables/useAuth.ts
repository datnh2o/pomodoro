import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Trạng thái đăng nhập + các hành động đăng nhập/đăng ký/đăng xuất.
 * `user`/`ready` được plugin firebase.client cập nhật qua onAuthStateChanged.
 */
export const useAuth = () => {
  const user = useState<AuthUser | null>("auth:user", () => null);
  const ready = useState<boolean>("auth:ready", () => false);
  const isAuthenticated = computed(() => !!user.value);

  const auth = () => useNuxtApp().$firebase.auth;

  const signInWithGoogle = async () => {
    await signInWithPopup(auth(), useNuxtApp().$firebase.googleProvider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth(), email.trim(), password);
  };

  const registerWithEmail = async (email: string, password: string, displayName: string) => {
    const credential = await createUserWithEmailAndPassword(auth(), email.trim(), password);
    if (displayName.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
      // Cập nhật state ngay vì onAuthStateChanged đã bắn trước khi có displayName
      user.value = {
        uid: credential.user.uid,
        displayName: displayName.trim(),
        email: credential.user.email,
        photoURL: credential.user.photoURL,
      };
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth(), email.trim());
  };

  const signOut = async () => {
    await firebaseSignOut(auth());
  };

  // ---- Hồ sơ ----

  /** Đồng bộ lại state từ Firebase (sau khi đổi tên/ảnh, onAuthStateChanged không bắn lại) */
  const refreshUser = async () => {
    const current = auth().currentUser;
    if (!current) return;
    await current.reload();
    const fresh = auth().currentUser;
    if (!fresh) return;
    user.value = { uid: fresh.uid, displayName: fresh.displayName, email: fresh.email, photoURL: fresh.photoURL };
    // Lưu bản sao vào users/{uid} để các màn khác và server dùng
    await setDoc(
      doc(useNuxtApp().$firebase.firestore, "users", fresh.uid),
      { displayName: fresh.displayName, email: fresh.email, photoURL: fresh.photoURL },
      { merge: true }
    );
  };

  /** Tài khoản đăng nhập bằng mật khẩu (khác Google) */
  const usesPassword = () =>
    !!auth().currentUser?.providerData.some((p) => p.providerId === EmailAuthProvider.PROVIDER_ID);

  /** Firebase đòi đăng nhập lại cho thao tác nhạy cảm (đổi email) */
  const reauthenticate = async (currentPassword?: string) => {
    const current = auth().currentUser;
    if (!current) throw new Error("User is not authenticated");
    if (usesPassword()) {
      if (!current.email || !currentPassword) throw new Error("Nhập mật khẩu hiện tại để xác nhận.");
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, currentPassword));
    } else {
      await reauthenticateWithPopup(current, useNuxtApp().$firebase.googleProvider);
    }
  };

  const updateDisplayName = async (displayName: string) => {
    const current = auth().currentUser;
    if (!current) throw new Error("User is not authenticated");
    await updateProfile(current, { displayName: displayName.trim() });
  };

  /**
   * Ảnh đại diện Google của tài khoản: lấy từ nhà cung cấp Google đã gắn; chưa gắn thì mở cửa sổ
   * liên kết Google (cùng email) rồi lấy ảnh. Trả về null nếu Google không có ảnh.
   */
  const googlePhotoURL = async (): Promise<string | null> => {
    const current = auth().currentUser;
    if (!current) throw new Error("User is not authenticated");
    let google = current.providerData.find((p) => p.providerId === GoogleAuthProvider.PROVIDER_ID);
    if (!google) {
      const result = await linkWithPopup(current, useNuxtApp().$firebase.googleProvider);
      google = result.user.providerData.find((p) => p.providerId === GoogleAuthProvider.PROVIDER_ID);
    }
    // Google trả ảnh 96px (=s96-c); xin cỡ lớn hơn cho avatar
    return google?.photoURL?.replace(/=s\d+-c$/, "=s400-c") ?? null;
  };

  const updatePhotoURL = async (photoURL: string) => {
    const current = auth().currentUser;
    if (!current) throw new Error("User is not authenticated");
    await updateProfile(current, { photoURL });
  };

  /**
   * Đổi email: Firebase gửi link xác minh tới email mới, địa chỉ chỉ đổi sau khi bấm link.
   * Nếu phiên đăng nhập cũ, xác thực lại rồi thử lại.
   */
  const changeEmail = async (newEmail: string, currentPassword?: string) => {
    const current = auth().currentUser;
    if (!current) throw new Error("User is not authenticated");
    try {
      await verifyBeforeUpdateEmail(current, newEmail.trim());
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/requires-recent-login") throw error;
      await reauthenticate(currentPassword);
      await verifyBeforeUpdateEmail(current, newEmail.trim());
    }
  };

  return {
    user,
    ready,
    isAuthenticated,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    signOut,
    refreshUser,
    usesPassword,
    updateDisplayName,
    googlePhotoURL,
    updatePhotoURL,
    changeEmail,
  };
};
