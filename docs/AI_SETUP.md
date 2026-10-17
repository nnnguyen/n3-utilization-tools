# Hướng dẫn cấu hình AI (OpenAI API Key)

Tài liệu này hướng dẫn cách lấy và cấu hình OpenAI API Key để sử dụng các tính năng AI (AI Title, AI Summary) trong dự án n3-utilization-tools.

## 1. Cách lấy OpenAI API Key

1.  **Truy cập OpenAI Platform**:
    *   Đến địa chỉ: [https://platform.openai.com/](https://platform.openai.com/)
    *   Đăng nhập hoặc đăng ký tài khoản mới.

2.  **Tạo API Key**:
    *   Trong thanh menu bên trái, chọn **API Keys**.
    *   Nhấp vào nút **+ Create new secret key**.
    *   Đặt tên cho key (ví dụ: `n3-utilization-tools`) và nhấn **Create secret key**.
    *   **LƯU Ý**: Hãy sao chép và lưu key này ở nơi an toàn ngay lập tức. Bạn sẽ không thể xem lại key sau khi đóng cửa sổ thông báo.

3.  **Nạp tiền (Billing)**:
    *   OpenAI API hoạt động theo hình thức trả phí theo mức sử dụng (Pay-as-you-go).
    *   Bạn cần truy cập mục **Settings** -> **Billing** để nạp một số tiền nhỏ (tối thiểu 5$) để key có hiệu lực.

## 2. Cấu hình vào dự án

Sau khi có API Key, bạn cần thêm nó vào file biến môi trường của backend.

1.  Mở file `backend/.env` (nếu chưa có, hãy copy từ `.env.example`).
2.  Thêm hoặc cập nhật dòng sau:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

3.  Khởi động lại backend để áp dụng thay đổi.

## 3. Các tính năng hỗ trợ

Hiện tại, hệ thống hỗ trợ:
- **AI Title**: Tự động tạo tiêu đề cho video ghi âm dựa trên nội dung cuộc họp.
- **AI Summary**: Tóm tắt các ý chính và hành động cần làm (Action Items).

Các cài đặt này có thể bật/tắt trong giao diện **Zoom Utilities** của ứng dụng.
