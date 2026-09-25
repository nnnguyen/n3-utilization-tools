# Kế hoạch triển khai — N3 Connect

Kế hoạch này biến các đề xuất trong [ROADMAP.md](ROADMAP.md) thành các đầu việc cụ thể. Có hai phiên bản:

| File | Dành cho | Nội dung |
| --- | --- | --- |
| **IMPLEMENTATION_PLAN.md** (file này) | Người đọc: chủ dự án, người duyệt | Vì sao làm, làm gì, thứ tự, rủi ro, cách nghiệm thu |
| [IMPLEMENTATION_PLAN.ai.md](IMPLEMENTATION_PLAN.ai.md) | AI thực thi (Claude Code…) | Đặc tả từng task: file cần sửa, API, dữ liệu, test, lệnh kiểm tra, điều kiện dừng |

Hai file dùng **cùng mã task** (ví dụ `P1-3`), nên khi muốn giao một việc cho AI, chỉ cần nói: *"Thực hiện task P1-3 trong docs/IMPLEMENTATION_PLAN.ai.md"*.

---

## 1. Nguyên tắc chung

- **Mỗi task là một đơn vị giao hàng**: một commit (hoặc vài commit nhỏ), có test, build qua, deploy được ngay. `main` tự deploy lên Vercel và Railway, nên không để `main` ở trạng thái dở dang.
- **Thay đổi database luôn an toàn khi triển khai**: chỉ thêm cột/bảng mới hoặc cột có giá trị mặc định; không xoá hay đổi tên cột đang dùng trong cùng một lần deploy.
- **Không phá vỡ dữ liệu người dùng**: mọi thay đổi hành vi (ví dụ tự upload) giữ nguyên cách chạy hiện tại cho đến khi người dùng tự thay đổi cài đặt.
- **Song ngữ và giao diện**: mọi chữ mới có đủ tiếng Việt và tiếng Anh; mọi màn hình mới chạy được trên điện thoại, máy tính bảng, chế độ tối.
- **Người duyệt trước khi làm** các task có mục *Cần anh/chị quyết định*.

## 2. Tổng quan lộ trình

| Giai đoạn | Mục tiêu | Thời gian ước tính |
| --- | --- | --- |
| **1. Củng cố** | Sửa những chỗ đang sai hoặc chưa hoạt động, vá bảo mật, làm cho tự động hoá Zoom → YouTube thật sự cấu hình được | 2–4 tuần |
| **2. Nền tảng hub** | Khung kết nối chung, workspace/phân quyền, Google Drive, Google Calendar, phụ đề tự động | 1–2 tháng |
| **3. Mở rộng** | Trình tạo quy trình tự động, Facebook, Podcast, AI, bình chọn/hỏi đáp | từ tháng thứ 3 |

### Thứ tự và phụ thuộc — giai đoạn 1

```
P1-1 Bảo mật cấu hình ─┐
P1-2 Video đã xoá       │ (độc lập, làm song song được)
P1-6 Tiêu đề header     │
P1-7 Tài liệu & .env    ┘
P1-3 Webhook đúng tài khoản ──► P1-4 Lưu Automation Workflow ──► P1-5 Quy tắc & lên lịch công khai
P1-9 Dịch thông báo backend ──► P1-8 Thông báo qua Telegram
```

---

## 3. Giai đoạn 1 — Củng cố

### P1-1. Không gửi mật khẩu/khoá bí mật về trình duyệt · Độ khó S · **Ưu tiên cao nhất**

- **Vấn đề**: API `GET /integrations/config` trả nguyên cấu hình, gồm cả Client Secret của Zoom/YouTube, Webhook Secret Token và YouTube Refresh Token. Bất kỳ ai xem được trình duyệt của người dùng (hoặc một tiện ích độc hại) đều đọc được các khoá này.
- **Cách làm**: API chỉ trả thông tin không bí mật (Client ID, Account ID, trạng thái bật/tắt) và cờ "đã lưu khoá hay chưa". Ô nhập khoá bí mật trên trang Tích hợp để trống, ghi chú "đã lưu — nhập để thay đổi"; để trống khi lưu thì giữ nguyên khoá cũ.
- **Ảnh hưởng người dùng**: gần như không thấy khác biệt, trừ việc các ô khoá không còn hiện sẵn.
- **Rủi ro**: trang chủ và trang Tích hợp đang dựa vào các khoá này để biết "đã kết nối chưa" — phải chuyển sang dùng cờ mới cùng lúc.
- **Nghiệm thu**: mở DevTools → Network, phản hồi `/integrations/config` không còn chứa khoá bí mật; lưu cấu hình mà không nhập lại khoá vẫn giữ kết nối.

### P1-2. Ngừng kiểm tra lại video đã bị xoá trên YouTube · Độ khó S

- **Vấn đề**: bảng Zoom Recordings cứ 15 giây hỏi YouTube trạng thái của các video "đang xử lý". Nếu video đã bị xoá trên YouTube, backend báo lỗi nhưng không đổi trạng thái → hỏi mãi, tốn quota, rác log.
- **Cách làm**: khi YouTube trả "không tìm thấy video", đánh dấu lần sync đó **thất bại** với lý do "Video đã bị xoá trên YouTube"; người dùng có thể sync lại.
- **Nghiệm thu**: log production không còn lặp lại `Video not found on YouTube`; recording tương ứng hiện trạng thái "Thất bại" kèm lý do.

### P1-3. Webhook Zoom gắn đúng tài khoản · Độ khó M · **Điều kiện cho P1-4**

- **Vấn đề**: khi Zoom báo có recording mới, backend không biết recording đó thuộc tài khoản nào của app ("system"), nên không áp dụng được cài đặt riêng của ai, không gửi được thông báo, và chỉ dùng khoá YouTube chung trong biến môi trường. Khoá webhook nhập ở trang Tích hợp cũng không được dùng.
- **Cách làm**: Zoom gửi kèm **Account ID** của tài khoản Zoom. Backend tìm các tài khoản app đã cấu hình Zoom với Account ID đó, kiểm tra chữ ký bằng khoá webhook của chính tài khoản ấy (vẫn chấp nhận khoá chung trong biến môi trường để không gián đoạn).
- **Cần anh/chị quyết định**: nếu **nhiều tài khoản app dùng chung một tài khoản Zoom** (đang xảy ra), recording mới sẽ thuộc về ai? Đề xuất: người đã bật "Tự động upload" và cập nhật cấu hình gần nhất; về lâu dài giải quyết triệt để bằng Workspace (P2-2).
- **Nghiệm thu**: recording mới từ webhook xuất hiện trong lịch sử sync của đúng tài khoản, có thông báo "Video đã sẵn sàng" trên chuông của tài khoản đó.

### P1-4. Lưu thật "Automation Workflow Manager" · Độ khó M

- **Vấn đề**: form trên trang Zoom (bật/tắt tự upload, mẫu tiêu đề, quyền riêng tư mặc định) chỉ hiện "đã lưu" nhưng không lưu gì. Video luôn có tiêu đề "Zoom Recording: …".
- **Cách làm**: lưu các cài đặt theo tài khoản: tự upload (bật/tắt), mẫu tiêu đề và mô tả với biến `{topic}`, `{date}`, `{time}`, quyền riêng tư và playlist mặc định. Áp dụng khi webhook tự upload và làm giá trị mặc định cho hộp thoại Sync thủ công.
- **Giữ tương thích**: tài khoản chưa lưu cài đặt thì chạy như hiện nay (tự upload bật, riêng tư). Mô tả luôn giữ dòng mã recording để tính năng nhận diện video tiếp tục hoạt động.
- **Nghiệm thu**: đổi mẫu tiêu đề → video upload tiếp theo mang tiêu đề mới; tắt tự upload → recording mới không tự lên YouTube nhưng vẫn sync thủ công được.

### P1-5. Quy tắc theo tên cuộc họp và lên lịch công khai · Độ khó M · Sau P1-4

- **Quy tắc**: ví dụ *tên cuộc họp chứa "SOH" → playlist "SOH", tiêu đề theo mẫu riêng, thêm tag*. Quy tắc đầu tiên khớp được áp dụng; không khớp thì dùng cài đặt chung của P1-4.
- **Lên lịch công khai**: upload ở chế độ riêng tư, YouTube tự công khai vào giờ chọn (ví dụ "20:00 cùng ngày" hoặc "sau 24 giờ").
- **Nghiệm thu**: recording có tên khớp quy tắc được đưa vào đúng playlist; video có lịch công khai hiện giờ công khai trên YouTube Studio.

### P1-6. Tiêu đề header đúng từng trang · Độ khó S

Header đang luôn ghi "Tổng quan". Đổi thành tên trang hiện tại (Trang chủ, Nội dung kênh, Cá nhân hóa…). Nghiệm thu: đi qua từng trang, tiêu đề header khớp mục đang chọn trên menu.

### P1-7. Dọn tài liệu và cấu hình mẫu · Độ khó S

README của `backend/` và `frontend/` trỏ về README chính; `.env.example` có đủ các biến backend đang đọc. Nghiệm thu: người mới chỉ cần README chính để chạy được dự án.

### P1-8. Thông báo qua Telegram · Độ khó S–M · Sau P1-9

- Người dùng tạo bot/nhóm Telegram, nhập mã kết nối ở trang Tích hợp; app gửi tin khi video sẵn sàng hoặc sync lỗi (tuỳ chọn như email).
- **Cần anh/chị quyết định**: Telegram trước (nhanh, miễn phí, không cần xét duyệt) hay **Zalo OA** trước (phổ biến hơn ở Việt Nam nhưng cần Official Account đã xác thực và quy trình xin quyền)? Đề xuất: Telegram trong giai đoạn 1, Zalo OA ở giai đoạn 2 trên khung kết nối chung.

### P1-9. Dịch thông báo từ backend · Độ khó M

- **Vấn đề**: nội dung chuông thông báo, email và thông báo lỗi do backend tạo sẵn bằng tiếng Việt.
- **Cách làm**: backend lưu *loại* thông báo và dữ liệu (tên cuộc họp, link…), giao diện tự dịch theo ngôn ngữ người dùng; email dùng ngôn ngữ đã lưu trong tài khoản. Thông báo cũ vẫn hiển thị như hiện tại.
- **Nghiệm thu**: chuyển sang English → chuông thông báo hiện tiếng Anh, kể cả thông báo mới từ sync.

---

## 4. Giai đoạn 2 — Nền tảng hub (thiết kế, cần duyệt trước khi làm)

Các hạng mục này lớn và ảnh hưởng nhiều phần. Mỗi hạng mục bắt đầu bằng **một bản thiết kế ngắn** để anh/chị duyệt, sau đó mới chia thành task nhỏ.

| Mã | Hạng mục | Mục tiêu | Quyết định cần chốt |
| --- | --- | --- | --- |
| **P2-1** | Khung kết nối chung (Connector) | Một bảng `Connection` và luồng OAuth dùng chung cho mọi ứng dụng; trang Tích hợp dạng thẻ; mã hoá khoá bí mật khi lưu | Chuyển dữ liệu YouTube/Zoom hiện có sang khung mới một lần hay dần dần; dùng khoá mã hoá nào |
| **P2-2** | Workspace và phân quyền | Kết nối Zoom/YouTube thuộc về một nhóm; vai trò Quản trị / Biên tập / Xem; nhật ký hoạt động | Một người thuộc nhiều workspace không; gộp các tài khoản đang dùng chung Zoom thế nào |
| **P2-3** | Google Drive | Tự sao lưu MP4/M4A/transcript sau khi sync | Cần thêm quyền Drive → người dùng phải uỷ quyền Google lại; cấu trúc thư mục |
| **P2-4** | Google Calendar | Xem lịch họp sắp tới, gắn link video vào sự kiện | Lịch nào (cá nhân hay lịch chung của nhóm) |
| **P2-5** | Phụ đề tự động | Transcript của Zoom → phụ đề YouTube | Ngôn ngữ phụ đề mặc định; bật mặc định hay tuỳ chọn (tốn khoảng 400 đơn vị quota mỗi video) |
| **P2-6** | Zalo OA | Thông báo qua Zalo trên khung P2-1 | Có sẵn OA đã xác thực chưa |

Thứ tự đề xuất: **P2-1 → P2-2 → (P2-3, P2-5 song song) → P2-4 → P2-6**.

## 5. Giai đoạn 3 — Mở rộng (định hướng)

Trình tạo quy trình tự động "Khi … thì …", Facebook Page, Podcast RSS, tóm tắt buổi họp bằng AI và gợi ý tiêu đề/mô tả, bình chọn và hỏi đáp cho Word Cloud. Sẽ lập kế hoạch chi tiết khi giai đoạn 2 hoàn tất, vì chúng dựa trên khung kết nối và workspace.

---

## 6. Các quyết định cần anh/chị chốt

1. **P1-3**: recording mới thuộc về ai khi nhiều tài khoản dùng chung một Zoom?
2. **P1-8**: Telegram hay Zalo OA trước?
3. **P1-5**: các quy tắc cụ thể ban đầu (ví dụ nhóm "SOH", "GOH" → playlist nào)?
4. **P2-5**: phụ đề tự động bật mặc định hay để người dùng bật?
5. **Giai đoạn 2**: có cần Workspace ngay, hay tiếp tục mô hình mỗi người một kết nối?

## 7. Cách nghiệm thu chung cho mỗi task

- Test tự động của backend và frontend đều qua; build production qua.
- Thử trên giao diện thật: máy tính, điện thoại, chế độ tối, cả tiếng Việt và tiếng Anh.
- Sau deploy: Railway báo migration chạy thành công và backend khởi động; Vercel ở trạng thái *Ready*; không có lỗi mới lặp lại trong log.

---

*Cập nhật: 25/09/2026. Khi hoàn thành một task, đánh dấu ✅ cạnh mã task trong cả hai file kế hoạch.*
