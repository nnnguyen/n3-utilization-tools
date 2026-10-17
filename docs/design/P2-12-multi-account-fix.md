# P2-12 — Khôi phục Đa tài khoản & Sửa lỗi trùng lặp (Multi-account Fix)

## 1. Vấn đề hiện tại
- **Bản sao ma (Duplicates)**: Khi người dùng kết nối lại một tài khoản đã có, hệ thống đôi khi tạo ra một thẻ mới thay vì cập nhật thẻ cũ.
- **Hạn chế Single-account**: Để sửa lỗi trên, một giải pháp tạm thời đã được áp dụng để giới hạn mỗi dịch vụ (YouTube, Zoom) chỉ có 1 tài khoản. Tuy nhiên, người dùng muốn có nhiều tài khoản cho mỗi dịch vụ.

## 2. Nguyên nhân gốc rễ
- **Thiếu ID định danh sớm**: Trong luồng OAuth, bản ghi `Connection` đôi khi được tạo trước khi có `externalAccountId` (ví dụ: Channel ID hoặc Email), dẫn đến việc không thể so khớp với bản ghi cũ.
- **Logic Upsert chưa tối ưu**: Ràng buộc duy nhất dựa trên `userId`, `provider`, và `externalAccountId`. Nếu `externalAccountId` trống, việc so khớp sẽ thất bại.

## 3. Giải pháp kỹ thuật

### 3.1. Backend (ConnectionsService & OAuth Services)
- **Quy trình "Identify Before Save"**:
    1. Lấy thông tin tài khoản từ API bên thứ ba (YouTube, Zoom) trước khi gọi `ConnectionsService.save`.
    2. Đảm bảo `externalAccountId` luôn có giá trị chính xác.
- **Cập nhật Logic Save**:
    - Loại bỏ logic ép buộc "Single-account" (vốn đang tìm connection đầu tiên của provider).
    - Sử dụng `externalAccountId` làm khóa định danh chính để `upsert`.
    - Nếu tìm thấy bản ghi có cùng `{userId, provider, externalAccountId}`, hệ thống sẽ cập nhật trạng thái, credentials và settings.

### 3.2. Frontend (Integrations Page)
- **Hiển thị nút "Add New"**: Khôi phục khả năng thêm nhiều tài khoản cho Zoom và YouTube.
- **Định danh thẻ**: Hiển thị `externalAccountName` trên thẻ để người dùng phân biệt giữa các tài khoản khác nhau.

### 3.3. Dọn dẹp dữ liệu
- Cung cấp cơ chế (hoặc hướng dẫn người dùng) xóa các bản ghi "disabled" không có `externalAccountId` bằng nút **Delete** đã có.

## 4. Lợi ích
- Hỗ trợ đầy đủ đa tài khoản cho mọi dịch vụ.
- Không còn tình trạng trùng lặp cho cùng một tài khoản vật lý.
- Dữ liệu đồng bộ chính xác theo từng tài khoản.
