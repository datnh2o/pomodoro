import { doc, getDoc, onSnapshot, setDoc, updateDoc, type Unsubscribe } from "firebase/firestore";
import { OWNER_PERMISSIONS, type MemberPermissions, type Workspace } from "~/utils/models";
import { todayKey } from "~/utils/dates";

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
  const can = (perm: keyof MemberPermissions) => permissions.value[perm];

  /** Tìm (hoặc tạo) workspace của người dùng rồi lắng nghe thay đổi. */
  const bind = async () => {
    const current = user.value;
    if (!current) return;
    unbind();
    loading.value = true;

    const userRef = doc($firebase.firestore, "users", current.uid);
    const userSnap = await getDoc(userRef);
    let workspaceId = (userSnap.data()?.workspaceId as string | undefined) ?? current.uid;

    const wsRef = doc($firebase.firestore, "workspaces", workspaceId);
    const wsSnap = await getDoc(wsRef);
    if (!wsSnap.exists()) {
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
        members: { [current.uid]: OWNER_PERMISSIONS },
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

  return { workspace, loading, permissions, isOwner, can, bind, unbind, updatePenaltyAmount };
};
