# P2-9 — Microsoft OneDrive Integration (Priority)

**Trạng thái**: Draft · Liên quan: [ROADMAP §2.1](../ROADMAP.md), [P2-1](P2-1-connector.md), [P2-3](P2-3-google-drive.md), [IMPLEMENTATION_PLAN.ai.md §4](../IMPLEMENTATION_PLAN.ai.md)

## 1. Mục tiêu
Tương tự như Google Drive (P2-3), hệ thống cho phép người dùng tự động sao lưu các tệp ghi âm Zoom (MP4, M4A) và phụ đề (VTT) vào **Microsoft OneDrive**. Đây là tính năng ưu tiên để đa dạng hóa các lựa chọn lưu trữ cho người dùng, đặc biệt là các doanh nghiệp sử dụng Microsoft 365.

## 2. Mô hình dữ liệu và Cấu hình
OneDrive sẽ được tích hợp như một `Provider` mới trong khung `Connector` (P2-1).

### 2.1. Khai báo Provider
```typescript
// backend/src/connections/providers.ts
onedrive: {
  id: "onedrive",
  authType: "oauth2",
  settingsFields: ["clientId", "tenantId"], // Hỗ trợ cả Multi-tenant (common) và Single-tenant
  secretFields: ["clientSecret", "refreshToken"],
  connectedWhen: "refreshToken",
  scopes: ["offline_access", "Files.ReadWrite.AppFolder"], // Chỉ quyền trong thư mục ứng dụng để đảm bảo an toàn
  tokenPolicy: null,
  quota: null,
}
```

### 2.2. Lưu trữ dữ liệu
Dữ liệu được lưu trong bảng `Connection` của từng Workspace:
- `provider`: "onedrive"
- `externalAccountId`: Email tài khoản Microsoft.
- `externalAccountName`: Tên hiển thị của người dùng.
- `credentials`: Chứa `clientSecret` và `refreshToken` (đã mã hóa).
- `settings`: Chứa `clientId` và `tenantId` (mặc định là `common`).

## 3. Kiến trúc và Luồng xử lý

### 3.1. OAuth Flow (Microsoft Graph API)
- **Authorization URL**: `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize`
- **Token Endpoint**: `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- **Redirect URI**: `/api/connections/onedrive/callback`
- Sử dụng thư viện `@microsoft/microsoft-graph-client` (hoặc gọi REST trực tiếp) để tương tác.

### 3.2. Sao lưu (Backup)
Luồng sao lưu diễn ra sau khi quá trình tải lên YouTube hoàn tất (hoặc song song):
1. Kiểm tra cấu hình sao lưu OneDrive của Workspace.
2. Nếu bật, tạo cấu trúc thư mục trong OneDrive: `Apps/N3Connect/Zoom Recordings/{Meeting Topic} ({Date})/`.
3. Tải các tệp lên OneDrive. Với tệp lớn (MP4), sử dụng **Resumable Upload** (tạo `uploadSession`).
4. Ghi nhận trạng thái sao lưu vào `ZoomSyncLog`.

## 4. Giao diện (Frontend)
- **Thẻ Tích hợp**: Thêm thẻ Microsoft OneDrive trong **Cài đặt → Tích hợp**.
- **Form Cấu hình**: Nhập `Client ID`, `Client Secret`, `Tenant ID`.
- **Workflow Settings**: Thêm tùy chọn "Backup to OneDrive" trong trang quản lý Zoom.

## 5. Các Task thực hiện

### P2-9a — OneDrive Service & OAuth
- Tạo `OneDriveService` xử lý OAuth flow.
- Cấu hình Provider trong `backend/src/connections/providers.ts`.
- Endpoint callback để lưu `Connection`.

### P2-9b — OneDrive Backup Flow
- Implement logic upload file (hỗ trợ resumable upload cho file lớn).
- Tích hợp vào `DriveBackupService` để hỗ trợ đa mục tiêu (Google Drive hoặc OneDrive).
- Xử lý retry khi upload lỗi.

### P2-9c — Frontend UI
- Thẻ OneDrive trong danh sách kết nối.
- Cài đặt Workflow cho phép chọn OneDrive làm đích đến.
- Hiển thị dung lượng OneDrive (Quota).

## 6. Rủi ro và Giải quyết
- **Hết hạn Token**: OneDrive refresh token có thể hết hạn sau 90 ngày nếu không dùng. Khung Connector đã có cơ chế báo `needs_reauth`.
- **Tốc độ Upload**: MP4 có thể nặng. Dùng Resumable Upload và xử lý bất đồng bộ (Background job).
- **Quota**: Microsoft Graph API có rate limit. Sử dụng cơ chế exponential backoff.

## 7. Câu hỏi mở
1. **Lưu trữ ở đâu?** — Đề xuất: `Files.ReadWrite.AppFolder` (thư mục `Apps/N3Connect`). An toàn nhất vì ứng dụng không thấy file khác của người dùng.
2. **Dùng chung App Microsoft?** — Đề xuất: Cho phép người dùng tự nhập Client ID/Secret của họ (giống YouTube/Zoom hiện tại) để họ toàn quyền kiểm soát quota và thương hiệu ứng dụng.
