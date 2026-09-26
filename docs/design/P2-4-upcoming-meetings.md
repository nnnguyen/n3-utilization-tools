# P2-4 — Buổi họp sắp tới

**Trạng thái**: 📝 Bản nháp — đã sửa theo góp ý 27/09/2026 (bỏ phần tự gắn video vào Google Calendar), chờ duyệt · Liên quan: [ROADMAP §3](../ROADMAP.md), [IMPLEMENTATION_PLAN.ai.md §4](../IMPLEMENTATION_PLAN.ai.md), [P1-5 Quy tắc theo cuộc họp](../IMPLEMENTATION_PLAN.ai.md)

## 1. Mục tiêu

**Xem các buổi họp sắp tới** ngay trong trang Zoom: tên, giờ, và **quy tắc nào sẽ áp dụng** (playlist, chế độ hiển thị, lịch công khai — P1-5), để biết trước video sẽ lên YouTube thế nào và sửa quy tắc kịp nếu cần.

Danh sách lấy từ **Zoom API** (`GET /users/me/meetings`) bằng kết nối Zoom đang có — **không cần kết nối Google Calendar** và không xin thêm quyền Google.

## 2. Đã bỏ: tự gắn video vào sự kiện lịch

Bản nháp 26/09 có phần "sau khi sync xong, tự thêm link video YouTube vào sự kiện Google Calendar của buổi họp". **Bỏ theo góp ý 27/09/2026**: việc chia sẻ video/recording hay không, và cho ai, do **super admin** quyết định — không tính năng nào được tự đưa link video tới người khác (sự kiện lịch thường được chia sẻ cho mọi người dự họp). Vì vậy P2-4 **không có kết nối Google Calendar**.

Nếu sau này cần đưa link video vào lịch hay bất kỳ kênh nào, việc đó thuộc một tính năng **chia sẻ do super admin điều khiển** (chọn video, chọn người/nhóm nhận, chọn kênh), thiết kế riêng — không phải một bước tự động sau sync.

Ngoài phạm vi: tạo/sửa cuộc họp Zoom từ app, nhắc lịch, đồng bộ lịch.

## 3. Thiết kế

- **Backend**: `GET /zoom/meetings/upcoming?days=14` gọi Zoom `users/me/meetings?type=upcoming` (buổi định kỳ: dùng `occurrences` để ra từng lần diễn ra trong 14 ngày), trả về cho mỗi buổi: mã cuộc họp, tên, giờ bắt đầu (múi giờ của thiết lập P1-4), thời lượng dự kiến, và **dự đoán** bằng đúng logic sync hiện có (`resolveSyncOptions`, `renderUploadText`): quy tắc khớp, tiêu đề YouTube, playlist, chế độ hiển thị, giờ công khai, tự upload có bật không. Không trả link tham gia/mật khẩu cuộc họp.
- **Quyền Zoom**: ứng dụng Server-to-Server cần scope đọc danh sách cuộc họp (`meeting:read:list_meetings:admin` hoặc tương đương — kiểm tra lại tên scope trong Zoom Marketplace). Thiếu scope → thẻ hiện hướng dẫn thêm scope thay vì lỗi.
- **Cache** 5 phút theo tài khoản; nút làm mới.
- **Giao diện**: thẻ **"Buổi họp sắp tới"** trên trang Zoom, phía trên bảng recording. Mỗi dòng: ngày giờ · tên · nhãn quy tắc (hoặc "Thiết lập chung") · tóm tắt "→ Playlist SOH · riêng tư · công khai sau 24 giờ" · biểu tượng tự upload bật/tắt. Nhấp nhãn quy tắc → mở quy tắc để sửa. 390px: mỗi buổi một thẻ nhỏ xếp dọc. vi/en.

## 4. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Dự đoán khác kết quả thật | Dùng đúng các hàm sync đang dùng; ghi rõ "dự kiến"; quy tắc có thể đổi trước giờ họp |
| Thiếu scope Zoom | Hướng dẫn cụ thể trên thẻ; phần còn lại của trang không bị ảnh hưởng |
| Lộ link/mật khẩu cuộc họp | Backend không trả các trường này |

## 5. Câu hỏi mở (đề xuất in đậm)

1. **Xem bao xa** — **14 ngày**.
2. **Ai thấy** — **người có kết nối Zoom đó** (như bảng recording); sau P2-2 là thành viên workspace.

## 6. Task triển khai

**P2-4a — Buổi họp sắp tới.** Endpoint upcoming + hàm thuần dự đoán kết quả (test: khớp quy tắc, buổi định kỳ, múi giờ, không trả link/mật khẩu), thẻ trên trang Zoom (desktop + 390px, sáng/tối, vi/en), hướng dẫn khi thiếu scope. *Acceptance*: thấy các buổi họp 14 ngày tới với quy tắc và kết quả dự kiến đúng như khi sync thật.
