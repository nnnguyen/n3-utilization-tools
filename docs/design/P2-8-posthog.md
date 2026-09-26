# P2-8 — Phân tích sản phẩm với PostHog

**Trạng thái**: ✅ Approved (26/09/2026 — dùng các phương án đề xuất ở mục 6) · Liên quan: [IMPLEMENTATION_PLAN.ai.md §4 (P2-7, P2-8)](../IMPLEMENTATION_PLAN.ai.md), [P2-2 Workspace](P2-2-workspaces.md)

## 1. Mục tiêu

Vercel Web Analytics (P2-7) cho biết *trang nào được xem*. PostHog trả lời *người dùng có làm được việc không*:

- **Kích hoạt**: bao nhiêu tài khoản đi hết Đăng ký → Kết nối Zoom → Kết nối YouTube → Sync thành công đầu tiên; rơi ở bước nào.
- **Tính năng được dùng**: tự upload, quy tắc theo cuộc họp, lên lịch công khai, liên kết video có sẵn, phụ đề (P2-5), Word Cloud.
- **Độ tin cậy**: tỉ lệ sync lỗi theo mã lỗi (quota, token hết hạn, video quá dài…), theo nguồn (webhook / thủ công / tự thử lại).
- **Về sau**: feature flag để bật tính năng mới cho một vài tài khoản trước; dashboard cho super admin.

Ngoài phạm vi: marketing/quảng cáo, A/B test giao diện, theo dõi khán giả Word Cloud.

## 2. Nguyên tắc riêng tư

- **Định danh bằng `user.id`** (UUID nội bộ), không gửi email/tên. Thuộc tính người dùng chỉ gồm: ngôn ngữ, kiểu giao diện, `platformRole`, ngày tạo.
- **Không tự động ghi mọi cú click** (`autocapture: false`): chỉ gửi các sự kiện liệt kê ở mục 3 — danh sách rõ ràng, không vô tình lấy chữ trên màn hình (mật khẩu tạm ở trang Quản trị, khoá ở Drawer Tích hợp).
- **URL bỏ query string** trước khi gửi (dùng lại `withoutQuery` của P2-7).
- **Không ghi lại phiên (session replay)** ở giai đoạn đầu (câu hỏi mở 2).
- **Trang công khai Word Cloud** (`/word-cloud/join/…`): không nạp PostHog. Số liệu Word Cloud chỉ gửi từ backend, dạng tổng hợp (số câu hỏi, số người tham gia), gắn với người trình chiếu.
- **Đồng ý (consent)**: lần đầu đăng nhập hiện thông báo ngắn "Giúp cải thiện N3 Connect bằng dữ liệu sử dụng ẩn danh?" (Đồng ý / Không). Lưu trên tài khoản (`User.analyticsConsent`: `null | true | false`), đổi được trong Cá nhân hoá. Chưa đồng ý → frontend không nạp PostHog, backend không gửi sự kiện của người đó (Nghị định 13/2023 về dữ liệu cá nhân; GDPR nếu có người dùng EU).
- **Super admin** vẫn được tính (khác P2-7) nhưng có thuộc tính `platformRole` để lọc ra khi xem.

## 3. Sự kiện

**Backend** (`posthog-node`, đáng tin cậy vì không phụ thuộc trình duyệt đang mở):

| Sự kiện | Thuộc tính |
| --- | --- |
| `user_signed_up` | `method` (password / google / admin_created) |
| `connection_saved` / `connection_disconnected` | `provider` |
| `youtube_authorized` | — |
| `sync_started` | `trigger` (webhook / manual / retry), `rule_matched` |
| `sync_completed` | `trigger`, `duration_bucket`, `size_bucket`, `scheduled` |
| `sync_failed` | `trigger`, `error_code`, `will_retry` |
| `zoom_webhook_received` | `event`, `owner_found`, `skipped_reason` |
| `recording_linked` | `source` (suggestion / picker) |
| `captions_uploaded` / `captions_failed` | `language`, `error_code` (P2-5) |
| `wordcloud_session_ended` | `questions`, `participants`, `responses` (tổng hợp) |

**Frontend** (`posthog-js`): `$pageview` (URL đã làm sạch), `workflow_saved` (`auto_upload`, `has_description_template`), `sync_rule_saved`, `manual_sync_opened`, `admin_page_viewed`.

Khi có workspace (P2-2): gắn **group** `workspace` cho mọi sự kiện để xem theo nhóm.

## 4. Kỹ thuật

- **Vùng dữ liệu**: PostHog Cloud **EU** (câu hỏi mở 4) — chọn một lần lúc tạo project, không đổi được.
- **Proxy** qua Next.js `rewrites()` trong `next.config.ts`: `/ingest/:path*` → host PostHog, `/ingest/static/:path*` → host assets; `api_host: '/ingest'`. Tránh bị trình chặn quảng cáo chặn, không cần CORS.
- **Frontend**: provider client dưới `AuthProvider` (giống `VercelInsights`), chỉ khởi tạo khi `analyticsConsent === true` và có `NEXT_PUBLIC_POSTHOG_KEY`; `person_profiles: 'identified_only'`, `identify(user.id)` khi đăng nhập, `reset()` khi đăng xuất; `before_send` làm sạch URL.
- **Backend**: `AnalyticsService` (một chỗ gọi `capture`, kiểm tra consent, không bao giờ ném lỗi, `shutdown()` khi app dừng); env `POSTHOG_API_KEY`, `POSTHOG_HOST`. Thiếu key → không làm gì.
- **Xem số liệu**: nút "Product analytics (PostHog)" trên trang Quản trị mở dashboard PostHog (giống P2-7). **Nhúng** dashboard vào app cần link chia sẻ công khai của PostHog (ai có link đều xem được) → để sau, cân nhắc riêng.
- **Feature flags** (tuỳ chọn, task riêng): đánh giá trên backend, dùng cho các lần triển khai dần sau này.

## 5. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Gửi nhầm dữ liệu cá nhân / bí mật | Không autocapture, không replay, danh sách sự kiện cố định, URL làm sạch, test kiểm tra thuộc tính sự kiện |
| Người dùng không muốn bị theo dõi | Hỏi đồng ý, đổi được bất cứ lúc nào; từ chối = không nạp gì |
| Phụ thuộc dịch vụ ngoài làm chậm/lỗi app | Nạp bất đồng bộ; backend gửi theo lô, không bao giờ ném lỗi |
| Vượt gói miễn phí | Số sự kiện nhỏ (danh sách cố định); đặt giới hạn chi tiêu = 0 trong PostHog |

## 6. Câu hỏi mở — đã chốt: dùng phương án đề xuất (26/09/2026)

1. **Muốn biết điều gì trước** — Đề xuất: phễu kích hoạt (đăng ký → kết nối → sync đầu tiên) và tỉ lệ sync lỗi theo mã lỗi.
2. **Ghi lại phiên (session replay)** — Đề xuất: **không** ở giai đoạn đầu.
3. **Cách xin đồng ý** — Đề xuất: thông báo một lần khi đăng nhập, lưu trên tài khoản, **mặc định không theo dõi** cho tới khi đồng ý.
4. **Vùng dữ liệu** — Đề xuất: **EU**.
5. **Nhúng dashboard vào app** — Đề xuất: **chưa**, chỉ nút mở PostHog cho super admin.

## 7. Các task triển khai

Theo Definition of done của IMPLEMENTATION_PLAN.ai.md. Người dùng cần: tạo project PostHog (vùng đã chọn), đặt `NEXT_PUBLIC_POSTHOG_KEY` (Vercel `frontend`), `POSTHOG_API_KEY`/`POSTHOG_HOST` (Railway), đặt giới hạn chi tiêu.

**P2-8a — Consent + frontend SDK.** *Changes*: `User.analyticsConsent Boolean?` (migration, additive) in the session + `PATCH /auth/preferences`; one-time consent prompt after sign-in and a switch in Personalization; `posthog-js` provider under `AuthProvider` (only with consent and a key; identify by id, reset on sign-out, `autocapture: false`, no replay, `before_send` URL cleaning, not loaded on `/word-cloud/join`); `/ingest` rewrites; pageviews. *Tests*: provider does nothing without consent/key; URL cleaning. *Acceptance*: with consent, identified pageviews reach PostHog with clean URLs; without, no request to `/ingest`.

**P2-8b — Backend events.** *Changes*: `AnalyticsService` (posthog-node, consent check, never throws, shutdown hook) and the backend events of §3 at their write points. *Tests*: consent respected; event names/properties match the list (no email, no secrets). *Acceptance*: a webhook sync produces `zoom_webhook_received`, `sync_started`, `sync_completed` for the owner.

**P2-8c — Frontend events + admin link.** *Changes*: the frontend events of §3; "Product analytics (PostHog)" button on the Admin page (`NEXT_PUBLIC_POSTHOG_DASHBOARD_URL`, hidden when unset); a starter dashboard (activation funnel, sync failures by code) described in the README. *Acceptance*: the funnel shows real data.
