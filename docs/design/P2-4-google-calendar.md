# P2-4 — Lịch họp sắp tới và gắn video vào Google Calendar

**Trạng thái**: 📝 Bản nháp — chờ duyệt (26/09/2026) · Liên quan: [ROADMAP §3](../ROADMAP.md), [IMPLEMENTATION_PLAN.ai.md §4](../IMPLEMENTATION_PLAN.ai.md), [P2-1 Connector](P2-1-connector.md), [P2-3 Google Drive](P2-3-google-drive.md)

## 1. Mục tiêu

1. **Xem các buổi họp sắp tới** ngay trong trang Zoom: tên, giờ, quy tắc nào sẽ áp dụng (playlist, lịch công khai — P1-5), để biết trước video sẽ lên YouTube thế nào.
2. **Sau khi sync xong, gắn link video YouTube vào sự kiện lịch** của buổi họp đó, để người tham dự mở lịch là thấy bản ghi.

**Nhận xét quan trọng**: mục tiêu 1 **không cần Google Calendar** — Zoom API trả về danh sách cuộc họp đã lên lịch (`GET /users/me/meetings?type=upcoming`) bằng kết nối Zoom đang có. Chỉ mục tiêu 2 cần quyền ghi vào Calendar. Vì vậy thiết kế chia hai phần độc lập; phần 1 làm được ngay, rẻ và không xin thêm quyền Google.

Ngoài phạm vi: tạo cuộc họp Zoom từ app, đồng bộ hai chiều lịch, nhắc lịch.

## 2. Phần 1 — Buổi họp sắp tới (Zoom API)

- Backend: `GET /zoom/meetings/upcoming?days=14` gọi Zoom `users/me/meetings?type=upcoming` (và `type=scheduled` cho các buổi định kỳ), trả về: id, tên, giờ bắt đầu (múi giờ của thiết lập P1-4), thời lượng dự kiến, **quy tắc sẽ khớp** (`findMatchingRule`, P1-5) và kết quả dự kiến: playlist, chế độ hiển thị, giờ công khai, tiêu đề đã điền mẫu.
- Ứng dụng Zoom Server-to-Server cần thêm scope đọc cuộc họp (`meeting:read:list_meetings:admin` hoặc tương đương) — người dùng phải thêm trong Zoom Marketplace; thiếu scope thì thẻ hiện hướng dẫn thay vì lỗi.
- Giao diện: thẻ **"Buổi họp sắp tới"** trên trang Zoom (trên bảng recording), mỗi dòng: giờ · tên · nhãn quy tắc · "→ Playlist SOH, công khai sau 24 giờ". Cache 5 phút.

## 3. Phần 2 — Gắn video vào sự kiện Google Calendar

**Kết nối**: thẻ **Google Calendar** riêng (khung P2-1, `provider = "google_calendar"`), cùng OAuth client Google, quyền **`calendar.events`** (đọc/sửa sự kiện). Người dùng chọn **một lịch** trong danh sách lịch của tài khoản (lịch cá nhân hoặc lịch chung của ban). Quyền này Google xếp loại **nhạy cảm**: app đang ở chế độ Testing thì chỉ người dùng thử được thêm vào mới dùng được, và muốn mở cho mọi người phải qua thẩm định của Google (như quyền YouTube hiện nay).

**Tìm sự kiện của một recording** (hàm thuần, có test):
- Sự kiện trong lịch đã chọn, bắt đầu cách giờ bắt đầu recording **≤ 2 giờ**, và
- chứa **mã cuộc họp Zoom** (số `id` của recording) trong link tham gia (`zoom.us/j/<id>`) ở `location`, `description` hoặc `conferenceData` — cách chắc chắn nhất; không có thì **không** đoán theo tên (tránh gắn nhầm).
- Buổi họp định kỳ: sửa đúng **một lần diễn ra** (instance) của ngày đó, không sửa cả chuỗi.

**Gắn link**: thêm vào cuối `description` một khối có đánh dấu để lần sau thay thế thay vì thêm lặp:
`▶ Video: https://youtu.be/<id>` (và link thư mục Drive nếu có P2-3). Chạy sau khi sync `COMPLETED` (cơ chế `onSyncCompleted`, như phụ đề P2-5); không tìm thấy sự kiện → trạng thái `no_event`, không coi là lỗi.

**Dữ liệu (chỉ thêm)**: `ZoomSyncLog.zoomMeetingId String?` (mã cuộc họp, hiện chưa lưu), `calendarStatus String?` (`linked` | `no_event` | `failed`), `calendarEventId String?`; `ZoomWorkflowSettings.calendarLinkEnabled Boolean @default(false)`, `calendarId String?`.

**Riêng tư**: chế độ hiển thị của video không đổi; nếu video **riêng tư**, người xem lịch thấy link nhưng không mở được — mặc định **chỉ gắn khi video công khai hoặc không công khai** (câu hỏi mở 3).

## 4. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Gắn nhầm video vào sự kiện khác | Chỉ khớp theo mã cuộc họp Zoom + khoảng giờ; không khớp theo tên |
| Sửa nội dung sự kiện của người khác trong lịch chung | Chỉ thêm một khối có đánh dấu ở cuối, không sửa phần khác; hiện trước trong thiết lập "App sẽ thêm dòng này vào sự kiện" |
| Quyền Calendar nhạy cảm, cần Google thẩm định | Phần 1 không cần; phần 2 dùng được ngay cho người dùng thử, xin thẩm định chung với YouTube |
| Recording không có sự kiện lịch (họp đột xuất) | Trạng thái `no_event`, không thông báo |

## 5. Câu hỏi mở (đề xuất in đậm)

1. **Làm phần 1 trước, riêng** — **Có**: giá trị thấy ngay, không cần quyền Google, chỉ cần thêm scope Zoom.
2. **Lịch nào** — **Người dùng chọn một lịch** (mặc định lịch chính); lịch chung của ban hợp khi nhiều người cùng dự.
3. **Video riêng tư có gắn không** — **Không**, chỉ công khai/không công khai (và video lên lịch công khai thì gắn khi đã công khai).
4. **Bật mặc định** — **Tắt**.

## 6. Các task triển khai

**P2-4a — Buổi họp sắp tới (Zoom).** Endpoint upcoming + dự đoán quy tắc/kết quả (hàm thuần, test), thẻ trên trang Zoom, hướng dẫn khi thiếu scope, i18n. *Acceptance*: thấy các buổi họp 14 ngày tới với quy tắc sẽ áp dụng đúng.

**P2-4b — Kết nối Google Calendar.** Provider `google_calendar`, OAuth `calendar.events`, chọn lịch, thẻ Tích hợp. *Acceptance*: kết nối, chọn lịch, ngắt kết nối được.

**P2-4c — Gắn video.** Lưu `zoomMeetingId`, hàm tìm sự kiện (test: khớp mã, lệch giờ, buổi định kỳ, không có sự kiện), cập nhật khối mô tả có đánh dấu (thay chứ không thêm lặp), trạng thái trong bảng recording, nút "Gắn vào lịch" thủ công. *Acceptance*: sync một buổi họp có trong lịch → sự kiện có link video; sync lại không tạo dòng trùng.
