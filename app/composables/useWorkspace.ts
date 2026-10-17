import { arrayRemove, arrayUnion, doc, getDoc, onSnapshot, setDoc, updateDoc, type Unsubscribe } from "firebase/firestore";
import { OWNER_PERMISSIONS, type MemberPermissions, type Workspace } from "#shared/utils/models";
import { todayKey } from "#shared/utils/dates";

const DEFAULT_PENALTY = 10_000;

/**
 * Workspace (bảng nhiệm vụ) đang dùng. Mỗi người có workspace id = uid của mình;
 * tài khoản con dùng chung workspace của chủ sở hữu (users/{uid}.workspaceId).
 */
export const useWorkspace = () => {
  const { $firebase } = useNuxtApp();
  const { user } = useAuth();

  const workspace = useState<Workspace | null>("workspace", () => null);
  const loading = useState<boolean>("workspace:loading", () => true);
  const unsubscribe = useState<Unsubscribe | null>("workspace:unsub", () => null);

  const permissions = computed<MemberPermissions>(() => {
    const uid = user.value?.uid;
    const member = uid ? workspace.value?.members[uid] : undefined;
    return member ?? { view: false, add: false, edit: false };
  });
  const isOwner = computed(() => !!user.value && workspace.value?.ownerUid === user.value.uid);
  type Permission = "view" | "add" | "edit";
  const can = (perm: Permission): boolean => permissions.value[perm] === true;

  /** Tìm (hoặc tạo) workspace của người dùng rồi lắng nghe thay đổi. */
  const bind = async () => {
    const current = user.value;
    if (!current) return;
    unbind();
    loading.value = true;

    const userRef = doc($firebase.firestore, "users", current.uid);
    const userSnap = await getDoc(userRef);
    let workspaceId = (userSnap.data()?.workspaceId as string | undefined) ?? current.uid;

    // Đọc workspace đang trỏ tới. Nếu bị từ chối (đã bị gỡ khỏi bảng chung) thì quay về bảng riêng.
    let exists = false;
    try {
      exists = (await getDoc(doc($firebase.firestore, "workspaces", workspaceId))).exists();
    } catch (error) {
      if ((error as { code?: string }).code !== "permission-denied") throw error;
      workspaceId = current.uid;
      exists = (await getDoc(doc($firebase.firestore, "workspaces", workspaceId))).exists();
    }
    if (!exists) {
      // Lần đầu: tạo workspace riêng, bản thân là owner
      workspaceId = current.uid;
      await setDoc(doc($firebase.firestore, "workspaces", workspaceId), {
        ownerUid: current.uid,
        name: current.displayName ? `Nhiệm vụ của ${current.displayName}` : "Nhiệm vụ của tôi",
        timezone: "Asia/Ho_Chi_Minh",
        penaltyAmount: DEFAULT_PENALTY,
        penaltyTotal: 0,
        createdDate: todayKey(),
        lastClosedDate: null,
        shareToken: null,
        members: {
          [current.uid]: { ...OWNER_PERMISSIONS, displayName: current.displayName, email: current.email },
        },
      } satisfies Omit<Workspace, "id">);
    }

    await setDoc(
      userRef,
      {
        displayName: current.displayName,
        email: current.email,
        photoURL: current.photoURL,
        workspaceId,
      },
      { merge: true }
    );

    unsubscribe.value = onSnapshot(
      doc($firebase.firestore, "workspaces", workspaceId),
      (snap) => {
        workspace.value = snap.exists() ? ({ id: snap.id, ...snap.data() } as Workspace) : null;
        loading.value = false;
      },
      (error) => {
        console.error("workspace listener", error);
        loading.value = false;
      }
    );
  };

  const unbind = () => {
    unsubscribe.value?.();
    unsubscribe.value = null;
    workspace.value = null;
  };

  const updatePenaltyAmount = async (amount: number) => {
    if (!workspace.value) return;
    await updateDoc(doc($firebase.firestore, "workspaces", workspace.value.id), {
      penaltyAmount: amount,
    });
  };

  const updateEveningReminder = async (time: string | null) => {
    if (!workspace.value) return;
    await updateDoc(doc($firebase.firestore, "workspaces", workspace.value.id), {
      eveningReminderTime: time,
    });
  };

  /** Khai ngày nghỉ: chỉ hôm nay hoặc tương lai, để không khai lùi nhằm né phạt */
  const addRestDay = async (date: string) => {
    if (!workspace.value) return;
    if (date < todayKey()) throw new Error("Chỉ khai nghỉ cho hôm nay hoặc ngày sau, không khai lùi.");
    await updateDoc(doc($firebase.firestore, "workspaces", workspace.value.id), { restDays: arrayUnion(date) });
  };

  const removeRestDay = async (date: string) => {
    if (!workspace.value) return;
    if (date < todayKey()) throw new Error("Ngày đã qua không sửa được.");
    await updateDoc(doc($firebase.firestore, "workspaces", workspace.value.id), { restDays: arrayRemove(date) });
  };

  return {
    workspace, loading, permissions, isOwner, can, bind, unbind,
    updatePenaltyAmount, updateEveningReminder, addRestDay, removeRestDay,
  };
};
