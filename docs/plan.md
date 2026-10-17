# Kế hoạch v2 — Nhiệm vụ hằng ngày

Mục tiêu: app liệt kê nhiệm vụ hằng ngày, tích hoàn thành (có ảnh chứng minh khi cần),
phạt 10k mỗi nhiệm vụ chính bỏ lỡ, tổng hợp theo tuần/tháng/năm. Dùng chủ yếu trên iPhone.
Stack giữ nguyên: Nuxt 4 + Nuxt UI 4 + Firebase (Auth, Firestore).

## 1. Khái niệm

| Khái niệm | Mô tả |
|---|---|
| Workspace | Một "bảng" nhiệm vụ. Mỗi người có 1 workspace của mình; có thể mời tài khoản con vào với quyền xem / thêm / sửa. |
| Nhiệm vụ chính | Lặp theo các thứ trong tuần cấu hình sẵn (có thể gồm T7, CN). Bỏ lỡ bị phạt. Có thể yêu cầu ảnh, có thể có giờ nhắc. |
| Nhiệm vụ phụ | Thêm tay hoặc bằng giọng nói. Không phạt. Chưa xong thì tự hiện lại ngày hôm sau cho tới khi xong (dồn mãi). |
| Hoàn thành | Ghi nhận theo ngày. Nếu nhiệm vụ yêu cầu ảnh thì phải có ít nhất 1 ảnh mới được tính. |
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
  (`effectiveFrom`).
