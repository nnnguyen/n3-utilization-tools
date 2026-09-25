# P2-2 — Workspace và phân quyền

**Trạng thái**: ✅ Approved (25/09/2026 — dùng các phương án đề xuất ở mục 7, gồm super admin ở mục 6b; email tạm không dùng từ 26/09/2026, mục 6c) · Liên quan: [ROADMAP §2.3](../ROADMAP.md), [P2-1](P2-1-connector.md), [IMPLEMENTATION_PLAN.ai.md §4](../IMPLEMENTATION_PLAN.ai.md)

## 1. Mục tiêu và vấn đề hiện tại

Mọi dữ liệu đang thuộc **từng tài khoản** (`userId`): kết nối, lịch sử sync, quy tắc, cache video, quota. Trong khi thực tế **nhiều người dùng chung một tài khoản Zoom/kênh YouTube**:

- Mỗi người phải tự nhập lại cùng một bộ khoá; webhook phải đoán "chủ" bằng quy tắc thời gian (P1-3).
- **Lỗi dữ liệu**: `ZoomSyncLog.recordingId` là `@unique` toàn hệ thống. Khi người thứ hai sync cùng một recording, `upsert` (`zoom.service.ts`, `youtube-match.service.ts`) **ghi đè log của người thứ nhất** mà vẫn giữ `userId` cũ.
- Không phân quyền (ai cũng có thể sửa kết nối, xoá video), không biết ai đã làm gì.

Mục tiêu: **Workspace** (nhóm) sở hữu kết nối và dữ liệu Zoom/YouTube; thành viên có **vai trò**; có **nhật ký hoạt động**; **super admin** quản trị toàn hệ thống. **Vẫn cho tự đăng ký**: người tự đăng ký là owner của workspace cá nhân tạo sẵn cho họ và không có vai trò ở workspace nào khác. Ngoài phạm vi: Word Cloud (`Topic` vẫn thuộc cá nhân), tuỳ chọn cá nhân (giao diện, ngôn ngữ, email thông báo), thanh toán.

## 2. Mô hình dữ liệu

```prisma
model Workspace {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
}
model Membership {
  workspaceId String
  userId      String
  role        String   // 'owner' | 'admin' | 'editor' | 'viewer'
  createdAt   DateTime @default(now())
  @@id([workspaceId, userId])
}
model WorkspaceInvite {           // mời bằng link (chưa có SMTP trên production)
  id String @id @default(uuid())
  workspaceId String; role String; tokenHash String @unique
  createdById String; expiresAt DateTime; acceptedById String?; acceptedAt DateTime?
}
model ActivityLog {
  id String @id @default(uuid())
  workspaceId String; actorId String?   // null = hệ thống (webhook, tự thử lại)
  action String                         // 'connection.updated', 'sync.started', 'video.deleted'…
  targetType String?; targetId String?; data Json?; createdAt DateTime @default(now())
  @@index([workspaceId, createdAt])
}
// User: activeWorkspaceId String?   — workspace đang chọn
//       platformRole String @default("user")   // 'user' | 'super_admin'
//       isLocked Boolean @default(false)
//       mustChangePassword Boolean @default(false); tempPasswordExpiresAt DateTime?
```

**Chuyển sang workspace** (thêm `workspaceId`): `Connection` (`@@unique([workspaceId, provider])`), `ZoomWorkflowSettings`, `ZoomSyncRule`, `ZoomSyncLog` (`@@unique([workspaceId, recordingId])` thay cho unique toàn cục), `ChannelVideoCache`, `ZoomYoutubeMatchDismissal`, `QuotaUsage` (quota thuộc kênh YouTube → thuộc workspace). **Giữ theo người**: `Notification` (gửi tới từng thành viên), `User` preferences, `Topic`/Word Cloud. `userId` trên các bảng chuyển đi được giữ lại làm "người thực hiện".

**Vai trò**

| Quyền | owner | admin | editor | viewer |
| --- | :-: | :-: | :-: | :-: |
| Xem kênh, recording, lịch sử, thống kê | ✓ | ✓ | ✓ | ✓ |
| Sync, liên kết video, sửa/xoá video, playlist | ✓ | ✓ | ✓ | |
| Automation Workflow, quy tắc theo cuộc họp | ✓ | ✓ | ✓ | |
| Kết nối/ngắt YouTube, Zoom; mời, đổi vai trò, xoá thành viên | ✓ | ✓ | | |
| Đổi tên, xoá workspace, chuyển quyền owner | ✓ | | | |

## 3. Chuyển dữ liệu (không gián đoạn)

1. **Mở rộng**: thêm bảng mới và cột `workspaceId` **nullable**. Tác vụ chạy lại được: mỗi người dùng có một **workspace cá nhân** (owner = chính họ, `activeWorkspaceId` trỏ tới đó); gán `workspaceId` cho mọi dòng của họ. Code mới tạo dòng luôn kèm `workspaceId`.
2. **Chuyển truy vấn**: service lọc theo workspace đang chọn thay vì `userId` (guard kiểm tra vai trò). Mặc định mỗi người chỉ có workspace của mình → **hành vi không đổi** cho tới khi có người được mời.
3. **Gộp tài khoản dùng chung Zoom** (câu hỏi 2): gợi ý trên giao diện, người dùng tự quyết.
4. **Thu gọn** (duyệt riêng): `workspaceId` NOT NULL, bỏ các unique theo `userId`.

Nên làm **sau P2-1f** (bảng cũ `ZoomConfig`/`YoutubeConfig` đã xoá), để không phải chuyển thêm hai bảng sắp bỏ.

## 4. API

| Endpoint | Quyền |
| --- | --- |
| `GET /workspaces` (của tôi, kèm vai trò) · `POST /workspaces` · `PATCH /workspaces/:id` · `POST /workspaces/:id/activate` | thành viên / owner |
| `GET /workspaces/:id/members` · `PATCH …/members/:userId` (vai trò) · `DELETE …/members/:userId` | admin |
| `POST /workspaces/:id/invites` → link `…/invite/<token>` (hết hạn 7 ngày) · `POST /invites/:token/accept` | admin / người được mời |
| `GET /workspaces/:id/activity?cursor=` | thành viên |

Các API hiện có giữ nguyên đường dẫn; `WorkspaceGuard` lấy workspace từ `User.activeWorkspaceId`, decorator `@RequireRole('editor')` trên từng route.

## 5. Giao diện

- **Header**: menu chọn workspace (tên + vai trò), "Tạo workspace".
- **Cài đặt → Workspace**: đổi tên; bảng thành viên (vai trò, xoá); "Mời thành viên" → chọn vai trò → copy link.
- **Cài đặt → Nhật ký hoạt động**: bảng thời gian / người / hành động / đối tượng, lọc theo loại.
- Nút bị ẩn/khoá theo vai trò (ví dụ viewer không thấy "Sync", "Ngắt kết nối"). Responsive, i18n, token theme như các trang khác.

## 6b. Super admin và trang quản trị hệ thống

- **Chọn super admin**: `User.platformRole = 'super_admin'` trong DB, cấp/thu trên trang quản trị. Super admin đầu tiên: env `BOOTSTRAP_SUPER_ADMIN_EMAIL` — **chỉ có tác dụng khi hệ thống chưa có super admin nào** (tài khoản có email đó được nâng quyền khi đăng nhập). Không gỡ được super admin cuối cùng. Đăng ký công khai không bao giờ cho quyền này.
- **Quyền**: toàn quyền — xem/sửa/xoá mọi workspace và thành viên; vào workspace không phải của mình thì hiện dải "Đang xem với quyền quản trị hệ thống".
- **Trang Quản trị → Tài khoản**: danh sách, tìm kiếm; khoá/mở; xác thực/bỏ xác thực email; cấp/thu super admin; đặt lại mật khẩu tạm; xoá (xác nhận). **Quản trị → Workspace**: danh sách, tạo, đổi tên, xoá, quản lý thành viên của bất kỳ workspace nào.
- **Thêm người**: **link mời**, hoặc **tạo thủ công**: nhập email, tên, (tuỳ chọn) workspace + vai trò → hệ thống **tự sinh mật khẩu tạm** → tuỳ chọn "đánh dấu email đã xác thực" (mặc định bật) và "bắt buộc đổi mật khẩu lần đầu" (mặc định bật) → **hiện mật khẩu tạm một lần** để copy gửi (khi có email: nút "Tạo và gửi email", super admin không xem mật khẩu). Khi còn `mustChangePassword`, đăng nhập xong chỉ vào được màn hình đổi mật khẩu (API khác trả 403). Không bắt buộc đổi thì mật khẩu tạm **hết hạn sau 30 ngày** nếu chưa tự đổi. "Đặt lại mật khẩu tạm" tạo mật khẩu mới và làm mật khẩu cũ mất hiệu lực.
- Mọi thao tác của super admin ghi vào `ActivityLog` (không bao giờ ghi mật khẩu). Đăng nhập Google vẫn dùng được cho tài khoản tạo thủ công (liên kết theo email, đã có trong `validateOAuthUser`).

## 6c. Email — tạm không dùng

Railway chỉ cho SMTP ra ngoài ở gói Pro trở lên, và app chỉ có domain miễn phí `*.vercel.app` (không xác minh được domain cho Resend/…), nên production **không gửi email**.

**Đã chốt (26/09/2026)**: **tạm không dùng email**. Hệ quả cho P2-2:
- **Tạo tài khoản thủ công**: mật khẩu tạm tự sinh được **hiện một lần** cho super admin để copy gửi (Zalo…); các lớp bảo vệ ở mục 6b giữ nguyên (buộc đổi lần đầu mặc định, không buộc thì hết hạn 30 ngày, "đặt lại mật khẩu tạm" vô hiệu mật khẩu cũ).
- **Mời thành viên**: **link mời** + thông báo trong chuông cho người đã có tài khoản.
- **Xác thực email / quên mật khẩu**: người tự đăng ký bằng email/mật khẩu hiện **không đăng nhập được** vì email xác thực không tới (đăng nhập Google không bị ảnh hưởng). Super admin **đánh dấu đã xác thực** và **đặt lại mật khẩu tạm** trên trang quản trị (P2-2h) thay cho hai email này.
- Mọi nút "gửi email" chỉ hiện khi email được cấu hình (`emailConfigured`), để sau này bật email chỉ cần đặt biến, không phải sửa giao diện.
- `MailService` **không được log nội dung email** khi chưa cấu hình (hiện đang log cả link xác thực/đặt lại mật khẩu vào log Railway) — làm trong P2-2h.

Bật lại sau: có domain riêng → Resend; hoặc Railway Pro → SMTP Gmail (App Password).

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Quên lọc theo workspace ở một truy vấn → lộ dữ liệu nhóm khác | Guard bắt buộc cho mọi route có dữ liệu Zoom/YouTube; test e2e "thành viên workspace A không đọc được dữ liệu B" cho từng controller |
| Chuyển dữ liệu sai workspace | Bước 1 chạy lại được, đếm và log số dòng; mỗi người chỉ có workspace cá nhân nên kết quả = hiện trạng |
| Link mời bị lộ | Lưu hash token, hết hạn 7 ngày, dùng một lần, admin thu hồi được |
| Đổi unique của `ZoomSyncLog` | Thêm unique mới trước, sửa mọi `upsert where: { recordingId }`, bỏ unique cũ ở bước thu gọn |
| Super admin toàn quyền bị lạm dụng/lộ | Cấp/thu trong app có nhật ký; env khởi tạo bị bỏ qua khi đã có super admin; không gỡ được super admin cuối |
| Mật khẩu tạm bị lộ khi gửi qua tin nhắn | Mặc định buộc đổi lần đầu; không buộc thì hết hạn 30 ngày; đặt lại vô hiệu mật khẩu cũ; chỉ hiện một lần |

## 7. Câu hỏi mở — đã chốt: dùng phương án đề xuất (25/09/2026)

1. **Một người thuộc nhiều workspace?** — Đề xuất: **có** (ví dụ vừa nhóm SOH vừa nhóm GOH), chọn workspace đang dùng ở header; lựa chọn lưu trên tài khoản (`User.activeWorkspaceId`) như tuỳ chọn giao diện. Phương án khác: gửi `X-Workspace-Id` từ trình duyệt để mỗi tab một workspace — linh hoạt hơn nhưng phức tạp hơn.
2. **Gộp các tài khoản đang dùng chung một Zoom** — Đề xuất: không gộp tự động. Workspace của **chủ webhook hiện tại** (quy tắc P1-3) hiện gợi ý "N tài khoản khác dùng cùng Zoom này — mời vào workspace?". Khi người được mời chấp nhận: kết nối Zoom trong workspace cá nhân của họ bị tắt; lịch sử sync của họ **giữ nguyên** ở workspace cá nhân (không trộn). Phương án khác: chuyển luôn lịch sử sang workspace chung (gộp trùng theo `recordingId`) — gọn hơn nhưng khó hoàn tác.
3. **Mời bằng gì** — Đã chốt: **link mời** để copy gửi qua Zalo/Messenger + thông báo trong chuông cho người đã có tài khoản (email tạm không dùng, mục 6c). Super admin còn có "tạo thủ công" (mục 6b).
4. **Vai trò mặc định khi mời** — Đề xuất: `editor`.
5. **Thông báo sync** gửi cho ai — Đề xuất: người bấm sync (sync thủ công); với webhook/tự thử lại: mọi owner/admin/editor của workspace.
6. **Đăng ký** — Đã chốt: **giữ tự đăng ký**; thêm super admin toàn quyền (mục 6b).
7. **Chọn super admin** — Đề xuất: lưu trong DB + env `BOOTSTRAP_SUPER_ADMIN_EMAIL` chỉ dùng lần đầu.
8. **Tạo tài khoản thủ công** — Đề xuất: như mục 6b (mật khẩu tạm tự sinh gửi qua email; mặc định buộc đổi; không buộc thì hết hạn 30 ngày).
9. **Dịch vụ email** — **Đã chốt (26/09/2026): tạm không dùng email** (mục 6c).

## 8. Các task triển khai

Mỗi task theo Definition of done của IMPLEMENTATION_PLAN.ai.md. P2-2a → P2-2h làm sau P2-1f; P2-2i (email) hoãn. Thứ tự đề xuất: a → b → c → h → d → e → f → g.

**P2-2a — Schema + personal workspaces.** *Changes*: `Workspace`, `Membership`, `WorkspaceInvite`, `ActivityLog`, `User.activeWorkspaceId`; nullable `workspaceId` on the tables of §2 plus `@@unique([workspaceId, recordingId])` on `ZoomSyncLog`; idempotent startup backfill (one personal workspace per user, owner membership, `workspaceId` on every row, summary log). *Tests*: backfill twice → same rows; every row gets its owner's workspace. *Acceptance*: production counts: rows with null `workspaceId` = 0. *Out of scope*: queries.

**P2-2b — Workspace context and roles.** *Changes*: `WorkspaceGuard` (active workspace from `User.activeWorkspaceId`, membership required), `@RequireRole()`, `/workspaces` list/create/rename/activate. *Tests*: guard allows/denies per role; switching changes the active workspace. *Acceptance*: no behaviour change for single-workspace users.

**P2-2c — Scope data by workspace.** *Changes*: services read/write by `workspaceId` (connections, workflow settings, rules, sync logs incl. every `upsert where recordingId` → `workspaceId_recordingId`, channel cache, dismissals, quota); webhook owner resolves to a workspace connection; sync notifications per §7.5. *Tests*: e2e isolation (member of A cannot read or change B) for each controller; two workspaces syncing the same recording keep separate logs. *Acceptance*: existing flows unchanged; the overwrite bug is gone.

**P2-2d — Members and invites.** *Changes*: members API + invite links (hashed token, 7-day expiry, single use, revoke); Settings → Workspace page; header switcher; role-based hiding of actions. *Acceptance*: invite, accept, change role, remove; a viewer cannot sync or disconnect (API 403, buttons hidden).

**P2-2e — Activity log.** *Changes*: `ActivityService.record()` at the write points (connections, workflow/rules, manual sync, link/unlink, video/playlist edits and deletes, members); Settings → Activity page with filters and cursor pagination. *Acceptance*: each listed action appears with actor and target.

**P2-2f — Shared Zoom suggestion.** *Changes*: detect other workspaces whose Zoom connection has the same `externalAccountId`; suggestion card for admins of the webhook-owner workspace with a prefilled invite. *Acceptance*: accepting disables the invitee's personal Zoom connection; history stays put.

**P2-2h — Super admin and system admin pages.** *Changes*: `User.platformRole`, `isLocked`, `mustChangePassword`, `tempPasswordExpiresAt`; bootstrap from `BOOTSTRAP_SUPER_ADMIN_EMAIL` only while no super admin exists; `SuperAdminGuard`; admin API + pages (accounts: list/search, lock, verify, grant/revoke super admin, reset temp password, delete; workspaces: list/create/rename/delete/members of any workspace); manual account creation with a generated temp password shown once (emailed instead when email is configured), must-change-password gate (all other APIs 403), 30-day expiry when not forced; locked accounts cannot log in; every action in `ActivityLog`; `MailService` logs only recipient and subject when unconfigured (never the body). *Tests*: bootstrap only when zero super admins; last super admin cannot be removed; must-change gate; expiry; locked login refused; non-admins get 403. *Acceptance*: a super admin creates an account, copies its temp password, and the user must change it at first login; a self-registered email account that cannot receive its verification email is verified by a super admin.

**P2-2i — Email (deferred).** Not scheduled: email is off for now (§6c). When re-enabled: Resend with an own domain, or Gmail SMTP on Railway Pro; the "send by email" actions appear once `emailConfigured` is true.

**P2-2g — Contract (separate approval).** `workspaceId` NOT NULL; drop `userId`-based uniques (`ZoomSyncLog.recordingId`, `Connection [userId, provider]`…).
