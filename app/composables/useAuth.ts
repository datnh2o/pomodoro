import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";

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

  return {
    user,
    ready,
    isAuthenticated,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    signOut,
  };
};
