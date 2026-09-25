# P2-1 — Khung kết nối chung (Connector)

**Trạng thái**: ✅ Approved (25/09/2026 — dùng các phương án đề xuất ở mục 7) · Liên quan: [ROADMAP §2.1](../ROADMAP.md), [IMPLEMENTATION_PLAN.ai.md §4](../IMPLEMENTATION_PLAN.ai.md)

## 1. Mục tiêu

Hiện mỗi dịch vụ có bảng riêng (`YoutubeConfig`, `ZoomConfig`), khoá bí mật lưu dạng chữ thường, logic token/quota chỉ viết cho YouTube (`getTokenStatus`, `recordTokenRefresh`/`recordTokenError`, `trackQuotaUsage` trong `youtube.service.ts`) và ~24 chỗ đọc thẳng hai bảng này. Mục tiêu:

1. Một bảng `Connection` cho mọi ứng dụng, **mã hoá** khoá bí mật khi lưu.
2. Logic dùng chung: lưu/đọc khoá, theo dõi "sức khoẻ" token (làm mới, bị thu hồi, sắp hết hạn), quota theo ứng dụng.
3. Trang **Cài đặt → Tích hợp** dạng thẻ; thêm ứng dụng mới (Drive, Calendar, Zalo) chỉ cần khai báo provider + form.
4. Chuyển dữ liệu YouTube/Zoom **không gián đoạn** và có đường lùi.

Ngoài phạm vi: Workspace/phân quyền (P2-2 — `Connection` chừa chỗ cho `workspaceId`), đăng nhập Google (`User.googleId` là xác thực, không phải kết nối).

## 2. Mô hình dữ liệu

```prisma
model Connection {
  id                  String    @id @default(uuid())
  userId              String    // chủ sở hữu; P2-2 thêm workspaceId
  provider            String    // 'youtube' | 'zoom' | sau này 'google_drive', 'zalo_oa'…
  status              String    @default("active") // active | disabled | needs_reauth
  externalAccountId   String?   // Zoom account_id, YouTube channel id
  externalAccountName String?   // tên kênh / tài khoản hiển thị trên thẻ
  settings            Json      @default("{}") // không bí mật: clientId, accountId…
  credentials         String?   // JSON bí mật đã mã hoá: clientSecret, refreshToken, webhookSecretToken
  state               Json      @default("{}") // sổ sách riêng provider: channelVideosFetchedAt…
  tokenObtainedAt     DateTime?
  lastTokenRefreshAt  DateTime?
  tokenInvalidAt      DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  @@unique([userId, provider])            // mỗi người một kết nối/provider cho tới P2-2
  @@index([provider, externalAccountId])  // tìm chủ webhook Zoom (P1-3)
}

model QuotaUsage {           // tổng quát hoá YoutubeQuotaUsage
  id        String @id @default(uuid())
  userId    String
  provider  String
  date      String           // ngày theo múi giờ reset của provider (YouTube: Pacific)
  unitsUsed Int    @default(0)
  @@unique([userId, provider, date])
}
```

**Mã hoá**: AES-256-GCM (`node:crypto`), IV ngẫu nhiên mỗi lần ghi, lưu `v1:<iv>:<tag>:<ciphertext>` (base64). Khoá lấy từ env `CREDENTIALS_KEY` (32 byte, base64); `CREDENTIALS_KEY_PREVIOUS` (tuỳ chọn) để giải mã khi xoay khoá — lần ghi sau tự mã hoá lại bằng khoá mới. Không bao giờ log hay trả khoá về API (giữ quy tắc P1-1: chỉ trả cờ `hasClientSecret`…).

**Khai báo provider** (code, không phải DB): `{ id, authType: 'oauth2' | 'server_to_server', secretFields, scopes, tokenPolicy (YouTube: hết hạn 7 ngày ở chế độ Testing), quota: { dailyLimit, resetTimeZone } }`.

## 3. Chuyển dữ liệu (không gián đoạn)

Theo kiểu *mở rộng → chạy song song → chuyển → thu gọn*:

1. **Mở rộng**: migration chỉ thêm bảng. Mọi lần ghi vào `ZoomConfig`/`YoutubeConfig` (form Tích hợp, OAuth callback, ghi nhận token) **ghi kèm** vào `Connection`. Đọc vẫn từ bảng cũ.
2. **Chép dữ liệu cũ**: tác vụ chạy lại được nhiều lần, tự chạy khi backend khởi động (khoá bằng `pg_advisory_lock` để chỉ một instance chạy): chép từng dòng config sang `Connection` nếu chưa có hoặc cũ hơn; chép `YoutubeQuotaUsage` sang `QuotaUsage`.
3. **Chuyển đọc**: đọc từ `Connection` sau cờ env `CONNECTIONS_READ=true`; thiếu dòng thì rơi về bảng cũ. Bật trên production, theo dõi vài ngày; tắt cờ = lùi ngay.
4. **Thu gọn** (release riêng, cần duyệt vì xoá dữ liệu): bỏ ghi kèm, bỏ cờ, xoá `ZoomConfig`/`YoutubeConfig`/`YoutubeQuotaUsage` và các biến env dự phòng không còn dùng.

## 4. API

| Mới | Việc |
| --- | --- |
| `GET /connections` | Danh sách thẻ: provider, status, tên tài khoản, settings không bí mật, cờ `has<Secret>`, sức khoẻ token, quota hôm nay |
| `PATCH /connections/:provider` | Lưu settings + khoá (khoá rỗng = giữ nguyên, như P1-1) |
| `POST /connections/:provider/disconnect` | Xoá khoá, `status = disabled` (giữ lịch sử sync) |
| `GET /connections/:provider/status` | Sức khoẻ token — tổng quát hoá `GET /youtube/token-status` |

Giữ nguyên: `/integrations/config`, `/integrations/zoom|youtube` (thành lớp mỏng gọi `ConnectionsService`) cho tới khi frontend chuyển xong; luồng OAuth YouTube `/youtube/auth-url` + callback **giữ đúng redirect URI** đã đăng ký trên Google Cloud.

## 5. Giao diện

```
Cài đặt → Tích hợp
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│ [YouTube]            │ │ [zoom]               │ │ [Google Drive]       │
│ ● Đang hoạt động     │ │ ▲ Cần kết nối lại    │ │ ○ Sắp có             │
│ Kênh: <tên kênh>     │ │ Account: <account id>│ │                      │
│ Quota: 3.300/10.000  │ │                      │ │                      │
│ [Cấu hình] [Ngắt]    │ │ [Kết nối lại]        │ │                      │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
```
"Cấu hình" mở Drawer chứa form hiện có của provider (chuyển nguyên từ trang Tích hợp). Lưới 3 cột desktop, 1 cột dưới 768px; i18n; màu theo token theme.

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Mất/đổi sai `CREDENTIALS_KEY` → không giải mã được, mọi người phải nhập lại | Lưu khoá ở Railway **và** trình quản lý mật khẩu; xoay khoá có `CREDENTIALS_KEY_PREVIOUS`; khởi động báo lỗi rõ nếu thiếu khoá khi đã có dữ liệu mã hoá |
| Lỗi ghi kèm làm hai nơi lệch nhau | Đọc vẫn từ bảng cũ tới bước 3; tác vụ chép chạy lại được; test so khớp hai nơi |
| Đổi redirect URI làm hỏng OAuth YouTube | Giữ nguyên endpoint và URI |
| Tìm chủ webhook Zoom chậm/sai | Index `provider + externalAccountId`; test chọn chủ của P1-3 chạy trên dữ liệu mới |

## 7. Câu hỏi mở — đã chốt: dùng phương án đề xuất (25/09/2026)

1. **Quản lý khoá mã hoá** — Đề xuất: env `CREDENTIALS_KEY` (32 byte ngẫu nhiên) đặt trên Railway, xoay bằng `CREDENTIALS_KEY_PREVIOUS`. Phương án khác: dịch vụ KMS — an toàn hơn nhưng thêm phụ thuộc và chi phí, chưa cần ở quy mô hiện tại.
2. **Chuyển một lần hay dần dần** — Đề xuất: dần dần (mục 3), mỗi bước một release, có cờ lùi. Một lần: nhanh hơn ~1 task nhưng không có đường lùi nếu lỗi.
3. **Một kết nối mỗi provider mỗi người** cho tới P2-2 — Đề xuất: đồng ý; nhiều kênh YouTube/người để sau Workspace.
4. **Giữ credentials dự phòng trong env** (`YOUTUBE_CLIENT_ID`, `ZOOM_*`…) — Đề xuất: giữ `YOUTUBE_CLIENT_ID/SECRET` làm OAuth app mặc định (người dùng không phải tự tạo app Google); bỏ `YOUTUBE_REFRESH_TOKEN` và `ZOOM_*` ở bước thu gọn vì chỉ phục vụ đường "system".
5. **Khi nào thu gọn** (xoá bảng cũ) — Đề xuất: sau ≥ 1 tuần chạy ổn với `CONNECTIONS_READ=true`, bằng một task riêng anh/chị duyệt.

## 8. Các task triển khai

Mỗi task theo quy trình giai đoạn 1 (Definition of done trong IMPLEMENTATION_PLAN.ai.md). Migrations chỉ thêm, trừ P2-1f.

**P2-1a — Credentials cipher.** *Context*: none yet. *Changes*: `backend/src/connections/credentials-cipher.ts` (encrypt/decrypt JSON, `v1:` format, current + previous key); env `CREDENTIALS_KEY`, `CREDENTIALS_KEY_PREVIOUS` in `.env.example`, `docker-compose.yml`, README table. *Tests*: round-trip, tamper → throws, previous-key decrypt, wrong key → throws, missing key → clear error. *Acceptance*: `npm test` covers the cipher; no caller yet. *Out of scope*: DB.

**P2-1b — Schema, provider registry, ConnectionsService.** *Context*: `youtube.service.ts` (`getTokenStatus`, `recordTokenRefresh`, `recordTokenError`, `trackQuotaUsage`, `getQuotaStatus`), `integrations/public-config.ts`. *Changes*: `Connection` + `QuotaUsage` models; `connections/providers.ts` (youtube, zoom); `ConnectionsService` (get with decrypted secrets, upsert with "empty secret keeps value", markTokenRefreshed throttled, markTokenInvalid, pure `tokenHealth()` generalised from `getTokenStatus`); `QuotaService` (track/status per provider, reset time zone). *Tests*: service with mocked Prisma; `tokenHealth` spec reproducing today's YouTube behaviour. *Acceptance*: no behaviour change; build/tests pass. *Out of scope*: callers.

**P2-1c — Dual-write + backfill.** *Changes*: every write to `ZoomConfig`/`YoutubeConfig`/`YoutubeQuotaUsage` also writes `Connection`/`QuotaUsage`; idempotent `backfillConnections()` on startup under `pg_advisory_lock`. *Tests*: backfill twice → same rows; newer Connection not overwritten; secrets encrypted at rest. *Acceptance*: on production every config row has a Connection whose decrypted secrets match (checked by a one-off count query run by the human). *Out of scope*: reads.

**P2-1d — Switch reads behind `CONNECTIONS_READ`.** *Changes*: YouTube OAuth client/refresh token, Zoom access token, webhook owner lookup (`findWebhookOwner` → `externalAccountId`), quota, token status read through `ConnectionsService` when the flag is on (fallback to legacy when a row is missing); `/connections` API; `/integrations/*` become wrappers. *Tests*: existing suites pass with the flag on and off; webhook owner rule on Connection data. *Acceptance*: with the flag on in production, sync, webhook, quota and the token banner behave as before.

**P2-1e — Integrations page as cards.** *Changes*: Settings → Integrations grid of provider cards from `GET /connections` (status tag, account name, quota, actions), existing forms moved into a Drawer, "coming soon" cards; i18n, responsive (390/768/desktop), theme tokens. *Acceptance*: connect, configure, re-authorize and disconnect YouTube/Zoom from the cards.

**P2-1f — Contract (separate approval, destructive).** Remove dual-write, the flag and legacy tables/env fallbacks after ≥ 1 week stable.
