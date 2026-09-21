# n3-utilization-tools

A collection of utility tools built with Next.js, Nest.js, Prisma, and PostgreSQL.

## Modules

- **Word Cloud**: A full copy of `my-mentimeter`, allowing real-time word cloud generation.
- **YouTube Utilities**: Tools for interacting with YouTube, including video uploads.
- **Zoom Utilities**: Automation tools for Zoom, including auto-uploading recordings to YouTube.

## Tech Stack

- **Frontend**: Next.js 15+ (TypeScript, Ant Design, Tailwind CSS)
- **Backend**: Nest.js (TypeScript, Prisma)
- **Database**: PostgreSQL
- **Infrastructure**: Docker, Vercel, Railway

## Zoom -> YouTube Auto Upload Setup Guide

To enable auto-upload of Zoom recordings to YouTube, follow these steps:

### 1. Google Cloud Console (YouTube API)
- Create a project in [Google Cloud Console](https://console.cloud.google.com/).
- Enable **YouTube Data API v3**.
- Create **OAuth 2.0 Client IDs**.
- Configure the **OAuth Consent Screen** and add your email as a test user.
- Obtain `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and a `YOUTUBE_REFRESH_TOKEN`.

### 2. Zoom App Marketplace
- Go to [Zoom App Marketplace](https://marketplace.zoom.us/) and create a **Server-to-Server OAuth** app.
- In **Feature** -> **Event Subscriptions**, add a new subscription.
- Set the **Event notification endpoint URL** to: `https://your-backend-domain.com/api/zoom/webhook`.
- Add the event: **Recording** -> **All Recordings have completed**.
- Obtain the **Secret Token** from the subscription to verify webhooks (`ZOOM_WEBHOOK_SECRET_TOKEN`).

### 3. Environment Variables
Configure the following in your backend `.env` file:

```env
# YouTube API
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REDIRECT_URI=your_redirect_uri
YOUTUBE_REFRESH_TOKEN=your_refresh_token

# Zoom Webhook
ZOOM_WEBHOOK_SECRET_TOKEN=your_zoom_webhook_token
```

## Local Development

### Backend
1. `cd backend`
2. `npm install`
3. `npx prisma generate`
4. `npm run start:dev`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`
