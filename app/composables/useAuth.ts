import { signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Trạng thái đăng nhập + hành động đăng nhập/đăng xuất.
 * `user`/`ready` được plugin firebase.client cập nhật qua onAuthStateChanged.
 */
export const useAuth = () => {
  const user = useState<AuthUser | null>("auth:user", () => null);
  const ready = useState<boolean>("auth:ready", () => false);
  const isAuthenticated = computed(() => !!user.value);

  const signInWithGoogle = async () => {
    const { $firebase } = useNuxtApp();
    await signInWithPopup($firebase.auth, $firebase.googleProvider);
  };

  const signOut = async () => {
    const { $firebase } = useNuxtApp();
    await firebaseSignOut($firebase.auth);
  };

  return { user, ready, isAuthenticated, signInWithGoogle, signOut };
};
