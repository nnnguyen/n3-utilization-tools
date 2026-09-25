# N3 Connect — Implementation plan for AI agents

Executable task specs for the roadmap in [ROADMAP.md](ROADMAP.md). The human-readable version (Vietnamese) is [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); task IDs match.

## How to use this file

- Execute **one task per request**, by ID (e.g. "do P1-2"). Do not start the next task unless asked.
- Read the task's **Context** files before editing. Line numbers drift: locate code by the function/identifier names given here.
- A task marked **⚠ Decision required** must not be implemented until the human answers the listed question. Ask it in chat, propose the default given, and wait.
- If reality contradicts the spec (a file or function is missing, behaviour differs), **stop and report** the mismatch instead of improvising.
- Phase 2 and 3 items are **not executable yet**: their first deliverable is a design note for approval (see §4).

## Global rules

**Repository**: `backend/` (NestJS 11, Prisma 6, PostgreSQL, API prefix `/api`) and `frontend/` (Next.js 16 App Router, React 19, antd 6). `main` auto-deploys (Vercel: frontend; Railway: backend, which runs `prisma migrate deploy` on start).

**Backend conventions**
- Validate bodies with `class-validator` DTOs; protect routes with `JwtAuthGuard` + `@CurrentUser()`.
- Schema change → edit `backend/prisma/schema.prisma` → `npx prisma migrate dev --name <snake_case>`; commit the migration. Migrations must be additive (new tables, nullable columns or columns with defaults). Never edit an applied migration.
- Put pure logic in its own file with a `*.spec.ts` beside it. Keep controllers thin.
- YouTube calls cost quota: record them with the existing quota tracking (`trackQuotaUsage` in `youtube.service.ts`).
- Never log or return secrets (client secrets, refresh tokens, webhook tokens).

**Frontend conventions**
- Next.js 16 has breaking changes: consult `frontend/node_modules/next/dist/docs/` before using an unfamiliar API.
- Backend calls go through `apiFetch` (`frontend/lib/api.ts`).
- Every user-facing string uses `useT()`; add each key to **both** `frontend/lib/i18n/vi.ts` and `frontend/lib/i18n/en.ts` (en is typed to require every vi key). Dates/numbers via `useFormat()`.
- Colors from antd theme tokens or `var(--color-*)` CSS variables only — never hex literals (three styles + dark mode must keep working).
- Layout must work at 390px and 768px widths (drawer menu below 992px; tables use `scroll={{ x: 'max-content' }}`; control rows wrap).

**Definition of done (every task)**
1. `cd backend && npm test && npm run build` pass.
2. `cd frontend && npx tsc --noEmit -p . && npm test && npm run build` pass.
3. New logic has unit tests; UI changes checked in a browser (desktop + 390px, light + dark, vi + en) when a dev server is available.
4. One commit (or a few focused ones) with a Conventional Commit message (`feat:`, `fix:`, `docs:` …) ending with the attribution trailer the environment specifies. Push only if the human asked for it.
5. Mark the task ✅ in both plan files.

---

## 3. Phase 1 tasks (executable)

### P1-1 ✅ — Stop returning secrets from `GET /integrations/config`

**Goal**: the browser never receives Zoom/YouTube client secrets, the webhook secret token or the YouTube refresh token.

**Context**
- `backend/src/integrations/integrations.service.ts` → `getConfigs()` returns whole `ZoomConfig` / `YoutubeConfig` rows; `updateZoomConfig` / `updateYoutubeConfig` upsert the DTO as-is.
- `backend/src/integrations/dto/update-config.dto.ts`.
- Frontend consumers of `/integrations/config`: `frontend/app/page.tsx` (`isZoomActive` reads `clientSecret`, `isYoutubeActive` reads `refreshToken`), `frontend/app/settings/integrations/page.tsx` (fills the forms; the Authorize button is disabled via `configs.youtube?.clientSecret`), `frontend/app/zoom-utilities/page.tsx`, `frontend/components/ZoomRecordingsPanel.tsx` (read `isActive` only).

**Changes**
1. `getConfigs` returns, per service, only non-secret fields plus presence flags:
   - zoom: `{ isActive, accountId, clientId, hasClientSecret, hasWebhookSecretToken }`
   - youtube: `{ isActive, clientId, hasClientSecret, hasRefreshToken }`
   Implement the mapping in a pure function (`toPublicConfig`) with a spec.
2. Updates: treat an **empty string or missing** secret field as "keep the stored value" (strip it before the upsert). Non-secret fields keep today's behaviour.
3. Frontend:
   - Home: `isZoomActive = isActive && clientId && hasClientSecret`; `isYoutubeActive = isActive && hasRefreshToken`.
   - Integrations page: secret inputs start empty with a placeholder from new i18n keys (e.g. `integ.secretSaved` = "Đã lưu — nhập để thay đổi" / "Saved — type to replace") when the flag is true; the Authorize button uses `hasClientSecret`; only send secret fields the user typed.

**Tests**: spec for `toPublicConfig` (no secret keys in output, flags correct); spec for the "empty secret keeps stored value" rule.

**Acceptance**: response of `/integrations/config` contains none of `clientSecret`, `webhookSecretToken`, `refreshToken`; saving the forms without retyping secrets keeps YouTube and Zoom connected; the home page checklist still reflects the real state.

**Out of scope**: encrypting secrets at rest (P2-1).

---

### P1-2 ✅ — Mark syncs whose YouTube video was deleted as failed

**Goal**: end the endless status polling of videos deleted on YouTube.

**Context**
- `frontend/components/ZoomRecordingsPanel.tsx`: every 15 s calls `POST /youtube/recordings/:id/refresh-status` for logs in `UPLOADING`/`PROCESSING`.
- `backend/src/youtube/youtube.service.ts` → `refreshRecordingStatus` → `checkVideoProcessingStatus`, which throws `new Error("Video not found on YouTube")` when `videos.list` returns no item. The background scheduler (`backend/src/zoom/zoom-sync-scheduler.service.ts` → `checkProcessingVideos`) calls the same method.

**Changes**
1. In `checkVideoProcessingStatus`, when the video is not found **and** a `recordingId` is known: update the `ZoomSyncLog` to `syncStatus: "FAILED"`, `errorSource: "youtube_processing"`, `errorCode: "VIDEO_NOT_FOUND"`, `syncError`: a clear message ("Video was deleted on YouTube"), clear `nextRetryAt` (no auto-retry), then return normally (no exception, so no 500 and no error log spam; log once at `warn`).
2. Do not create a "sync failed" notification for this case unless it was the first time the log moved to FAILED (avoid duplicates).

**Tests**: unit test with a mocked YouTube client returning `items: []` → log updated to FAILED once; a second call does nothing new.

**Acceptance**: after deploy, Railway logs no longer repeat `Video not found on YouTube`; the recording row shows "Failed" with the reason and can be synced again.

---

### P1-3 ✅ — Route Zoom webhooks to the right account (decided)

**Decision (2026-09-25)**: when several app accounts configured the same Zoom account, the new recording belongs to the accounts with that `ZoomConfig.accountId`, `isActive = true` and auto-upload enabled (P1-4; until then: all active ones); if more than one, the one with the most recent `ZoomConfig.updatedAt`.

**Context**
- `backend/src/zoom/zoom.controller.ts` → `handleWebhook`: verifies the signature only with `process.env.ZOOM_WEBHOOK_SECRET_TOKEN`; calls `zoomService.handleRecordingCompleted(payload.payload)`.
- `backend/src/zoom/zoom.service.ts` → `handleRecordingCompleted` uses `payload.userId || "system"` (Zoom sends no `userId`), so syncs run as `"system"` (env YouTube credentials, no notifications, logs not owned by a user). Several `userId !== "system"` guards exist in `zoom.service.ts` and `youtube.service.ts`.
- `ZoomConfig` has `accountId`, `webhookSecretToken`, `isActive` per user. Zoom webhook payloads include `payload.account_id`.

**Changes**
1. Resolve the owner: `findWebhookOwner(accountId)` (pure selection logic + a Prisma query) implementing the decided rule.
2. Signature: accept the request if it verifies with the owner's `webhookSecretToken` **or** the env token (backward compatible). Signatures are computed on the raw body; keep the current `v0:${timestamp}:${JSON.stringify(payload)}` scheme unless you switch to the raw body for both paths.
3. URL validation (`endpoint.url_validation`): respond with the token matching the account if one is found, else the env token.
4. Pass the resolved `userId` into `handleRecordingCompleted`; keep `"system"` only as the fallback when no owner is found (log a warning naming the Zoom account id).

**Tests**: selection rule (none / one / many owners); signature accepted with per-user token, env token, rejected otherwise.

**Acceptance**: a new Zoom recording creates a `ZoomSyncLog` with the owner's `userId`, uses the owner's YouTube connection and produces a bell notification for that user.

---

### P1-4 ✅ — Persist and apply the Automation Workflow settings (after P1-3)

**Goal**: the "Automation Workflow Manager" form on the Zoom page is saved per account and applied.

**Context**
- `frontend/app/zoom-utilities/page.tsx`: `onUpdateSettings` only shows a success message; form fields `autoUpload`, `titleTemplate` (default `[Zoom] {topic} - {date}`), `privacy`.
- `backend/src/zoom/zoom.service.ts` → `uploadToYoutubeDirectly` builds the title `Zoom Recording: ${topic}` and description `Recorded on ${startTime}` + `RECORDING_ID_PREFIX` line (keep that line — used by `zoom/youtube-match.ts`).
- Manual sync dialog defaults: `ZoomRecordingsPanel.tsx` (`syncPrivacyStatus = 'private'`, `syncPlaylistId = 'none'`).

**Changes**
1. Schema: new model `ZoomWorkflowSettings { userId @unique, autoUpload Boolean @default(true), titleTemplate String @default("Zoom Recording: {topic}"), descriptionTemplate String @default("Recorded on {date} {time}"), privacyStatus String @default("private"), playlistId String? }` (defaults reproduce today's behaviour).
2. Pure `renderTemplate(template, { topic, date, time })` with spec (date/time formatted in the account's language and a configurable time zone, default `Asia/Ho_Chi_Minh`; unknown placeholders left as-is; result trimmed to YouTube's 100-char title limit).
3. API: `GET /zoom/workflow-settings`, `PUT /zoom/workflow-settings` (DTO: `autoUpload`, `titleTemplate` ≤ 200, `descriptionTemplate` ≤ 2000, `privacyStatus` in public|unlisted|private, `playlistId` optional).
4. Webhook path: skip the upload when `autoUpload` is false (still record nothing — the recording stays "not synced" for a manual sync); otherwise use the settings for title, description (+ recording ID line), privacy and playlist.
5. Manual sync: dialog defaults come from the settings; title/description rendered from the templates.
6. Frontend: load/save the form, add a description template field and a default playlist select (reuse the playlist list already fetched by `ZoomRecordingsPanel`), show the available placeholders; i18n keys under `zoomDash.*`.

**Tests**: `renderTemplate` spec; service test that the webhook path respects `autoUpload: false`.

**Acceptance**: changing the title template changes the next upload's title; turning auto-upload off stops webhook uploads; accounts without saved settings behave exactly as before.

**Update (2026-09-25, requested by the human)**: auto-upload is now **off by default** (`DEFAULT_WORKFLOW_SETTINGS.autoUpload = false`, column default `false`, migration `default_auto_upload_off`). Accounts without saved settings no longer auto-upload and are not webhook owners; the other defaults are unchanged.

---

### P1-5 ✅ — Topic rules and scheduled publishing (after P1-4, decided)

**Decision (2026-09-25)**: no seeded rules; users add their own in the UI.

**Changes**
1. Model `ZoomSyncRule { id, userId, position Int, matchText String, titleTemplate String?, descriptionTemplate String?, playlistId String?, tags String[], privacyStatus String?, publishDelayMinutes Int? }`.
2. Pure `resolveSyncOptions(topic, settings, rules)` → first rule whose `matchText` is contained in the topic (case- and diacritics-insensitive; reuse `normalizeTitle` from `zoom/youtube-match.ts`) overrides the workflow settings field by field. Spec it.
3. Scheduled publishing: when `publishDelayMinutes` is set, upload with `privacyStatus: "private"` and `status.publishAt` = recording end + delay (ISO 8601). YouTube requires `private` for `publishAt`.
4. CRUD API `GET/POST/PATCH/DELETE /zoom/sync-rules` + reorder; a "Rules" section under the workflow settings (table + dialog, responsive, i18n).

**Acceptance**: a recording whose topic matches a rule lands in the rule's playlist with its title; a scheduled video shows its publish time in YouTube Studio.

---

### P1-6 ✅ — Header shows the current page title

**Context**: `frontend/components/DashboardLayout.tsx` renders `<h2>{t('nav.dashboard')}</h2>` on every page.

**Changes**: a pure `pageTitleKey(pathname)` → i18n key, longest-prefix match: `/` → `nav.home`; `/youtube/dashboard` → `nav.dashboard`; `/youtube/channel-content` → `nav.channelContent`; `/youtube/analytics` → `nav.analytics`; `/zoom-utilities` → new key `nav.zoom` ("Zoom"); `/word-cloud` → new key `nav.wordCloud` ("Wordcloud"); `/settings/integrations` → `nav.integrations`; `/settings/personalization` → `nav.personalization`; fallback `nav.home`. Add a `*.test.ts` for it (frontend tests run with `node --test`).

**Acceptance**: the header title matches the selected menu item on every route, in both languages.

---

### P1-7 ✅ — Documentation and `.env.example`

**Changes**
1. Replace `backend/README.md` and `frontend/README.md` (framework boilerplate) with a few lines pointing to the root `README.md` and listing that package's scripts.
2. Add to the root `.env.example` (with comments, no values) every variable the backend reads that is missing: `YOUTUBE_CALLBACK_URL`, `YOUTUBE_OAUTH_TESTING_MODE`, `YOUTUBE_TOKEN_WARN_AFTER_DAYS`, `YOUTUBE_QUOTA_LIMIT`, `YOUTUBE_MANUAL_UPLOAD_MAX_MB`, `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `SYNC_SCHEDULER_ENABLED`; pass them through in `docker-compose.yml`. Verify the list with `grep -rhoE "process\.env\.[A-Z0-9_]+" backend/src | sort -u`.

**Acceptance**: every `process.env.*` read by the backend appears in `.env.example` and the root README table.

---

### P1-8 ⏸ — Telegram notifications (after P1-9, decided) — PAUSED

**Paused (2026-09-25)**: the human stopped this task. Do not implement it unless the human explicitly resumes it.

**Decision (2026-09-25)**: Telegram now; Zalo OA later in P2-6.

**Changes**
1. Env `TELEGRAM_BOT_TOKEN` (one bot for the app). Model `TelegramLink { userId @unique, chatId String, linkedAt }` and a short-lived link code.
2. Linking: Integrations page shows "Connect Telegram" → a code + deep link `https://t.me/<bot>?start=<code>`; backend endpoint `POST /telegram/webhook` (secret path or `X-Telegram-Bot-Api-Secret-Token` header) handles `/start <code>` and stores the chat id.
3. `NotificationsService.create` also sends a Telegram message when linked and the user enabled it (preferences mirror the email toggles), rendered in the user's language (P1-9). Failures never break the sync flow.

**Acceptance**: after linking, a completed sync sends a Telegram message with the video link; unlinking stops messages.

---

### P1-9 ✅ — Localize backend-generated notifications and errors

**Context**: `Notification.title`/`message` are stored as finished Vietnamese sentences (see `notifySyncCompleted` and the failure path in `backend/src/youtube/youtube.service.ts`, the scheduler, and `NotificationsService.sendEmailCopy`).

**Changes**
1. Schema: add `Notification.data Json?` (type stays `sync_completed` | `sync_failed` | …). New notifications store `data` (`{ meeting, videoId, error }`); keep writing `title`/`message` in Vietnamese as a fallback for old clients.
2. Frontend bell (`frontend/components/NotificationBell.tsx`): when `data` is present, render from i18n keys `notif.type.<type>.title/message` with the data; else show the stored text (old rows).
3. Email copy: render in `User.language`.
4. API errors: introduce error codes for the user-facing errors the frontend shows (`{ code, message }`), map known codes to i18n keys in `apiFetch`'s error handling, fall back to `message`.

**Acceptance**: with English selected, new notifications and the common sync errors appear in English; old notifications still display.

---

## 4. Phase 2 — design first (not executable yet)

For each item, the first task is a **design note** (`docs/design/<id>-<name>.md`, ≤ 2 pages): data model, migration of existing data, API, UI sketch, rollout, risks, and the open questions below. Stop after writing it and ask the human to approve.

| ID | Item | Must cover | Open questions (ask) |
| --- | --- | --- | --- |
| P2-1 | Connector framework | `Connection` model (provider, owner, encrypted credentials, token expiry, status), shared OAuth/refresh/expiry logic generalised from `YoutubeService.getTokenStatus`, per-provider quota, migration from `ZoomConfig`/`YoutubeConfig` without downtime | encryption key management (env `CREDENTIALS_KEY`?); one-shot vs gradual migration |
| P2-2 | Workspaces & roles | `Workspace`, `Membership(role)`, connections owned by workspaces, `ZoomSyncLog.recordingId` uniqueness per workspace, activity log | multi-workspace users; merging accounts that share a Zoom account |
| P2-3 | Google Drive backup | new scope `drive.file` (re-authorization flow), upload MP4/M4A/VTT after sync, folder layout, retries, storage display | folder structure; which files |
| P2-4 | Google Calendar | upcoming meetings list, attach video link to events | which calendar |
| P2-5 | Automatic captions | Zoom `TRANSCRIPT` (VTT) → `captions.insert` (≈400 quota units, scope `youtube.force-ssl` already granted) after processing succeeds | default language; on by default? |
| P2-6 | Zalo OA notifications | on top of P2-1 | verified OA available? |

### P2-1 subtasks (approved 2026-09-25)

Design: [docs/design/P2-1-connector.md](design/P2-1-connector.md) — approved with the proposed answers (env `CREDENTIALS_KEY` + `CREDENTIALS_KEY_PREVIOUS`; gradual expand → dual-write → flag `CONNECTIONS_READ` → contract; one connection per provider per user until P2-2; keep `YOUTUBE_CLIENT_ID/SECRET` as the default OAuth app, drop `YOUTUBE_REFRESH_TOKEN`/`ZOOM_*` at contract; contract after ≥ 1 week stable, separate approval). The full specs (Context / Changes / Tests / Acceptance / Out of scope) are in §8 of the design note; execute them one at a time with the Phase 1 Definition of done.

| ID | Task | Depends on |
| --- | --- | --- |
| P2-1a ✅ | Credentials cipher (AES-256-GCM, `CREDENTIALS_KEY`, `CREDENTIALS_KEY_PREVIOUS`) | — |
| P2-1b ✅ | `Connection` + `QuotaUsage` schema, provider registry, `ConnectionsService`, `QuotaService` (no callers) | P2-1a |
| P2-1c ✅ | Dual-write from the legacy config/quota writes + idempotent startup backfill | P2-1b |
| P2-1d ✅ | Read through `ConnectionsService` behind `CONNECTIONS_READ`; `/connections` API | P2-1c |
| P2-1e ✅ | Settings → Integrations as provider cards | P2-1d |
| P2-1f | Contract: remove dual-write, flag, legacy tables and env fallbacks — **destructive, ask before starting** | P2-1e + ≥ 1 week stable |

### P2-2 subtasks (approved 2026-09-25)

Design: [docs/design/P2-2-workspaces.md](design/P2-2-workspaces.md) — approved with the proposed answers: multi-workspace users with a header switcher (`User.activeWorkspaceId`); no automatic merge of accounts sharing a Zoom account (invite suggestion, history stays); invites by email + link + bell; default invite role `editor`; manual-sync notifications to the actor, webhook/retry ones to owners/admins/editors; **open sign-up kept** (a new account owns its personal workspace only); super admin stored in DB (`User.platformRole`) with `BOOTSTRAP_SUPER_ADMIN_EMAIL` used only while none exists; manual account creation with a generated temp password shown once to copy (forced change by default, else 30-day expiry); **email is off for now** (2026-09-26: no own domain for Resend, Railway Hobby blocks SMTP) — invites by link + bell, super admin verifies emails and resets temp passwords. Specs are in §8 of the design note. P2-2a–h start after P2-1f; P2-2i (email) is deferred.

| ID | Task | Depends on |
| --- | --- | --- |
| P2-2a | Schema + personal workspaces backfill | P2-1f |
| P2-2b | Workspace context, guard and roles; `/workspaces` | P2-2a |
| P2-2c | Scope data by workspace; fix the shared `recordingId` overwrite | P2-2b |
| P2-2h | Super admin, system admin pages, manual accounts (temp password shown once), stop logging mail bodies | P2-2b |
| P2-2d | Members and invite links, Settings → Workspace, header switcher | P2-2c |
| P2-2e | Activity log | P2-2c |
| P2-2f | Shared Zoom account suggestion | P2-2d |
| P2-2g | Contract — **destructive, ask before starting** | all above |
| P2-2i | Email — **deferred** (Resend with an own domain, or Gmail SMTP on Railway Pro) | — |

## 5. Phase 3 — outline only

Workflow builder (triggers/actions/conditions, run history), Facebook Page publishing (Meta App Review), podcast RSS from M4A, AI meeting summaries and metadata suggestions (opt-in per workspace; state what data leaves the system), polls and Q&A for Word Cloud. Plan these after Phase 2 lands.

---

*Updated 2026-09-25. Keep task IDs stable; mark ✅ when done.*
