# P2-5 — Phụ đề tự động từ transcript của Zoom

**Trạng thái**: ✅ Approved (26/09/2026 — dùng các phương án đề xuất ở mục 7) · Liên quan: [ROADMAP](../ROADMAP.md), [IMPLEMENTATION_PLAN.ai.md §4](../IMPLEMENTATION_PLAN.ai.md), [P1-4/P1-5 Automation Workflow và quy tắc](../IMPLEMENTATION_PLAN.ai.md)

## 1. Mục tiêu

Khi Zoom có **transcript** (bản ghi lời nói dạng VTT) của một buổi họp, app tự tải nó lên video YouTube tương ứng thành **phụ đề**, để người xem bật CC, tìm kiếm trong video và người khiếm thính theo dõi được. Không cần người dùng làm tay trong YouTube Studio.

**Hiện trạng**: backend chỉ dùng file MP4 trong `recording_files` (`zoom.service.ts`), chỉ xử lý sự kiện `recording.completed`; quyền YouTube `youtube.force-ssl` (cần cho `captions.insert`) **đã được xin sẵn** trong `getAuthUrl` nên không phải uỷ quyền lại.

Ngoài phạm vi: dịch phụ đề sang ngôn ngữ khác, sửa lỗi nhận dạng, phụ đề cho video upload thủ công (không có Zoom transcript).

## 2. Nguồn transcript và thời điểm

- Zoom tạo transcript khi tài khoản Zoom bật **"Audio transcript"** trong cài đặt Cloud recording. File xuất hiện trong `recording_files` với `file_type: "TRANSCRIPT"` (VTT). Nếu có phụ đề trực tiếp trong cuộc họp, còn có `file_type: "CC"` (VTT) — dùng làm dự phòng khi không có `TRANSCRIPT`.
- Transcript thường **xong sau** video: Zoom gửi webhook riêng **`recording.transcript_completed`**. Webhook `recording.completed` có thể chưa kèm file transcript.
- YouTube chỉ nhận phụ đề cho video đã tồn tại; an toàn nhất là tải lên **sau khi video xử lý xong** (trạng thái sync `COMPLETED`, đã có `youtubeVideoId`).

Vì vậy phụ đề là **một bước riêng** sau khi sync thành công, chạy khi *cả hai* điều kiện đã có: video `COMPLETED` **và** transcript sẵn sàng — bất kể cái nào đến trước.

## 3. Mô hình dữ liệu (chỉ thêm)

```prisma
// ZoomWorkflowSettings (thiết lập chung) — ZoomSyncRule có thể ghi đè ngôn ngữ
captionsEnabled  Boolean @default(false) // câu hỏi mở 2
captionLanguage  String  @default("vi")  // BCP-47: 'vi', 'en', …
captionName      String? // tên hiển thị của track, ví dụ "Tiếng Việt (Zoom)"

// ZoomSyncLog
captionStatus    String?   // null | 'waiting_transcript' | 'pending' | 'uploaded' | 'failed' | 'no_transcript'
captionTrackId   String?   // id track phụ đề trên YouTube
captionError     String?
captionErrorCode String?   // mã lỗi dịch được (P1-9): 'quotaExceeded', 'NO_TRANSCRIPT', …
captionAttempts  Int     @default(0)
captionUpdatedAt DateTime?
```

## 4. Luồng xử lý

1. **Sync xong** (`checkVideoProcessingStatus` chuyển sang `COMPLETED`) và thiết lập bật phụ đề → `captionStatus = 'pending'`, gọi `CaptionService.tryUpload(recordingId)`.
2. **`tryUpload`**: lấy danh sách file của recording qua Zoom API (`GET /meetings/{uuid}/recordings`, token của tài khoản — không phụ thuộc `download_token` 24 giờ của webhook). Có `TRANSCRIPT` (hoặc `CC`) → tải VTT → `captions.insert` (`snippet: { videoId, language, name, isDraft: false }`, 400 đơn vị quota, ghi qua `trackQuotaUsage`) → `uploaded` + `captionTrackId`. Chưa có → `waiting_transcript`.
3. **Webhook `recording.transcript_completed`** (thêm vào `handleWebhook`, cùng xác thực chữ ký và quy tắc chủ ở P1-3/P1-4) → nếu log tương ứng đang `waiting_transcript` → `tryUpload`.
4. **Bộ lập lịch** (`zoom-sync-scheduler`, đã có): mỗi lượt quét tối đa N log `waiting_transcript` trong 48 giờ gần nhất / `failed` lỗi tạm thời → gọi lại `tryUpload` (dự phòng khi webhook lỡ). Quá 48 giờ vẫn không có → `no_transcript`.
5. **Lỗi**: hết quota / lỗi mạng → `failed` + tự thử lại theo lịch; lỗi vĩnh viễn (video bị xoá, không có quyền) → `failed`, không thử lại. Không bao giờ làm hỏng trạng thái sync video (phụ đề là phần phụ, như playlist ở P1-5).
6. **Đã có track cùng ngôn ngữ** (chạy lại): `captions.update` thay vì tạo thêm track trùng.

## 5. API và giao diện

- `POST /zoom/recordings/:recordingId/captions` — tải/tải lại phụ đề thủ công (dùng cho video đã sync trước khi có tính năng này).
- Bảng recording (`ZoomRecordingsPanel`): cột/nhãn **"Phụ đề"**: Đã tải / Chờ transcript / Không có transcript / Lỗi (tooltip lý do, dịch theo `captionErrorCode`) + nút "Tải phụ đề".
- Form Automation Workflow: công tắc **"Tự động tải phụ đề từ transcript Zoom"**, chọn ngôn ngữ, tên track; ghi chú "tốn khoảng 400 đơn vị quota mỗi video, cần bật Audio transcript trong Zoom". Quy tắc theo cuộc họp (P1-5) có thể đổi ngôn ngữ.
- Lịch sử sync: dòng trạng thái phụ đề. Thông báo chuông chỉ khi **lỗi vĩnh viễn** (tránh ồn).

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Zoom chưa bật Audio transcript → không bao giờ có file | Trạng thái `no_transcript` sau 48 giờ + gợi ý bật trong Zoom; kiểm tra trên một recording thật trước khi bật mặc định |
| Chất lượng nhận dạng tiếng Việt của Zoom chưa tốt | Tải lên dạng track riêng có tên rõ ("Zoom transcript"); có thể để `isDraft: true` nếu muốn duyệt trước (câu hỏi mở 3) |
| Tốn quota (400/video, cộng ~1.650 cho upload) | Chỉ khi bật; đếm vào quota đã có; kiểm tra còn quota trước khi gọi |
| Transcript có thông tin nhạy cảm của cuộc họp | Chỉ gửi lên đúng video đã sync; theo chế độ hiển thị của video (riêng tư thì phụ đề cũng riêng tư) |
| `download_token` của webhook hết hạn sau 24 giờ | Luôn tải bằng token OAuth của tài khoản qua Zoom API |
| Workspace (P2-2) đổi quyền sở hữu thiết lập | Các cột mới nằm trên `ZoomWorkflowSettings`/`ZoomSyncLog`, sẽ đi theo workspace cùng các cột khác ở P2-2c |

## 7. Câu hỏi mở — đã chốt: dùng phương án đề xuất (26/09/2026)

1. **Ngôn ngữ phụ đề mặc định** — Đề xuất: **Tiếng Việt (`vi`)**; quy tắc theo cuộc họp đổi được (ví dụ buổi tiếng Anh → `en`). Zoom không tự nhận biết ngôn ngữ của transcript nên cần khai báo.
2. **Bật mặc định hay tuỳ chọn** — Đề xuất: **tắt mặc định**, người dùng tự bật (giống tự upload); vì tốn quota và phụ thuộc cài đặt Zoom.
3. **Công khai ngay hay bản nháp** — Đề xuất: **công khai ngay** (`isDraft: false`); nếu muốn duyệt trong YouTube Studio trước thì chọn bản nháp.
4. **Làm trước P2-2 được không** — Đề xuất: **có** — không phụ thuộc bảng kết nối mới hay workspace; có thể làm trong tuần chờ P2-1f.
5. **Video đã sync trước đây** — Đề xuất: chỉ tải khi người dùng bấm "Tải phụ đề" trên từng recording (không tự quét toàn bộ, tránh tốn quota).

## 8. Các task triển khai

Theo Definition of done của IMPLEMENTATION_PLAN.ai.md. Migration chỉ thêm.

**P2-5a — Schema + CaptionService.** *Context*: `zoom.service.ts` (Zoom token, `recording_files`), `youtube.service.ts` (`checkVideoProcessingStatus`, `trackQuotaUsage`, `mapYoutubeError`), `workflow-template.ts`, `sync-rules.ts`. *Changes*: columns of §3 (+ `ZoomSyncRule.captionLanguage String?`); pure `pickTranscriptFile(files)` (TRANSCRIPT, else CC) and `captionState(...)` transitions with specs; `CaptionService.tryUpload` (Zoom files via API, VTT download, `captions.list` → insert or update, quota check/track, status + error code); hook after the sync becomes `COMPLETED` when enabled. *Tests*: file selection; insert vs update; quota exhausted → `failed` (retryable); no transcript → `waiting_transcript`; never touches `syncStatus`. *Acceptance*: with captions on, a finished sync whose recording already has a transcript gets a caption track.

**P2-5b — Transcript webhook + scheduler.** *Changes*: `recording.transcript_completed` in `handleWebhook` (same signature/owner rules); scheduler sweep of `waiting_transcript` (≤ 48 h) and retryable `failed`; `no_transcript` after 48 h. *Tests*: webhook before/after the video finishes; sweep limits; 48-hour cutoff. *Acceptance*: a transcript that arrives after the video still becomes a caption within one sweep.

**P2-5c — UI.** *Changes*: workflow form (switch, language, track name, quota note), rule field for language, caption status + "Upload captions" button in the recordings table and sync history, `POST /zoom/recordings/:recordingId/captions`, i18n (captionErrorCode → `syncError.*`/`captionError.*`). *Acceptance*: turn on, sync a recording with a transcript → status "Uploaded" and the track visible in YouTube Studio; the button uploads captions for an older video.
