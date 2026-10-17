import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signOut, updateProfile } from "firebase/auth";
import { deleteField, doc, getFirestore, setDoc, updateDoc } from "firebase/firestore";
import type { MemberPermissions } from "#shared/utils/models";

export interface SubAccountInput {
  displayName: string;
  email: string;
  password: string;
  add: boolean;
  edit: boolean;
}

/** Quản lý thành viên của workspace (chỉ owner) và link chia sẻ chỉ đọc. */
export const useMembers = () => {
  const { $firebase } = useNuxtApp();
  const { workspace } = useWorkspace();
  const config = useRuntimeConfig().public.firebase;

  const wsRef = () => {
    const id = workspace.value?.id;
    if (!id) throw new Error("Chưa có workspace");
    return doc($firebase.firestore, "workspaces", id);
  };

  /** Danh sách thành viên, owner đứng đầu */
  const members = computed(() => {
    const ws = workspace.value;
    if (!ws) return [] as Array<{ uid: string; isOwner: boolean } & MemberPermissions>;
    return Object.entries(ws.members)
      .map(([uid, perms]) => ({ uid, isOwner: uid === ws.ownerUid, ...perms }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || (a.displayName ?? "").localeCompare(b.displayName ?? "", "vi"));
  });

  /**
   * Tạo tài khoản con (email + mật khẩu) dùng chung bảng này.
   * Dùng một Firebase app phụ để tạo user mà không làm owner bị đăng xuất; tài khoản mới
   * tự ghi users/{uid} (rules chỉ cho chính chủ), rồi owner thêm vào members.
   */
  const createSubAccount = async (input: SubAccountInput) => {
    const ws = workspace.value;
    if (!ws) throw new Error("Chưa có workspace");
    const secondary = initializeApp(config, `sub-account-${Date.now()}`);
    try {
      const auth = getAuth(secondary);
      const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
      const displayName = input.displayName.trim();
      await updateProfile(credential.user, { displayName });
      await setDoc(doc(getFirestore(secondary), "users", credential.user.uid), {
        displayName,
        email: credential.user.email,
        photoURL: null,
        workspaceId: ws.id,
      });
      await signOut(auth);
      await updateDoc(wsRef(), {
        [`members.${credential.user.uid}`]: {
          view: true,
          add: input.add,
          edit: input.edit,
          displayName,
          email: credential.user.email,
        } satisfies MemberPermissions,
      });
      return credential.user.uid;
    } finally {
      await deleteApp(secondary);
    }
  };

  const updateMember = async (uid: string, perms: Pick<MemberPermissions, "add" | "edit">) => {
    await updateDoc(wsRef(), {
      [`members.${uid}.add`]: perms.add,
      [`members.${uid}.edit`]: perms.edit,
    });
  };

  /** Gỡ khỏi bảng: lần đăng nhập sau họ sẽ tự quay về bảng riêng của mình */
  const removeMember = async (uid: string) => {
    await updateDoc(wsRef(), { [`members.${uid}`]: deleteField() });
  };

  // ---- Link chia sẻ ----
  const shareUrl = computed(() => {
    const token = workspace.value?.shareToken;
    if (!token || !import.meta.client) return null;
    return `${window.location.origin}/share/${token}`;
  });

  const enableShareLink = async () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await updateDoc(wsRef(), { shareToken: token });
  };

  const disableShareLink = async () => {
    await updateDoc(wsRef(), { shareToken: null });
  };

  return { members, createSubAccount, updateMember, removeMember, shareUrl, enableShareLink, disableShareLink };
};
