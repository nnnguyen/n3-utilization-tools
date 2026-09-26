# P2-6 — Thông báo qua Zalo Official Account

**Trạng thái**: 📝 Bản nháp — đã sửa theo góp ý 27/09/2026 (chỉ super admin duyệt việc chia sẻ), chờ duyệt · Liên quan: [ROADMAP §3](../ROADMAP.md), [IMPLEMENTATION_PLAN.ai.md §4 và P1-8 (Telegram, tạm dừng)](../IMPLEMENTATION_PLAN.ai.md), [P2-1 Connector](P2-1-connector.md), [P1-9 Thông báo đa ngôn ngữ](../IMPLEMENTATION_PLAN.ai.md)

## 1. Mục tiêu và câu hỏi cần chốt trước

Zalo là kênh nhắn tin phổ biến nhất ở Việt Nam. Có **hai nhu cầu khác nhau**, và Zalo xử lý chúng bằng các loại tin khác nhau với chi phí/giới hạn khác nhau:

| | A. Báo cho **người vận hành** | B. Báo cho **cộng đồng** |
| --- | --- | --- |
| Ví dụ | "Sync buổi SOH lỗi: hết quota" gửi cho người quản lý | "Video buổi SOH 25/09 đã có: youtu.be/…" gửi cho người theo dõi OA |
| Số người nhận | Vài người | Hàng chục – hàng trăm |
| Loại tin Zalo phù hợp | Tin gửi theo số điện thoại dùng **mẫu Zalo duyệt trước (ZNS)**, tính phí mỗi tin | Tin gửi người theo dõi OA (tin truyền thông/broadcast), **giới hạn số lần mỗi tháng**, có thể tính phí |
| Kênh thay thế | Chuông trong app (đã có), Telegram (P1-8, đang tạm dừng) — miễn phí, không giới hạn | Không có kênh tương đương |

Ràng buộc chung của Zalo OA API (cần kiểm tra lại với tài liệu và bảng giá Zalo hiện hành trước khi làm, vì chính sách thay đổi thường xuyên):
- OA phải **đã xác thực** (doanh nghiệp/tổ chức) mới dùng được API gửi tin.
- **Tin nhắn tư vấn** (miễn phí/rẻ) chỉ gửi được cho người **vừa tương tác** với OA trong một khoảng thời gian ngắn → không dùng được cho thông báo định kỳ.
- Access token của OA sống khoảng **một ngày**, refresh token vài tháng và **đổi mới mỗi lần làm mới** → backend phải tự làm mới đều đặn, lưu token mới ngay.

**Đề xuất**: giá trị riêng của Zalo nằm ở **B (thông báo cộng đồng)**; nhu cầu A đã có chuông trong app và rẻ hơn nhiều nếu làm bằng Telegram. Thiết kế dưới đây theo **B**; A để lại nếu anh/chị cần (câu hỏi mở 1).

## 2. Kết nối Zalo OA

- Thẻ **Zalo OA** (khung P2-1, `provider = "zalo_oa"`): App ID, Secret key (mã hoá), OA đã chọn (tên, ảnh). Cấp quyền bằng OAuth của Zalo cho OA (quản trị viên OA đăng nhập Zalo và đồng ý).
- **Làm mới token**: tác vụ trong scheduler làm mới trước khi hết hạn; lưu refresh token mới trong cùng giao dịch; thất bại liên tục → thẻ báo "Cần kết nối lại" (dùng cơ chế sức khoẻ token của P2-1).
- Webhook Zalo (`POST /zalo/webhook`): kiểm tra chữ ký bằng secret của app; hiện chỉ dùng để biết số người theo dõi thay đổi (tuỳ chọn).

## 3. Luồng thông báo cộng đồng

1. **Khi nào**: sync `COMPLETED` **và** video **công khai** (video lên lịch công khai ở P1-5 → khi tới giờ công khai). Video riêng tư/không công khai không bao giờ được thông báo.
2. **Chọn buổi nào**: bật theo **quy tắc cuộc họp** (P1-5) — ví dụ chỉ buổi "SOH" — vì không phải buổi nào cũng dành cho cộng đồng.
3. **Nội dung**: mẫu có biến như P1-4 (`{title}`, `{date}`, `{link}`), mặc định "🎬 {title} ({date}) đã có bản ghi: {link}", ảnh thumbnail YouTube.
4. **Chỉ super admin quyết định gửi** (góp ý 27/09/2026 — chia sẻ video/recording hay không, và cho ai, do super admin quyết định): app chỉ tạo **bản nháp** → chuông báo **super admin** → super admin xem, sửa nội dung, chọn gửi hoặc huỷ. **Không có chế độ gửi tự động**; người dùng thường không gửi được.
5. **Ghi nhận**: `ZaloAnnouncement { id, userId, recordingId, ruleId, message, status: draft|sent|failed|discarded, zaloMessageId, error, sentAt }`; lỗi hết lượt gửi tháng → `failed` có mã (dịch được, P1-9), không thử lại tự động.

## 4. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Chi phí/hạn mức của Zalo thay đổi | Duyệt trước khi gửi; đếm số tin đã gửi trong tháng, hiện trên thẻ; tra bảng giá hiện hành trước khi làm |
| Gửi nhầm video không dành cho cộng đồng | Chỉ video công khai + chỉ quy tắc được bật + super admin duyệt từng tin |
| Token hết hạn âm thầm → không gửi được | Làm mới chủ động, cảnh báo trên thẻ và chuông khi làm mới thất bại |
| OA chưa xác thực | Kiểm tra khi kết nối, báo rõ lý do thay vì lỗi chung |
| Lộ secret của app Zalo | Mã hoá như mọi khoá (P2-1), không bao giờ trả về trình duyệt |

## 5. Câu hỏi mở (đề xuất in đậm)

1. **Báo cho ai** — **Cộng đồng (B)**; báo lỗi cho người vận hành (A) dùng chuông trong app, hoặc bật lại Telegram (P1-8) nếu cần tin nhắn ngoài app.
2. **Đã có OA xác thực chưa**, ai là quản trị viên — *cần anh/chị trả lời*; chưa có thì P2-6 chờ.
3. **Duyệt trước hay gửi tự động** — ✅ **Đã chốt 27/09/2026: super admin duyệt từng tin**, không có gửi tự động.
4. **Buổi họp nào** — **Theo quy tắc cuộc họp** (bật riêng cho từng quy tắc).
5. **Ngân sách tin nhắn mỗi tháng** — *cần anh/chị trả lời* sau khi xem bảng giá Zalo.

## 6. Các task triển khai (sau khi chốt mục 5)

**P2-6a — Kết nối Zalo OA.** Provider `zalo_oa`, OAuth OA, làm mới token trong scheduler (test: lưu refresh token mới, thất bại → trạng thái cần kết nối lại), webhook có kiểm tra chữ ký, thẻ Tích hợp. *Acceptance*: kết nối OA thật, token tự làm mới qua đêm.

**P2-6b — Thông báo cộng đồng.** Cột bật/mẫu trên `ZoomSyncRule`, model `ZaloAnnouncement`, tạo bản nháp khi video công khai, chỉ super admin gửi được (API kiểm tra `platformRole`), gửi qua API, đếm lượt tháng, lỗi có mã. *Tests*: chỉ video công khai; chỉ quy tắc bật; video lên lịch chỉ thông báo khi tới giờ; người không phải super admin bị từ chối. *Acceptance*: một buổi SOH công khai tạo bản nháp, bấm gửi → người theo dõi OA nhận được.

**P2-6c — Giao diện.** Thiết lập trong quy tắc, danh sách bản nháp/đã gửi trong trang Quản trị (chỉ super admin), nút duyệt/sửa/huỷ, nhật ký hoạt động (ai gửi, lúc nào), i18n vi/en.
