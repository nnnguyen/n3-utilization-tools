# P2-3 — Sao lưu recording Zoom vào Google Drive

**Trạng thái**: 📝 Bản nháp — đã sửa theo góp ý 27/09/2026 (người dùng tự chọn có lưu vào Drive hay không), chờ duyệt phần còn lại · Liên quan: [ROADMAP §3](../ROADMAP.md), [IMPLEMENTATION_PLAN.ai.md §4](../IMPLEMENTATION_PLAN.ai.md), [P2-1 Connector](P2-1-connector.md), [P2-5 Phụ đề](P2-5-captions.md)

## 1. Mục tiêu

Zoom chỉ giữ cloud recording trong một thời gian (tuỳ gói, có giới hạn dung lượng). App tự chép **file gốc** của mỗi buổi họp (MP4, M4A, transcript) vào một thư mục Google Drive, để:

- còn bản gốc chất lượng cao khi video YouTube bị xoá, bị hạn chế, hoặc khi Zoom đã xoá recording;
- sau này có thể **dọn dung lượng Zoom** an toàn (mục "Dọn dung lượng Zoom" ở ROADMAP §4, task riêng) và làm **podcast** từ M4A (ROADMAP §3).

**Hiện trạng**: đã có luồng stream MP4 từ Zoom thẳng lên YouTube không qua ổ đĩa (`uploadToYoutubeDirectly`), lấy danh sách file bằng token OAuth của tài khoản (`fetchRecordingFiles`, P2-5), và mẫu "bước phụ sau sync" có trạng thái riêng, thử lại theo lịch (phụ đề P2-5). Google OAuth hiện chỉ xin quyền YouTube.

**Người dùng tự quyết định có lưu vào Drive hay không** (góp ý 27/09/2026): mặc định không lưu; bật chung trong thiết lập, và chọn được cho từng recording (§4).

**File sao lưu là riêng tư**: nằm trong Drive của tài khoản đã kết nối, app **không bao giờ** tạo link chia sẻ hay đổi quyền truy cập. Chia sẻ video/recording với ai là quyết định của **super admin** (góp ý 27/09/2026), không phải của tính năng này.

Ngoài phạm vi: xoá recording trên Zoom, podcast/RSS, đồng bộ hai chiều, sao lưu video upload thủ công, chia sẻ file Drive.

## 2. Kết nối Google Drive

- Thẻ **Google Drive** riêng trong Cài đặt → Tích hợp (khung P2-1, `provider = "google_drive"`), **tách khỏi kết nối YouTube**: kênh YouTube thường là tài khoản thương hiệu, còn Drive có thể là tài khoản Google khác (tài khoản của ban, Google Workspace…).
- Dùng lại OAuth client Google đang có (`YOUTUBE_CLIENT_ID/SECRET`), chỉ thêm redirect URI mới. Quyền xin: **`drive.file`** — app chỉ thấy và sửa **file do chính app tạo**, không đọc được file khác trong Drive. Google xếp `drive.file` vào nhóm không nhạy cảm, nên không cần thẩm định thêm như quyền YouTube (cần kiểm tra lại trên Google Cloud Console trước khi làm).
- Refresh token mã hoá như P2-1; sức khoẻ token và cảnh báo hết hạn dùng chung cơ chế của YouTube (app Google đang ở chế độ Testing nên refresh token hết hạn sau 7 ngày — cùng vấn đề đã có với YouTube).

## 3. Mô hình dữ liệu (chỉ thêm)

```prisma
// ZoomWorkflowSettings (+ ghi đè theo quy tắc P1-5 nếu cần — câu hỏi mở 4)
driveBackupEnabled Boolean  @default(false)
driveFileTypes     String[] @default(["MP4", "M4A", "TRANSCRIPT"]) // câu hỏi mở 2
driveFolderId      String?  // thư mục gốc do app tạo ("N3 Connect")

model DriveBackup {
  id           String    @id @default(uuid())
  userId       String
  recordingId  String
  fileType     String    // 'MP4' | 'M4A' | 'TRANSCRIPT' | 'CHAT'
  zoomFileId   String    // id file trong recording_files
  driveFileId  String?
  folderId     String?   // thư mục của buổi họp
  status       String    // 'pending' | 'uploading' | 'done' | 'failed' | 'skipped'
  bytes        BigInt?
  errorCode    String?
  error        String?
  attempts     Int       @default(0)
  updatedAt    DateTime  @updatedAt
  @@unique([recordingId, fileType])
  @@index([userId, status])
}
```

Một dòng cho mỗi file → biết chính xác file nào đã có trên Drive, thử lại từng file.

## 4. Luồng xử lý

1. **Người dùng chọn** — không có gì được lưu nếu người dùng chưa chọn:
   - *Tự động*: chỉ khi đã bật **"Tự động lưu recording mới vào Google Drive"** (mặc định tắt) → khi `recording.completed` đến (P1-3/P1-4), tạo các dòng `DriveBackup` `pending`.
   - *Từng recording*: hộp chọn **"Lưu vào Google Drive"** trong hộp thoại Sync thủ công (giá trị ban đầu theo thiết lập chung, đổi được cho lần đó), và nút **"Lưu vào Drive"** trên từng dòng của bảng recording (cả recording cũ).
   - **Không phụ thuộc YouTube**: vẫn lưu khi tắt tự upload hoặc khi sync YouTube lỗi (chính là lúc bản sao lưu có ích).
2. **Thư mục**: `N3 Connect / Zoom / 2026 / 2026-09-25 SOH – <tên cuộc họp>` (tạo nếu chưa có; tên dùng múi giờ của thiết lập, như `{date}` ở P1-4).
3. **Tải lên**: lấy link file mới qua Zoom API bằng token tài khoản (không dùng `download_token` 24 giờ), **stream** Zoom → Drive bằng *resumable upload* (không ghi đĩa, như YouTube). Mỗi lần chỉ chạy **một** file lớn cho mỗi tài khoản để không tranh băng thông với upload YouTube.
4. **Lỗi**: hết dung lượng Drive (`storageQuotaExceeded`) → `failed`, không thử lại, thông báo chuông; lỗi mạng/5xx → thử lại theo lịch (quét của `zoom-sync-scheduler`, giãn cách tăng dần, tối đa 5 lần như phụ đề); file Zoom đã bị xoá → `skipped`.
5. **Không bao giờ** làm thay đổi trạng thái sync YouTube; sự kiện PostHog `drive_backup_completed/failed` (P2-8) nếu đã đồng ý.

## 5. API và giao diện

- `POST /zoom/recordings/:recordingId/drive-backup` — sao lưu/thử lại thủ công (chỉ chủ recording).
- Form Automation Workflow: công tắc **"Tự động lưu recording mới vào Google Drive"** (mặc định tắt), chọn loại file, nút mở thư mục trên Drive, dung lượng Drive còn trống (`about.get` → `storageQuota`). Chưa kết nối Drive → công tắc bị khoá kèm link tới Tích hợp.
- Hộp thoại Sync thủ công: hộp chọn **"Lưu vào Google Drive"** (chỉ hiện khi đã kết nối Drive).
- Bảng recording: nhãn **"Drive"**: Đã sao lưu (link thư mục) / Đang sao lưu (x%) / Lỗi (lý do dịch theo `errorCode`, P1-9) + nút sao lưu.
- Lịch sử sync: dòng trạng thái từng file.

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Drive đầy (tài khoản miễn phí 15 GB ≈ 5–10 buổi họp 2 giờ) | Hiện dung lượng còn trống; cảnh báo trước khi bật; lỗi `storageQuotaExceeded` báo rõ, không thử lại liên tục |
| File lớn (1–3 GB), mạng chập chờn, Railway khởi động lại giữa chừng | Resumable upload: tiếp tục từ byte đã gửi; trạng thái `uploading` quá 30 phút coi như bị gián đoạn và chạy lại |
| Băng thông Railway (dữ liệu ra bị tính phí) và thời gian chạy tăng gấp đôi khi vừa lên YouTube vừa lên Drive | Chỉ khi bật; mặc định không gồm file phụ; mỗi tài khoản một file lớn một lúc |
| Chọn nhầm tài khoản Google | Thẻ hiện email tài khoản Drive đã kết nối; ngắt kết nối không xoá file đã sao lưu |
| Workspace (P2-2) đổi chủ kết nối | `DriveBackup.userId` và kết nối sẽ chuyển theo workspace như các bảng khác ở P2-2c |

## 7. Câu hỏi mở (đề xuất in đậm)

1. **Kết nối riêng hay dùng chung tài khoản Google với YouTube** — **Riêng** (xem §2); nếu cùng một tài khoản thì chỉ bấm cấp quyền thêm một lần.
2. **File nào** — **MP4 + M4A + transcript**; chat và các MP4 phụ (chỉ người nói, chỉ màn hình) tắt mặc định.
3. **Bật mặc định** — ✅ **Đã chốt 27/09/2026: người dùng tự chọn** có lưu hay không — mặc định tắt; chọn được chung và cho từng recording (§4).
4. **Thư mục theo quy tắc cuộc họp** (ví dụ SOH vào thư mục riêng) — **Chưa**: một cây thư mục theo năm là đủ; thêm sau nếu cần.
5. **Recording cũ** — **Chỉ khi bấm nút** từng recording, không tự quét toàn bộ lịch sử.

## 8. Các task triển khai

Theo Definition of done của IMPLEMENTATION_PLAN.ai.md. Migration chỉ thêm.

**P2-3a — Kết nối Google Drive.** Provider `google_drive` trong registry P2-1, OAuth `drive.file` (auth URL + callback + redirect URI mới), thẻ trong Tích hợp, sức khoẻ token, `about.get` cho dung lượng. *Acceptance*: kết nối/ngắt kết nối được, thẻ hiện email và dung lượng.

**P2-3b — Sao lưu.** Model `DriveBackup`, các cột thiết lập, `DriveBackupService` (tạo thư mục, stream resumable Zoom → Drive, trạng thái từng file, lỗi có mã), kích hoạt từ webhook, quét thử lại trong scheduler. *Tests*: chọn file; tên thư mục; resumable tiếp tục sau lỗi; hết dung lượng không thử lại; không đụng `syncStatus`. *Acceptance*: một recording thật có MP4/M4A/VTT trên Drive đúng thư mục.

**P2-3c — Giao diện.** Công tắc + loại file + dung lượng trong Automation Workflow, hộp chọn trong hộp thoại Sync, nhãn Drive và nút trong bảng recording, lịch sử sync, i18n vi/en, sự kiện PostHog. *Acceptance*: tắt (mặc định) thì không có gì lên Drive; bật thì recording mới tự lên Drive; chọn trong hộp thoại Sync hoặc bấm nút thì lưu đúng recording đó; file trên Drive không có quyền chia sẻ nào ngoài chủ tài khoản.
