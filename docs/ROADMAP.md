# N3 Connect — Đề xuất tính năng và ứng dụng tích hợp

Tài liệu này gom các ý tưởng để phát triển N3 Connect thành một hub kết nối nhiều ứng dụng. Mỗi đề xuất nêu **giá trị** mang lại, **độ khó ước tính** (S: vài ngày · M: 1–2 tuần · L: vài tuần trở lên) và **ghi chú kỹ thuật** dựa trên kiến trúc hiện tại (xem [README](../README.md)).

Đây là danh sách để thảo luận và chọn lựa, không phải cam kết. Thứ tự trong mỗi nhóm là mức ưu tiên đề xuất.

---

## Mục lục

1. [Hoàn thiện những gì đang có](#1-hoàn-thiện-những-gì-đang-có)
2. [Nền tảng cho một hub nhiều ứng dụng](#2-nền-tảng-cho-một-hub-nhiều-ứng-dụng)
3. [Tích hợp ứng dụng mới](#3-tích-hợp-ứng-dụng-mới)
4. [Mở rộng Zoom → YouTube](#4-mở-rộng-zoom--youtube)
5. [Mở rộng Word Cloud thành bộ công cụ tương tác](#5-mở-rộng-word-cloud-thành-bộ-công-cụ-tương-tác)
6. [Tính năng AI](#6-tính-năng-ai)
7. [Trải nghiệm người dùng và vận hành](#7-trải-nghiệm-người-dùng-và-vận-hành)
8. [Lộ trình gợi ý](#8-lộ-trình-gợi-ý)

---

## 1. Hoàn thiện những gì đang có

Những việc nhỏ nhưng nên làm trước, vì người dùng đang nhìn thấy chúng.

| Đề xuất | Giá trị | Độ khó | Ghi chú kỹ thuật |
| --- | --- | --- | --- |
| **Lưu thật "Automation Workflow Manager"** (trang Zoom) | Hiện form chỉ hiện thông báo "đã lưu" nhưng không lưu gì: bật/tắt tự upload, mẫu tiêu đề `[Zoom] {topic} - {date}` và quyền riêng tư mặc định đều không có tác dụng | S | Thêm cột vào `ZoomConfig` (hoặc bảng `ZoomWorkflowSettings`), đọc trong `zoom.service` khi xử lý webhook và khi upload (hiện tiêu đề luôn là `Zoom Recording: {topic}`) |
| **Dừng kiểm tra video đã bị xoá trên YouTube** | Log production đang báo `Video not found on YouTube` mỗi ~15 giây cho một video đã xoá, tốn quota | S | Khi YouTube trả "không tìm thấy", đánh dấu sync là `FAILED` với lý do rõ ràng và ngừng hỏi lại |
| **Tiêu đề trang đúng trên header** | Header luôn hiện "Tổng quan / Dashboard" ở mọi trang | S | Lấy tiêu đề từ route hiện tại trong `DashboardLayout` |
| **Dọn tài liệu và cấu hình mẫu** | README của `backend/` và `frontend/` vẫn là template gốc; `.env.example` thiếu vài biến | S | Trỏ về README chính; bổ sung `YOUTUBE_CALLBACK_URL`, `YOUTUBE_OAUTH_TESTING_MODE`, `SYNC_SCHEDULER_ENABLED`… |
| **Dịch nốt thông báo từ backend** | Thông báo lỗi, nội dung chuông thông báo và email vẫn chỉ có tiếng Việt | S–M | Backend trả mã lỗi + tham số, frontend dịch bằng `lib/i18n`; notification lưu `type` + dữ liệu thay vì câu hoàn chỉnh |

## 2. Nền tảng cho một hub nhiều ứng dụng

Trước khi thêm nhiều app, nên có một "khung" chung để mỗi tích hợp mới tốn ít công hơn.

### 2.1 Khung Connector chung — **L, nên làm sớm**
Hiện mỗi dịch vụ có cấu hình riêng (`YoutubeConfig`, `ZoomConfig`) và code riêng. Một khung chung gồm:
- Bảng `Connection` (ứng dụng, tài khoản, token mã hoá, trạng thái, hạn token) thay cho từng bảng config.
- Luồng OAuth dùng chung (kết nối, làm mới token, báo hết hạn — đã có sẵn logic cho YouTube để tổng quát hoá).
- Trang **Settings → Integrations** dạng danh sách thẻ ứng dụng: *Kết nối / Đang hoạt động / Cần kết nối lại*.
- Quota và giới hạn tốc độ theo từng ứng dụng (tổng quát hoá phần theo dõi quota YouTube).

### 2.2 Trình tạo quy trình tự động (Workflow builder) — **L**
Biến "Zoom → YouTube" thành một trường hợp của quy tắc tổng quát **Khi … thì …**:
- *Khi* Zoom có recording mới · YouTube có video mới · có câu trả lời Word Cloud · đến giờ hẹn.
- *Thì* upload lên YouTube · đăng lên Facebook · gửi email · nhắn Zalo/Telegram · lưu vào Google Drive.
- Có điều kiện lọc (ví dụ: chỉ các cuộc họp có tên bắt đầu bằng "SOH").

Tái sử dụng những gì đã có: bộ lập lịch (`zoom-sync-scheduler`), cơ chế tự thử lại, lịch sử thực thi (tương tự `ZoomSyncLog`) và thông báo.

### 2.3 Tổ chức, nhóm và phân quyền — **M–L**
Nhiều tài khoản đang dùng chung một tài khoản Zoom (đã gặp khi làm tính năng liên kết video). Nên có:
- **Workspace / tổ chức** sở hữu các kết nối (Zoom, YouTube) thay vì từng người.
- Vai trò: *Quản trị* (kết nối, cấu hình), *Biên tập* (sync, sửa video), *Xem*.
- Nhật ký hoạt động: ai đã sync, liên kết, xoá gì.

### 2.4 Webhook và API công khai — **M**
Cho phép hệ thống khác nhận sự kiện (video sẵn sàng, sync lỗi…) và gọi API bằng API key. Mở đường cho Zapier/Make/n8n.

## 3. Tích hợp ứng dụng mới

| Ứng dụng | Tính năng đề xuất | Giá trị | Độ khó | Ghi chú |
| --- | --- | --- | --- | --- |
| **Google Drive** | Tự sao lưu MP4/M4A/transcript của Zoom vào một thư mục Drive; xem dung lượng | Recording của Zoom có hạn lưu trữ; Drive là kho lâu dài | M | Cùng Google OAuth với YouTube (thêm scope `drive.file`) |
| **Buổi họp sắp tới** (thay cho Google Calendar) | Hiện các buổi họp Zoom sắp tới và quy tắc sẽ áp dụng. *Không* tự gắn video vào lịch: chia sẻ video/recording do super admin quyết định (27/09/2026) | Biết trước video sẽ lên YouTube thế nào | S | Zoom API (scope đọc cuộc họp), không cần quyền Google |
| **Gmail / Email** | Gửi link video cho người tham dự sau buổi họp; bản tin hằng tuần các video mới | Người tham gia nhận ngay bản ghi | S–M | Đã có `mail.service` (SMTP); có thể dùng Gmail API để gửi từ chính tài khoản người dùng |
| **Facebook Page** | Đăng video/bài viết kèm link YouTube lên Fanpage; lên lịch đăng | Mở rộng khán giả ngoài YouTube | L | Graph API, cần App Review của Meta cho quyền đăng lên Page |
| **Zalo OA** | Gửi thông báo "video đã sẵn sàng" cho người theo dõi Official Account | Kênh nhắn tin phổ biến nhất ở Việt Nam | M | Zalo Official Account API, cần OA đã xác thực |
| **Telegram / Discord / Slack** | Bot thông báo sync xong/lỗi vào nhóm nội bộ | Nhóm vận hành nắm tình hình ngay | S | Bot token + webhook, không cần OAuth phức tạp |
| **Podcast (RSS, Spotify)** | Tách audio từ recording thành tập podcast, tạo RSS feed công khai | Nghe lại khi di chuyển; phù hợp nội dung chia sẻ, suy niệm | M | Zoom đã có file M4A; host file (Drive/S3) + sinh RSS |
| **Google Meet / Microsoft Teams** | Cùng luồng như Zoom: lấy bản ghi → YouTube | Không phụ thuộc một nền tảng họp | L | Meet lưu bản ghi vào Drive; Teams qua Microsoft Graph |
| **YouTube Live** | Tạo/lên lịch buổi livestream, lấy link chia sẻ trước | Chuẩn bị buổi phát trực tiếp ngay trong hub | M | `liveBroadcasts` API (tốn quota) |
| **Instagram Reels / TikTok / YouTube Shorts** | Đăng các đoạn clip ngắn cắt từ buổi họp | Tiếp cận người xem trẻ | L | Cần cắt video (ffmpeg) và API đăng của từng nền tảng |

## 4. Mở rộng Zoom → YouTube

| Đề xuất | Giá trị | Độ khó | Ghi chú |
| --- | --- | --- | --- |
| **Phụ đề tự động** từ transcript của Zoom | Video có phụ đề, dễ tìm kiếm và dễ theo dõi | M | Zoom có file `TRANSCRIPT` (VTT) → YouTube `captions.insert` (khoảng 400 đơn vị quota) |
| **Mẫu tiêu đề, mô tả, tags và playlist theo quy tắc** | Ví dụ: cuộc họp có tên "SOH" → playlist "SOH", tag "linh đạo" | S–M | Đi kèm việc lưu thật Automation Workflow (mục 1) |
| **Lên lịch công khai** | Upload ở chế độ riêng tư, tự công khai vào giờ đặt trước | S | `status.publishAt` của YouTube |
| **Ảnh thumbnail tự động** | Ảnh bìa đồng bộ thương hiệu (logo + tên buổi + ngày) | M | Sinh ảnh phía server (ví dụ `sharp`) → `thumbnails.set` |
| **Chương (chapters) trong mô tả** | Người xem nhảy tới từng phần | M | Từ transcript (mục 6) hoặc do người dùng nhập |
| **Báo cáo điểm danh** từ danh sách người tham gia Zoom | Biết ai tham dự, bao lâu; xuất CSV | M | Zoom Reports API (`past_meetings/{id}/participants`) |
| **Xử lý hàng loạt** | Chọn nhiều recording để sync hoặc liên kết một lần | S | Tái sử dụng API sync/link hiện có, thêm hàng đợi |
| **Dọn dung lượng Zoom** | Tuỳ chọn xoá recording trên Zoom sau khi đã có trên YouTube (và Drive) | S | Cần xác nhận rõ ràng; chỉ khi sync đã hoàn tất |

## 5. Mở rộng Word Cloud thành bộ công cụ tương tác

Word Cloud đã có sẵn nền tảng quan trọng: realtime (socket.io), người tham gia vào bằng mã/QR, màn hình trình chiếu. Có thể phát triển thành bộ công cụ kiểu Mentimeter/Slido:

- **Bình chọn (poll)** nhiều lựa chọn, biểu đồ cập nhật trực tiếp — **M**
- **Hỏi đáp (Q&A)** với upvote câu hỏi và kiểm duyệt — **M**
- **Thang điểm / cảm nhận** (1–5 sao, thanh trượt) — **S**
- **Quiz** có đáp án đúng, bảng xếp hạng — **L**
- **Trình chiếu song song với Zoom:** hiện QR tham gia ngay trong buổi Zoom, lưu kết quả vào bản tóm tắt buổi họp — **M**
- **Lọc từ không phù hợp** và gộp từ đồng nghĩa trước khi hiển thị — **S**

## 6. Tính năng AI

| Đề xuất | Giá trị | Độ khó | Ghi chú |
| --- | --- | --- | --- |
| **Tóm tắt buổi họp** từ transcript | Bản tóm tắt ý chính gửi kèm link video | M | Dùng mô hình ngôn ngữ (ví dụ Claude qua API); transcript từ Zoom |
| **Gợi ý tiêu đề, mô tả, tags** cho YouTube | Tiết kiệm thời gian, tốt cho tìm kiếm | S–M | Người dùng duyệt trước khi áp dụng |
| **Chương tự động** (chapters) | Mục lục video theo nội dung | M | Từ transcript có mốc thời gian |
| **Cắt clip nổi bật** cho Shorts/Reels | Tái sử dụng nội dung dài | L | Cần phân tích transcript + cắt video |
| **Tìm kiếm trong nội dung các buổi họp** | "Buổi nào đã nói về chủ đề X?" | L | Đánh chỉ mục transcript; tìm kiếm ngữ nghĩa |
| **Nhóm câu trả lời Word Cloud theo ý** | Gom các câu trả lời cùng nghĩa khác chữ | M | Chạy sau khi kết thúc câu hỏi |

> Lưu ý: nội dung buổi họp có thể riêng tư. Tính năng AI nên là tuỳ chọn bật theo từng workspace và nói rõ dữ liệu được gửi đi đâu.

## 7. Trải nghiệm người dùng và vận hành

- **Progressive Web App (PWA):** cài lên màn hình điện thoại, nhận thông báo đẩy khi video sẵn sàng — **M**
- **Trang tổng quan hub:** một màn hình gom trạng thái mọi kết nối, việc đang chạy, lỗi cần xử lý — **M**
- **Thêm ngôn ngữ** (khung i18n đã sẵn: chỉ cần thêm file từ điển) — **S mỗi ngôn ngữ**
- **Giám sát và cảnh báo:** theo dõi lỗi (Sentry…), cảnh báo khi webhook Zoom ngừng về hoặc quota sắp hết — **S–M**
- **Sao lưu database định kỳ** và hướng dẫn khôi phục — **S**
- **Kiểm thử end-to-end giao diện** (Playwright) cho các luồng chính: đăng nhập, sync, liên kết video — **M**

## 8. Lộ trình gợi ý

**Giai đoạn 1 — Củng cố (2–4 tuần)**
- Toàn bộ mục 1, đặc biệt lưu thật Automation Workflow và dừng kiểm tra video đã xoá.
- Mẫu tiêu đề/playlist theo quy tắc, lên lịch công khai (mục 4).
- Bot thông báo Telegram hoặc Zalo (mục 3) — nhanh, giá trị thấy ngay.

**Giai đoạn 2 — Nền tảng hub (1–2 tháng)**
- Khung Connector chung (2.1), rồi Google Drive trên khung đó; buổi họp sắp tới lấy từ Zoom.
- Workspace và phân quyền (2.3).
- Phụ đề tự động từ transcript (mục 4).

**Giai đoạn 3 — Mở rộng (từ tháng thứ 3)**
- Workflow builder (2.2).
- Facebook Page, Podcast RSS.
- AI: tóm tắt buổi họp và gợi ý nội dung.
- Poll và Q&A cho Word Cloud.

---

*Cập nhật: 25/09/2026. Khi một đề xuất được chọn làm, nên tách thành issue riêng kèm tiêu chí hoàn thành.*
