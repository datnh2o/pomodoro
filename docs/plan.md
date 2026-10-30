# Kế hoạch v2 — Nhiệm vụ hằng ngày

Mục tiêu: app liệt kê nhiệm vụ hằng ngày, tích hoàn thành (có ảnh chứng minh khi cần),
phạt 10k mỗi nhiệm vụ chính bỏ lỡ, tổng hợp theo tuần/tháng/năm. Dùng chủ yếu trên iPhone.
Stack giữ nguyên: Nuxt 4 + Nuxt UI 4 + Firebase (Auth, Firestore).

## 1. Khái niệm

| Khái niệm | Mô tả |
|---|---|
| Workspace | Một "bảng" nhiệm vụ. Mỗi người có 1 workspace của mình; có thể mời tài khoản con vào với quyền xem / thêm / sửa. |
| Nhiệm vụ chính | Lặp theo các thứ trong tuần cấu hình sẵn (có thể gồm T7, CN). Bỏ lỡ bị phạt. Có thể yêu cầu ảnh, có thể có giờ nhắc. |
| Nhiệm vụ phụ | Thêm tay hoặc bằng giọng nói. Không phạt. Có cùng tùy chọn như nhiệm vụ chính: ghi chú, cần ảnh chứng minh, giờ nhắc (nhắc mỗi ngày tới khi xong). Chưa xong thì tự hiện lại ngày hôm sau cho tới khi xong (dồn mãi). |
| Hoàn thành | Ghi nhận theo ngày (chỉ chủ sở hữu tích nhiệm vụ chính). Tích nhầm: bấm "Hoàn tác" trong thông báo (12 giây) hoặc "Bỏ tích" ở Nhật ký > hôm nay, trước khi chốt. |
| Chốt ngày | 00:00 giờ Việt Nam, không ân hạn. Khi chốt: đếm nhiệm vụ chính của ngày chưa xong × 10k → ghi vào sổ phạt. |
| Sổ phạt | Chỉ cần tổng nợ, cộng dồn từ các ngày đã chốt. |

## 2. Dữ liệu (Firestore)

```
users/{uid}                     { displayName, email, photoURL, workspaceId }
workspaces/{wsId}               { ownerUid, name, timezone: "Asia/Ho_Chi_Minh", penaltyAmount: 10000,
                                  members: { [uid]: { view: true, add: bool, edit: bool } } }
workspaces/{wsId}/tasks/{id}    { type: "main" | "side", title, note,
                                  requiresProof: bool,
                                  weekdays: [0..6]          // main: các thứ lặp lại (0 = CN)
                                  reminderTime: "HH:mm"     // main, tùy chọn: giờ phải đi làm
                                  effectiveFrom: "YYYY-MM-DD" // main: sửa/xóa chỉ có hiệu lực từ ngày mai
                                  createdDate: "YYYY-MM-DD" // side: ngày tạo (để hiện "dồn từ")
                                  doneAt: timestamp|null    // side: xong là ẩn
                                  order, active, createdBy, createdAt }
workspaces/{wsId}/days/{YYYY-MM-DD}
                                { completions: { [taskId]: { at, byUid, proofs: [{ url, id, takenAt }] } },
                                  closed: bool, missedTaskIds: [], penalty: number, closedAt }
workspaces/{wsId}/pushSubscriptions/{id}   { endpoint, keys, uid, createdAt }   // Phase 4
shareLinks/{token}              { wsId, createdBy, createdAt }                   // Phase 3
```

Ghi chú:
- Nhiệm vụ phụ không cần "chuyển ngày" bằng cách ghi dữ liệu: màn Hôm nay luôn hiện mọi
  nhiệm vụ phụ chưa xong có `createdDate <= hôm nay`, kèm nhãn "dồn từ 15/10". Không ghi gì
  thêm nên chạy tốt cả khi ngoại tuyến.
- Chốt ngày tính "lười" ở client: mỗi lần mở app, duyệt các ngày trước hôm nay chưa `closed`,
  tính phạt và ghi `days/{date}`. Khi có server chạy 24/7 (Phase 4) thì server chốt thay.
- Sổ phạt = tổng `penalty` của các `days` đã `closed`; dashboard tính từ cùng dữ liệu này.
- Ảnh lưu ở dịch vụ ngoài (xem mục 5), Firestore chỉ giữ URL.

Quyền (firestore.rules): đọc nếu là member có `view`; tạo completion/side task nếu `add`;
sửa/xóa task chính, cấu hình workspace nếu `edit`; owner toàn quyền và quản lý members.

## 3. Màn hình (thanh tab dưới, kiểu iPhone)

1. **Hôm nay** — tiêu đề ngày, thanh tiến độ, số tiền "đang có nguy cơ mất" (nhiệm vụ chính
   chưa xong × 10k). Danh sách nhiệm vụ chính (icon máy ảnh nếu cần ảnh, giờ nhắc nếu có),
   rồi nhiệm vụ phụ (nhãn dồn từ ngày). Chạm để hoàn thành: cần ảnh thì mở sheet chụp/chọn
   ảnh (nhiều ảnh), không thì tích luôn. Ô thêm nhiệm vụ phụ: gõ hoặc bấm mic (tiếng Việt).
2. **Nhật ký** — lịch tháng dạng heatmap theo tỷ lệ hoàn thành; chạm một ngày xem nhiệm vụ và ảnh.
3. **Tổng hợp** — chọn tuần / tháng / năm: tổng tiền phạt, tỷ lệ ngày hoàn thành đủ nhiệm vụ
   chính, streak hiện tại và dài nhất theo từng nhiệm vụ, nhiệm vụ hay bỏ lỡ nhất.
4. **Pomodoro** — đồng hồ hiện tại, giữ nguyên.
5. **Cài đặt** — nhiệm vụ chính (thêm/sửa, chọn thứ, cần ảnh, giờ nhắc), mức phạt, thành viên
   và quyền, link chia sẻ, thông báo, tài khoản (đổi mật khẩu, đăng xuất).
6. **Đăng nhập** — email + mật khẩu, kèm Google. Owner tạo tài khoản con trong Cài đặt.

## 4. Lộ trình

| Phase | Nội dung | Phụ thuộc |
|---|---|---|
| 1 Lõi | Đăng nhập email/mật khẩu, workspace, nhiệm vụ chính + phụ, màn Hôm nay, chụp/tải ảnh chứng minh, chốt ngày + tổng nợ, Cài đặt nhiệm vụ chính, tab Pomodoro, PWA (thêm ra màn hình chính) | tài khoản lưu ảnh |
| 2 Tổng hợp | Dashboard tuần/tháng/năm, Nhật ký ảnh, heatmap, streak | Phase 1 |
| 3 Cộng tác | Giọng nói (Web Speech API, vi-VN), thành viên + quyền, tài khoản con, link chia sẻ chỉ đọc | Phase 1, server cho link chia sẻ |
| 4 Nhắc & ngoại tuyến | Web Push đúng giờ nhiệm vụ (server Nitro + VAPID + cron mỗi phút), cảnh báo cuối ngày, hàng đợi tải ảnh khi mất mạng | server chạy 24/7 |

## 5. Quyết định đã chốt (2026-10-17)

- Ảnh: **Cloudinary** (unsigned upload preset, không cần server). Tài khoản: **email + mật khẩu** (Firebase Auth, kèm Google).
- Tài khoản con **dùng chung một bảng** với chủ sở hữu, phân quyền xem / thêm / sửa. Deploy lên **Netlify**.
- App chạy **SPA** (`ssr: false`): mọi thứ sau đăng nhập, không cần SSR; Nitro vẫn có cho API/scheduled functions.
- Nhắc đẩy (Phase 4): Netlify Scheduled Function mỗi phút + Web Push (VAPID) + firebase-admin đọc giờ nhắc.

### Trạng thái Phase 1 (xong, chưa thử trên trình duyệt thật)
Đăng nhập email/mật khẩu + Google, workspace tự tạo, nhiệm vụ chính (thứ lặp, cần ảnh, giờ nhắc,
sửa lịch hiệu lực từ ngày mai), nhiệm vụ phụ (gõ hoặc nói, tự dồn ngày), màn Hôm nay, tải ảnh
chứng minh lên Cloudinary (nén trước), chốt ngày + tổng nợ, nhắc trong app, PWA, cache ngoại tuyến
của Firestore, tab Pomodoro giữ nguyên, firestore.rules mới (cần deploy).

### Trạng thái Phase 2 (xong)
Tab Nhật ký (lịch tháng trạng thái + chi tiết ngày + ảnh), tab Tổng hợp (tuần/tháng/năm, ô số liệu,
bảng theo nhiệm vụ), streak theo lineage, huy hiệu streak ở Hôm nay. Phần tính thuần ở `shared/utils/stats.ts`.

### Trạng thái Phase 3 (xong, chờ cấu hình service account)
Owner tạo tài khoản con (email + mật khẩu, qua Firebase app phụ nên không bị đăng xuất), bật/tắt
quyền thêm/sửa, gỡ thành viên (người bị gỡ tự quay về bảng riêng khi đăng nhập lại). Link chia sẻ
chỉ đọc: `workspaces.shareToken` + API `/api/share/{token}` (firebase-admin, cache 60 giây) + trang
`/share/{token}`. Cần biến `NUXT_FIREBASE_SERVICE_ACCOUNT` trên server (xem .env.example).

### Trạng thái Phase 4 (xong, chờ cấu hình trên Netlify)
- Nhắc đẩy: `server/lib/reminders.ts` (firebase-admin + web-push) quét mọi workspace có thiết bị
  đăng ký, gửi nhắc cho nhiệm vụ tới giờ (cửa sổ 3 phút, chống gửi trùng bằng `reminderLog/{ngày}`)
  và nhắc cuối ngày (`eveningReminderTime`, mặc định 21:00). Chạy bởi Netlify Scheduled Function
  `netlify/functions/reminders.mts` mỗi phút, hoặc gọi tay `/api/cron/reminders` với `x-cron-secret`.
- Client: `usePush` đăng ký Web Push (VAPID), lưu `pushSubscriptions/{sha256(endpoint)}`; service
  worker nhận push qua `public/push-handler.js` (Workbox importScripts). Chỉ chạy ở bản build.
- Ngoại tuyến: `useProofQueue` lưu ảnh vào IndexedDB khi tải lỗi vì mất mạng, tự tải lại và tích
  hoàn thành đúng ngày khi có mạng; tiền phạt ngày đã chốt không hoàn tác.
- Cần: `NUXT_FIREBASE_SERVICE_ACCOUNT`, `NUXT_PUBLIC_VAPID_PUBLIC_KEY`, `NUXT_VAPID_PRIVATE_KEY`,
  `NUXT_VAPID_SUBJECT`, `NUXT_CRON_SECRET`; publish lại firestore.rules (pushSubscriptions, reminderLog).
- Hạn mức: 1 lần/phút ≈ 43.200 lượt gọi function/tháng trong 125.000 miễn phí của Netlify (gói cũ; gói
  credit tính theo GB-giờ và mỗi lần deploy).
- Firestore gói Spark chỉ có 50K lượt đọc/ngày nên job chỉ đọc thứ cần: nhiệm vụ chính còn hiệu lực
  (`endsOn == null` hoặc `endsOn > since`), việc phụ chưa xong (`doneDate == null`), kiểm tra có thiết bị bằng
  `limit(1)`, và chỉ đọc `days/{hôm nay}` + `reminderLog` khi phút đó có tin tới giờ. Mô phỏng một ngày
  (2 bảng, 60 việc phụ đã xong): 108.843 → 15.855 lượt đọc, thông báo gửi ra không đổi.

### Chế độ nghỉ (xong)
`workspace.restDays[]`: owner khai nghỉ cho hôm nay hoặc tương lai (không khai lùi). Ngày nghỉ không
lên lịch nhiệm vụ chính, không phạt, không đứt streak, không gửi nhắc; Nhật ký hiện ô "Nghỉ".

### Đợt siết kỷ luật & trải nghiệm (2026-10-18, xong)
- Chỉ chủ sở hữu tích nhiệm vụ chính (rules + UI); hiện "X tích" nếu người khác tích.
- Ảnh: chặn nộp lại ảnh đã dùng (so `etag` Cloudinary trong 120 ngày), xem ảnh có đóng dấu giờ chụp,
  bấm tích là mở camera ngay.
- Chế độ nghỉ có hạn mức/tháng (mặc định 3) và giờ cắt khai nghỉ hôm nay (mặc định 10:00).
- Hạn giờ riêng từng việc (`deadlineTime`): quá giờ không tích được, nhắc đẩy trước 30 phút; đổi hạn
  chỉ hiệu lực từ ngày mai.
- Chốt ngày trên server (job mỗi phút) với thuật toán dùng chung `shared/utils/penalty.ts`; phạt tăng
  dần theo chuỗi lỡ (×2, ×4 tối đa), lưu `multiplier` trên ngày và `missStreak` trên workspace.
- Email tổng kết tuần cho người giám sát (Chủ nhật, qua Resend, tùy chọn).
- Nhắc buổi sáng (badge số việc trên icon đã bỏ 2026-10-30), thẻ "Việc tiếp theo", ăn mừng khi xong hết kèm chuỗi
  ngày không mất tiền, dark mode theo hệ thống + chọn trong Cài đặt, hộp xác nhận riêng, banner ngoại tuyến.

### Trò chơi hóa: rương thưởng & cấp độ (2026-10-19)
- Xong hết nhiệm vụ chính của ngày được thưởng (mặc định 10k, đổi trong Cài đặt > Kỷ luật, hiệu lực từ
  ngày mai như mức phạt: `rewardAmount` + `penaltyChanges[].reward`).
- Thưởng ghi lúc chốt ngày, trong cùng transaction với phạt (`shared/utils/penalty.ts`): `days.reward`,
  `workspace.rewardTotal`, `workspace.rewardDays` (= số rương đã mở). Ngày nghỉ / không có việc không thưởng.
  Bỏ tích trước 0h là mất thưởng. Ngày đã chốt trước khi có tính năng này không được thưởng bù.
- Màn Hôm nay: thanh nhiệm vụ chia ô + rương (khóa / sẵn sàng / đã mở), ví thưởng & nợ (cộng tạm thưởng hôm
  nay), cấp độ theo số rương (`app/utils/game.ts`). Xong việc cuối thì bật cửa sổ mở rương (âm thanh, xu bay,
  pháo giấy). "Đã mở" lưu ở `days/{ngày}.chestOpenedAt` nên đồng bộ mọi thiết bị; chỉ chủ sở hữu ghi được.
- Thống kê thưởng ở Tổng hợp (thưởng, phạt, chênh lệch), Nhật ký (ngày có thưởng), link chia sẻ, email tuần.
- Chuỗi: chỉ một chuỗi chung = số ngày liên tiếp hoàn thành đủ nhiệm vụ chính (`currentFullStreak`), bỏ chuỗi
  riêng từng nhiệm vụ. Ngày nghỉ / không có việc bỏ qua; hôm nay chưa xong chưa tính là đứt.
- Rules: thành viên có quyền `add` được ghi thêm `rewardTotal`, `rewardDays` khi chốt ngày, nhưng không ghi
  được `chestOpenedAt`.

### Bỏ ảnh chứng minh & bắt đầu lại (2026-10-26)
- Gỡ toàn bộ ảnh chứng minh: không còn `requiresProof`, `proofs`, modal nộp ảnh, hàng đợi ảnh ngoại tuyến,
  chặn nộp lại ảnh. Tích là xong. Cloudinary chỉ còn dùng cho ảnh đại diện (`useImageUpload`).
- Cài đặt > Kỷ luật > "Bắt đầu lại từ hôm nay" (`useRestart`): `createdDate` = hôm nay, `lastClosedDate` = null,
  ví/rương/chuỗi lỡ về 0, nhiệm vụ chính `effectiveFrom` = hôm nay; rồi xóa hẳn `days` trước hôm nay, việc phụ đã
  xong trước hôm nay và bản nhiệm vụ chính đã ngừng. Rules: owner chỉ xóa được `days` có ngày < `createdDate`
  (nên phải cập nhật workspace trước). `computeStats` vẫn bỏ qua ngày trước `earliest` phòng khi xóa dở.

### Widget màn hình chính qua Scriptable (2026-10-19)
- iOS chưa cho PWA có widget, nên dùng app Scriptable (miễn phí). Cài đặt > Thông báo > "Sao chép script"
  tạo script từ `app/assets/widget/scriptable-widget.js`, điền sẵn địa chỉ app và mã link chia sẻ chỉ đọc.
- Script gọi `/api/widget/{token}` (`server/lib/widget.ts`): ~10 lượt đọc mỗi lần (workspace, nhiệm vụ còn hiệu
  lực qua `server/lib/tasks.ts`, ngày hôm nay) vì widget tự làm mới nhiều lần mỗi ngày; cache 60 giây.
- Hỗ trợ widget nhỏ / vừa / lớn và màn hình khoá; mất mạng thì hiện bản lưu lần trước. Tắt link chia sẻ là
  widget ngừng hoạt động.

## 6. Kỹ thuật & giới hạn trên iPhone

- **Ảnh**: bucket Firebase hiện tại (`*.firebasestorage.app`) cần gói Blaze. Phương án miễn phí
  không cần thẻ: Cloudinary (25 credit/tháng ≈ 25 GB lưu trữ hoặc băng thông), tải thẳng từ
  trình duyệt bằng unsigned upload preset, tự nén và đổi HEIC của iPhone sang JPEG. Cần: cloud
  name + tên preset (đặt trong `.env`).
- **Giọng nói**: Web Speech API có sẵn trong Safari/Chrome, miễn phí, hỗ trợ `vi-VN`. Trên iPhone
  chạy ổn trong Safari; khi mở từ icon màn hình chính (PWA) đôi khi không khả dụng, khi đó nút
  mic ẩn đi và vẫn gõ tay được. Google Cloud Speech-to-Text chỉ thêm nếu chất lượng không đạt.
- **Thông báo**: iPhone chỉ nhận Web Push khi app đã thêm ra màn hình chính (iOS 16.4+) và phải
  có server gửi. Khi app đang mở thì nhắc trong app không cần server.
- **Ngoại tuyến**: Firestore có sẵn cache ngoại tuyến (persistentLocalCache) cho nhiệm vụ và tích;
  ảnh chụp khi mất mạng được xếp hàng trong IndexedDB và tải lên khi có mạng.
- **Chống "xóa cho khỏi bị phạt"**: sửa/xóa nhiệm vụ chính chỉ có hiệu lực từ ngày mai
  (`effectiveFrom`). Đổi mức phạt / phạt tăng dần cũng vậy (`workspace.penaltyChanges`, đọc qua
  `penaltySettingsOn`).
- **Chốt ngày không cộng trùng**: client và job server chốt từng ngày trong một transaction (đọc lại
  `lastClosedDate` rồi mới ghi), nên chạy cùng lúc hoặc thiết bị vừa có mạng lại cũng không cộng phạt hai lần.
  Client không chốt khi ngoại tuyến.
