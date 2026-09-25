<p align="center">
  <img src="frontend/public/brand/n3connect/n3connect-lockup.svg" alt="N3 Connect — Connect Your Digital World" width="420">
</p>

# N3 Connect

**Connect Your Digital World.** N3 Connect is a hub that connects the apps you work with — today YouTube, Zoom and a live Word Cloud tool, with more (Facebook, Gmail, …) planned. It automates the work between them, such as publishing every Zoom recording to your YouTube channel, and gives you one place to manage the results.

- **Production:** https://n3-utils.vercel.app
- **Languages:** Vietnamese and English (switch in the header or in Settings)
- **License:** [MIT](LICENSE)

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Getting started (local development)](#getting-started-local-development)
5. [Environment variables](#environment-variables)
6. [Connecting YouTube, Zoom and Google login](#connecting-youtube-zoom-and-google-login)
7. [User guide](#user-guide)
8. [Development guidelines](#development-guidelines)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)
12. [Roadmap](#roadmap)

---

## Features

**Zoom → YouTube**
- Automatic upload of finished Zoom recordings to YouTube (Zoom webhook), or a manual **Sync** per recording, with privacy and playlist choice.
- Live sync status (uploading → YouTube processing → ready), automatic retries for temporary failures, and a per-recording sync history.
- **Already on YouTube?** Recordings that were uploaded before the app tracked them are recognised: the app suggests the matching channel video (same length, title, date) and you confirm with **Link** — or pick any channel video by hand. Linked recordings are never uploaded twice.

**YouTube**
- **Dashboard:** synced videos per month, success rate, total duration and storage, daily API quota.
- **Channel Content:** every video on the channel (edit title, description, tags, privacy, thumbnail), the Zoom sync list, and playlist management.
- **Analytics:** views, comments and likes, visibility breakdown, videos per month.
- Manual video upload, and a warning before the YouTube token expires.

**Word Cloud**
- Topics with several questions; the audience joins with a code or QR code and answers from their phone.
- Live presentation screen (realtime via WebSockets), result visibility modes, statistics as table, bar or pie chart, CSV export.

**Platform**
- Email/password and Google sign-in, in-app notifications.
- **Settings → Integrations:** each account connects its own YouTube and Zoom credentials.
- **Settings → Personalization:** interface style (Broadsheet, Organic, Classic), light / dark / system mode, language — saved to the account.
- Responsive layout for phones and tablets.

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Ant Design 6, Tailwind CSS 4, Recharts, socket.io-client |
| Backend | NestJS 11, Prisma 6, PostgreSQL 16, socket.io, googleapis (YouTube Data API v3), Zoom API |
| Hosting | Frontend on Vercel, backend + PostgreSQL on Railway (both deploy from `main`) |
| Local | Node.js 20+, npm, Docker (optional, for PostgreSQL or the whole stack) |

## Repository layout

```
.
├── backend/                  NestJS API (served under /api)
│   ├── prisma/               schema.prisma + migrations
│   ├── src/
│   │   ├── auth/             sign-in (JWT, Google OAuth), session, preferences
│   │   ├── integrations/     per-account YouTube/Zoom credentials
│   │   ├── youtube/          uploads, channel videos, playlists, stats, quota
│   │   ├── zoom/             recordings, sync, webhook, retries, YouTube matching
│   │   ├── notifications/    in-app notifications
│   │   ├── mail/             transactional email (optional SMTP)
│   │   ├── topics/ questions/ public/ realtime/ word-cloud/   Word Cloud
│   │   └── common/           shared helpers (e.g. BigInt JSON serialization)
│   ├── scripts/              load tests for the Word Cloud audience flow
│   └── railway.json          Railway build/start configuration
├── frontend/                 Next.js app
│   ├── app/                  routes: /, /login, /youtube/*, /zoom-utilities, /word-cloud/*, /settings/*
│   ├── components/           shared UI (layout, logos, panels, dialogs)
│   ├── lib/                  API client, auth, preferences, theme, i18n (vi/en)
│   └── public/brand/         logos (N3 Connect, YouTube, Zoom, Wordcloud)
├── docker-compose.yml        PostgreSQL + backend + frontend
└── .env.example              variables docker-compose passes to the backend
```

## Getting started (local development)

### 1. Prerequisites

- Node.js 20 or newer and npm
- PostgreSQL 16 — or Docker to run it (see below)

### 2. Database

The quickest way is the PostgreSQL service from `docker-compose.yml` (exposed on port **5434**):

```bash
docker compose up -d postgres
```

### 3. Backend (http://localhost:3001/api)

```bash
cd backend
npm install                      # also generates the Prisma client
```

Create `backend/.env` (see [Environment variables](#environment-variables)). The minimum:

```env
DATABASE_URL=postgresql://utilization_tools:utilization_tools@localhost:5434/utilization_tools?schema=public
PORT=3001                        # the frontend runs on 3000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=<a long random string>
```

Then apply the migrations and start in watch mode:

```bash
npx prisma migrate dev           # creates the tables
npm run start:dev
```

### 4. Frontend (http://localhost:3000)

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" > .env.local
npm run dev
```

Open http://localhost:3000, register an account (or sign in with Google if configured), then connect YouTube and Zoom in **Settings → Integrations**.

### Alternative: everything in Docker

```bash
cp .env.example .env             # fill in at least JWT_SECRET
docker compose up --build
```

Frontend on http://localhost:3000, backend on http://localhost:3001/api, PostgreSQL on port 5434.

## Environment variables

Never commit real values: `.env` files are git-ignored. `.env.example` lists what `docker-compose.yml` passes to the backend.

### Backend (`backend/.env`, or the Railway service variables)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs the session token |
| `JWT_EXPIRES_IN` | no | Session lifetime (default `7d`) |
| `PORT` | no | HTTP port (default `3000`; use `3001` locally) |
| `FRONTEND_URL` | yes | Frontend origin(s) allowed by CORS and used in redirects (comma-separated) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | no | Google sign-in; leave empty to disable |
| `YOUTUBE_CALLBACK_URL` (or `YOUTUBE_REDIRECT_URI`) | yes, to connect YouTube | OAuth redirect for connecting YouTube: the backend's `<backend URL>/api/auth/youtube/callback` (e.g. `http://localhost:3001/api/auth/youtube/callback`) |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | no | Fallback YouTube credentials when an account has none of its own |
| `YOUTUBE_OAUTH_TESTING_MODE` | no | `true` (default) while the Google OAuth app is in *Testing*: tokens expire after 7 days and the app warns ahead of time; set `false` once published |
| `YOUTUBE_TOKEN_WARN_AFTER_DAYS` | no | Days after authorization to start the expiry warning (default `5`) |
| `YOUTUBE_QUOTA_LIMIT` | no | Daily YouTube API quota (default `10000`) |
| `YOUTUBE_MANUAL_UPLOAD_MAX_MB` | no | Size limit of a manual upload (default `2048`) |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | no | Fallback Zoom Server-to-Server OAuth credentials |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | recommended | Verifies Zoom webhook signatures |
| `SYNC_SCHEDULER_ENABLED` | no | `false` turns off automatic retries and processing checks |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS` | no | SMTP for account emails (verification, password reset) |
| `IP_RATE_LIMIT_WINDOW_MS`, `IP_RATE_LIMIT_MAX_PER_WINDOW` | no | Rate limit of the public Word Cloud endpoints (default 20 requests / 60 s per IP) |

### Frontend (`frontend/.env.local`, or the Vercel project variables)

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | Backend API base URL, e.g. `http://localhost:3001/api` |

## Connecting YouTube, Zoom and Google login

Credentials are entered per account in **Settings → Integrations**; the environment variables above only act as fallbacks.

### YouTube (Google Cloud)
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. Configure the **OAuth consent screen**; while it is in *Testing*, add your Google account as a test user.
3. Create an **OAuth client ID** (Web application) and add the redirect URI `<backend URL>/api/auth/youtube/callback` — the same value as `YOUTUBE_CALLBACK_URL`.
4. In the app: **Settings → Integrations → YouTube**, enter the Client ID and Client Secret, save, then **Authorize YouTube** and grant access to your channel.

> In *Testing* mode Google revokes the refresh token after 7 days: the app shows a banner before that — click **Re-authorize**. Publishing the OAuth app removes the limit.

### Zoom
1. In the [Zoom App Marketplace](https://marketplace.zoom.us/), create a **Server-to-Server OAuth** app with the recording read scopes.
2. Under **Feature → Event Subscriptions**, add the endpoint `https://<backend domain>/api/zoom/webhook` and the event **Recording → All Recordings have completed**. Copy the **Secret Token** into `ZOOM_WEBHOOK_SECRET_TOKEN`.
3. In the app: **Settings → Integrations → Zoom**, enter the Account ID, Client ID, Client Secret and Webhook Secret Token, and switch **Activation** on.

### Google sign-in (optional)
Create another OAuth client ID with the redirect URI `<backend URL>/api/auth/google/callback` and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALLBACK_URL`.

## User guide

- **Home** — the connected apps and a *Getting Started* checklist; **Explore** opens an app.
- **Header** — switch the language (VI / EN), open notifications (the bell), or open your account menu. On phones and tablets the menu (☰) slides in from the left.
- **Apps → YouTube**
  - *Dashboard*: sync statistics per month and today's quota. **Upload video** uploads a file from your computer.
  - *Channel Content*: *Videos* (edit any video), *Zoom Sync* (the Zoom recordings list, below), *Playlists* (create, edit, delete, reorder items).
  - *Analytics*: views, comments, likes and visibility of the channel.
- **Apps → Zoom**
  - *Automation Workflow Manager*: turn automatic upload on or off and choose the default privacy.
  - *Zoom Recordings*: pick a date range, then per recording:
    - **Sync** uploads it to YouTube (choose privacy and playlist); the status follows the upload and YouTube's processing. Failed syncs retry on their own and can be synced again.
    - **Possibly already on YouTube** — a matching video was found: **Link** marks the recording as synced with that video, **Not this one** hides the suggestion.
    - 🔗 links a recording to any video of your channel; **Unlink** undoes a link (the YouTube video is not touched).
    - The history icon shows every sync attempt.
- **Apps → Wordcloud** — create a topic, add questions, then **Present**. The audience joins at `/word-cloud/join/<code>` (code or QR code on the presentation screen); answers appear live. Statistics can be exported as CSV.
- **Settings** — *Integrations* (credentials, see above) and *Personalization* (style, light/dark mode, language).

## Development guidelines

### Workflow
- `main` deploys automatically (Vercel for the frontend, Railway for the backend), so it must always build: run the tests and builds below before pushing.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `style:`, `test:`, `docs:` — the body explains *why*.
- Never commit secrets or `.env` files; never paste tokens into issues or logs.

### Backend
- One NestJS module per domain (`auth`, `youtube`, `zoom`, …). Controllers stay thin; logic lives in services. Pure logic that can be tested without a database goes in its own file with a `*.spec.ts` next to it (e.g. `zoom/youtube-match.ts`).
- Validate request bodies with DTO classes (`class-validator`) and protect routes with `JwtAuthGuard` + `@CurrentUser()`.
- Database changes: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <what_changed>`. Commit the generated migration; never edit a migration that has already been applied. Railway runs `prisma migrate deploy` on start.
- YouTube API calls cost quota: record them with the existing quota tracking and prefer the cached channel video list over new API calls.
- `BigInt` columns are serialized as numbers by `common/bigint-json.ts` (loaded in `main.ts`).
- Sync logs have a `source`: `upload` (made by the app) or `linked` (a video already on YouTube). Statistics count uploads only.

### Frontend
- Next.js 16 differs from older versions — read the relevant guide in `frontend/node_modules/next/dist/docs/` before using an API you are unsure of (see `frontend/AGENTS.md`).
- Call the backend through `lib/api.ts` (`apiFetch`), which adds the session token.
- **Text:** every user-facing string goes through `useT()` (`lib/i18n`). Add each key to both `lib/i18n/vi.ts` and `lib/i18n/en.ts` — TypeScript fails the build when a translation is missing. Format dates and numbers with `useFormat()`.
- **Styling:** use Ant Design components and the theme tokens (`lib/theme.ts`) or CSS variables (`var(--color-*)`, `app/globals.css`) — no hard-coded colors, so all three styles and dark mode keep working. Styles are Broadsheet (default), Organic and Classic.
- **Responsive:** below 992px the sidebar becomes a drawer; tables scroll horizontally (`scroll={{ x: 'max-content' }}`); rows of controls should wrap. Check new screens at phone (390px) and tablet (768px) widths.
- **Brand assets:** use the components in `components/BrandLogos.tsx` and `components/N3ConnectLogo.tsx`. Official YouTube and Zoom logos must not be altered or redrawn; replace the files in `public/brand/` when the brands publish updates.

## Testing

```bash
# Backend
cd backend
npm test                 # unit tests (Jest)
npm run test:e2e         # end-to-end tests
npm run build            # type check + compile

# Frontend
cd frontend
npm test                 # unit tests (node:test)
npx tsc --noEmit         # type check
npm run build            # production build
```

## Deployment

| | Platform | Trigger | Notes |
| --- | --- | --- | --- |
| Frontend | Vercel (root directory `frontend`) | push to `main` | Set `NEXT_PUBLIC_API_URL` in the project settings |
| Backend | Railway (`backend`, `railway.json`) | push to `main` touching `backend/**` | Build `npm run build`; start `npm run start:prod` (applies migrations, then starts). Variables in the service settings |
| Database | Railway PostgreSQL | — | `DATABASE_URL` is provided to the backend service |

After a deploy, check the Railway deployment logs for `All migrations have been successfully applied` and `Nest application successfully started`, and that the Vercel deployment is *Ready*.

## Troubleshooting

- **"YouTube token expired"** — the OAuth app is in *Testing* mode (7-day tokens): click **Re-authorize** in the banner or in Settings → Integrations.
- **Quota exhausted** — the YouTube API allows `YOUTUBE_QUOTA_LIMIT` units per day and an upload costs about 1,600, so the app stops uploading below that; Google resets the quota at midnight Pacific time.
- **Zoom recordings missing for long ranges** — Zoom limits a query to one month; the backend splits longer ranges automatically, up to 24 months back.
- **Signed out in Safari or Firefox** — these browsers block cross-site cookies; the app keeps the session in a bearer token instead, so make sure `NEXT_PUBLIC_API_URL` points at the backend.
- **Webhook not received** — the Zoom subscription must point at `https://<backend domain>/api/zoom/webhook`, and `ZOOM_WEBHOOK_SECRET_TOKEN` must match the subscription's Secret Token.

## Roadmap

Plans for the hub (in Vietnamese, the AI spec in English) live in [`docs/`](docs/):

- [ROADMAP.md](docs/ROADMAP.md) — proposed features and app integrations (Google Drive, Calendar, Zalo, Facebook, AI, …)
- [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — the implementation plan for readers: phases, order, risks, decisions to make
- [IMPLEMENTATION_PLAN.ai.md](docs/IMPLEMENTATION_PLAN.ai.md) — executable task specs for AI agents (same task IDs)
- [PROMPTS.md](docs/PROMPTS.md) — ready-to-use prompts to run each phase with an AI agent
