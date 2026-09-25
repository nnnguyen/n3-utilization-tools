# Prompt thực thi kế hoạch triển khai

Các prompt dưới đây dùng với Claude Code (hoặc AI tương tự) mở tại thư mục gốc của repo. Mỗi prompt tự chứa đủ bối cảnh, nên dùng được ở một phiên làm việc mới.

- Kế hoạch cho người đọc: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- Đặc tả cho AI: [IMPLEMENTATION_PLAN.ai.md](IMPLEMENTATION_PLAN.ai.md)

**Cách dùng**: copy nguyên khối prompt, thay các chỗ `[...]`, gửi cho AI. Mỗi prompt đã yêu cầu AI dừng lại ở các điểm cần anh/chị xác nhận.

---

## 0. Prompt dùng chung cho một task bất kỳ

Dùng khi muốn làm đúng một task (ví dụ làm lại, hoặc làm lẻ).

```text
Thực hiện task [MÃ TASK, ví dụ P1-2] trong docs/IMPLEMENTATION_PLAN.ai.md.

Yêu cầu:
1. Đọc kỹ mục "How to use this file", "Global rules" và đặc tả của task trước khi sửa code. Đọc các file trong phần Context.
2. Nếu task có "⚠ Decision required": hỏi tôi câu hỏi đó kèm phương án mặc định, rồi chờ tôi trả lời. Nếu tôi đã trả lời sẵn ở đây thì dùng câu trả lời này: [QUYẾT ĐỊNH, hoặc "không có"].
3. Nếu code thực tế khác đặc tả (thiếu file, tên hàm khác, hành vi khác): dừng lại và báo cho tôi, không tự ứng biến.
4. Làm đúng phạm vi task, không làm thêm phần "Out of scope".
5. Hoàn thành đủ "Definition of done": test backend + frontend, build, kiểm tra trên trình duyệt nếu có giao diện (máy tính và 390px, sáng và tối, tiếng Việt và tiếng Anh).
6. Báo cáo cho tôi bằng tiếng Việt: đã làm gì, file nào thay đổi, kết quả test, điểm cần tôi kiểm tra. Chưa commit; chờ tôi nói "commit và push".
```

---

## 1. Giai đoạn 1 — Củng cố

### 1a. Chốt quyết định trước (gửi một lần)

```text
Đây là các quyết định của tôi cho giai đoạn 1 trong docs/IMPLEMENTATION_PLAN.ai.md, hãy ghi vào mục tương ứng của cả docs/IMPLEMENTATION_PLAN.md và docs/IMPLEMENTATION_PLAN.ai.md (thay phần "Default proposal" bằng quyết định đã chốt), rồi báo lại cho tôi:

- P1-3 (nhiều tài khoản dùng chung một Zoom, recording mới thuộc về ai): [ví dụ: dùng phương án mặc định]
- P1-5 (quy tắc tạo sẵn): [ví dụ: không tạo sẵn / tên chứa "SOH" → playlist "..." ]
- P1-8 (kênh thông báo): [Telegram / Zalo OA]

Chưa sửa code trong bước này.
```

### 1b. Thực hiện cả giai đoạn 1, từng task một

```text
Thực hiện giai đoạn 1 trong docs/IMPLEMENTATION_PLAN.ai.md theo thứ tự sau, mỗi lần MỘT task:

P1-1 → P1-2 → P1-6 → P1-7 → P1-3 → P1-4 → P1-5 → P1-9 → P1-8

Quy trình cho mỗi task:
1. Đọc "How to use this file", "Global rules" và đặc tả task; đọc các file trong Context.
2. Task có "⚠ Decision required": dùng quyết định đã ghi trong file kế hoạch; nếu chưa có thì hỏi tôi và chờ.
3. Code khác đặc tả → dừng lại báo tôi.
4. Làm đủ "Definition of done" (test, build, kiểm tra giao diện nếu có).
5. Báo cáo ngắn bằng tiếng Việt (đã làm gì, file thay đổi, kết quả test, điểm tôi cần kiểm tra), rồi DỪNG và chờ tôi:
   - "commit và push" → commit theo Conventional Commits, push, rồi kiểm tra deploy (Railway: migration + khởi động; Vercel: Ready) và báo kết quả;
   - "tiếp" → chuyển sang task kế tiếp;
   - góp ý → sửa theo góp ý trước.
6. Sau khi xong một task: đánh dấu ✅ cạnh mã task trong cả hai file kế hoạch.

Không gộp nhiều task vào một commit. Không bắt đầu task tiếp theo khi tôi chưa nói "tiếp".
```

### 1c. Kiểm tra lại sau khi xong giai đoạn 1

```text
Giai đoạn 1 đã xong. Hãy rà soát lại toàn bộ:
1. Đối chiếu từng task P1-1 … P1-9 trong docs/IMPLEMENTATION_PLAN.ai.md với code hiện tại: tiêu chí "Acceptance" đã đạt chưa? Liệt kê mục nào chưa đạt và vì sao.
2. Chạy đủ test và build của backend và frontend.
3. Xem log production gần nhất trên Railway: có lỗi mới hoặc lỗi lặp lại nào không?
4. Báo cáo bằng tiếng Việt, kèm đề xuất sửa nếu có. Chưa sửa code.
```

---

## 2. Giai đoạn 2 — Nền tảng hub

Giai đoạn 2 đi theo hai bước cho mỗi hạng mục: **viết thiết kế → tôi duyệt → mới làm**.

### 2a. Viết bản thiết kế cho một hạng mục

```text
Viết bản thiết kế cho hạng mục [MÃ, ví dụ P2-1] trong mục 4 của docs/IMPLEMENTATION_PLAN.ai.md.

Yêu cầu:
1. Đọc bảng mục 4 (cột "Must cover" và "Open questions") và code liên quan hiện có trước khi viết.
2. Lưu vào docs/design/[MÃ]-[tên-ngắn].md, tối đa khoảng 2 trang, gồm: mục tiêu, mô hình dữ liệu, cách chuyển dữ liệu hiện có (không gián đoạn dịch vụ), API, phác thảo giao diện, các bước triển khai, rủi ro.
3. Liệt kê các câu hỏi mở kèm phương án đề xuất cho từng câu.
4. Tách phần triển khai thành các task nhỏ (mã P2-1a, P2-1b, …) theo đúng định dạng task của giai đoạn 1 (Context / Changes / Tests / Acceptance / Out of scope) — viết thẳng vào bản thiết kế.
5. Chưa sửa code. Báo tôi đường dẫn file và các câu hỏi mở, rồi chờ duyệt.
```

Thứ tự đề xuất: **P2-1 → P2-2 → P2-3 và P2-5 → P2-4 → P2-6**.

### 2b. Triển khai hạng mục đã được duyệt

```text
Bản thiết kế docs/design/[FILE].md đã được tôi duyệt, với các câu trả lời cho câu hỏi mở như sau: [CÂU TRẢ LỜI, hoặc "dùng phương án đề xuất"].

1. Cập nhật bản thiết kế với các câu trả lời trên và đánh dấu "Approved".
2. Thêm các task con (P2-xa, P2-xb, …) vào mục 4 của docs/IMPLEMENTATION_PLAN.ai.md, trỏ tới bản thiết kế.
3. Thực hiện các task con theo thứ tự, mỗi lần MỘT task, với cùng quy trình như giai đoạn 1: đủ Definition of done, báo cáo bằng tiếng Việt, rồi DỪNG chờ tôi nói "commit và push" hoặc "tiếp".
4. Với thay đổi database: migration phải an toàn khi deploy (chỉ thêm, có giá trị mặc định); nếu cần chuyển dữ liệu, viết thành bước riêng có thể chạy lại nhiều lần mà không lỗi.
```

---

## 3. Giai đoạn 3 — Mở rộng

Giai đoạn 3 hiện chỉ có định hướng. Bắt đầu bằng việc lập kế hoạch chi tiết:

### 3a. Lập kế hoạch chi tiết giai đoạn 3

```text
Giai đoạn 2 đã xong. Hãy lập kế hoạch chi tiết cho giai đoạn 3 (mục 5 của docs/IMPLEMENTATION_PLAN.ai.md và mục 5 của docs/IMPLEMENTATION_PLAN.md):

1. Đọc docs/ROADMAP.md (các mục 2.2, 3, 5, 6), các bản thiết kế trong docs/design/ và code hiện tại (đặc biệt khung Connector và Workspace).
2. Đề xuất danh sách hạng mục giai đoạn 3 kèm thứ tự, độ khó, phụ thuộc — hỏi tôi chọn hạng mục nào làm trước.
3. Sau khi tôi chọn: viết vào cả hai file kế hoạch theo đúng định dạng hiện có (bản cho người đọc bằng tiếng Việt; bản cho AI bằng tiếng Anh). Hạng mục lớn thì ghi là "design first" như giai đoạn 2.
4. Với các tính năng AI: ghi rõ dữ liệu nào được gửi ra ngoài, tính năng bật theo từng workspace, và chi phí ước tính.
5. Chưa sửa code.
```

### 3b. Thực hiện

Dùng lại prompt **2a** (viết thiết kế) và **2b** (triển khai) với mã hạng mục của giai đoạn 3.

---

## 4. Prompt hỗ trợ

### Kiểm tra deploy

```text
Kiểm tra deploy của backend (Railway) và frontend (Vercel) cho commit mới nhất trên main: trạng thái build, migration đã chạy chưa, backend đã khởi động chưa, Vercel đã Ready chưa, và có lỗi mới lặp lại trong log production không. Báo cáo bằng tiếng Việt.
```

### Tiếp tục khi phiên làm việc bị gián đoạn

```text
Tôi đang thực hiện docs/IMPLEMENTATION_PLAN.ai.md. Hãy xem các task đã đánh dấu ✅, git log và git status để xác định task đang làm dở, tóm tắt tình trạng cho tôi bằng tiếng Việt, rồi chờ tôi xác nhận trước khi làm tiếp.
```

### Cập nhật kế hoạch khi thay đổi hướng đi

```text
Tôi muốn thay đổi kế hoạch như sau: [MÔ TẢ THAY ĐỔI].
Cập nhật cả docs/IMPLEMENTATION_PLAN.md và docs/IMPLEMENTATION_PLAN.ai.md cho nhất quán (giữ nguyên mã task đã có, task mới dùng mã tiếp theo), cập nhật docs/ROADMAP.md nếu cần, rồi báo cho tôi những gì đã đổi. Chưa sửa code.
```
