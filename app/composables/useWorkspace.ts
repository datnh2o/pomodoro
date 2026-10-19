import { arrayRemove, arrayUnion, doc, getDoc, onSnapshot, setDoc, updateDoc, type Unsubscribe } from "firebase/firestore";
import {
  DEFAULT_REST_CUTOFF,
  DEFAULT_REST_LIMIT,
  OWNER_PERMISSIONS,
  foldPenaltyChanges,
  penaltySettingsOn,
  type MemberPermissions,
  type PenaltySettings,
  type Workspace,
} from "#shared/utils/models";
import { nextDayToClose } from "#shared/utils/penalty";
import { currentTimeHHmm, todayKey, tomorrowKey } from "#shared/utils/dates";

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

  /**
   * Đổi mức phạt / phạt tăng dần / mức thưởng. Chỉ có hiệu lực từ ngày mai (như đổi lịch nhiệm vụ chính),
   * để không hạ phạt ngay trước giờ chốt hôm nay. Thay đổi cũ mà các ngày trước nó đã chốt xong
   * thì gộp vào mức gốc cho gọn.
   */
  const updatePenaltySettings = async (patch: Partial<PenaltySettings>) => {
    const ws = workspace.value;
    if (!ws) return;
    const tomorrow = tomorrowKey();
    const folded = foldPenaltyChanges(ws, nextDayToClose(ws));
    const kept = folded.penaltyChanges.filter((c) => c.from < tomorrow);
    const current = penaltySettingsOn({ ...folded, penaltyChanges: kept }, tomorrow);
    const next = {
      amount: patch.amount ?? current.amount,
      escalation: patch.escalation ?? current.escalation,
      reward: patch.reward ?? current.reward,
    };
    const unchanged =
      next.amount === current.amount && next.escalation === current.escalation && next.reward === current.reward;
    await updateDoc(doc($firebase.firestore, "workspaces", ws.id), {
      ...folded,
      // Đổi về đúng mức đang áp dụng thì bỏ luôn thay đổi đang hẹn
      penaltyChanges: unchanged ? kept : [...kept, { from: tomorrow, ...next }],
    });
  };

  const updateEveningReminder = async (time: string | null) => {
    if (!workspace.value) return;
    await updateDoc(doc($firebase.firestore, "workspaces", workspace.value.id), {
      eveningReminderTime: time,
    });
  };

  /** Số ngày nghỉ đã khai trong tháng của `date` */
  const restDaysInMonth = (date: string) =>
    (workspace.value?.restDays ?? []).filter((d) => d.slice(0, 7) === date.slice(0, 7)).length;

  /**
   * Khai ngày nghỉ với ba ràng buộc chống lách: không khai lùi, hôm nay chỉ khai trước giờ
   * cắt (mặc định 10:00), và không quá hạn mức mỗi tháng (mặc định 3).
   */
  const addRestDay = async (date: string) => {
    const ws = workspace.value;
    if (!ws) return;
    const today = todayKey();
    if (date < today) throw new Error("Chỉ khai nghỉ cho hôm nay hoặc ngày sau, không khai lùi.");
    const cutoff = ws.restCutoffTime ?? DEFAULT_REST_CUTOFF;
    if (date === today && currentTimeHHmm() >= cutoff) {
      throw new Error(`Nghỉ hôm nay phải khai trước ${cutoff}. Giờ chỉ còn khai được cho ngày mai trở đi.`);
    }
    const limit = ws.restLimitPerMonth ?? DEFAULT_REST_LIMIT;
    if (restDaysInMonth(date) >= limit) {
      throw new Error(`Đã dùng hết ${limit} ngày nghỉ của tháng ${Number(date.slice(5, 7))}.`);
    }
    await updateDoc(doc($firebase.firestore, "workspaces", ws.id), { restDays: arrayUnion(date) });
  };

  /** Cập nhật các tùy chọn kỷ luật/nhắc nhở (chỉ owner, rules kiểm soát) */
  const updateSettings = async (
    patch: Partial<
      Pick<
        Workspace,
        | "restLimitPerMonth"
        | "restCutoffTime"
        | "morningReminderTime"
        | "supervisorEmail"
        | "weeklyReportTime"
      >
    >
  ) => {
    if (!workspace.value) return;
    await updateDoc(doc($firebase.firestore, "workspaces", workspace.value.id), { ...patch });
  };

  const removeRestDay = async (date: string) => {
    if (!workspace.value) return;
    if (date < todayKey()) throw new Error("Ngày đã qua không sửa được.");
    await updateDoc(doc($firebase.firestore, "workspaces", workspace.value.id), { restDays: arrayRemove(date) });
  };

  /** Cập nhật tên/email hiển thị của chính mình trong danh sách thành viên */
  const updateOwnMemberInfo = async (info: { displayName: string | null; email: string | null }) => {
    const ws = workspace.value;
    const uid = user.value?.uid;
    if (!ws || !uid || !ws.members[uid]) return;
    await updateDoc(doc($firebase.firestore, "workspaces", ws.id), {
      [`members.${uid}.displayName`]: info.displayName,
      [`members.${uid}.email`]: info.email,
    });
  };

  return {
    workspace, loading, permissions, isOwner, can, bind, unbind,
    updatePenaltySettings, updateEveningReminder, addRestDay, removeRestDay, updateOwnMemberInfo,
    restDaysInMonth, updateSettings,
  };
};
