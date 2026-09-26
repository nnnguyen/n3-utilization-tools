import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PostHog (P2-8) through the app's own origin: /ingest → PostHog Cloud EU
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/array/:path*', destination: 'https://eu-assets.i.posthog.com/array/:path*' },
      { source: '/ingest/:path*', destination: 'https://eu.i.posthog.com/:path*' },
    ];
  },
  // PostHog API paths end with a slash (/ingest/e/)
  skipTrailingSlashRedirect: true,
  // YouTube pages live under /youtube/dashboard and /youtube/channel-content
  async redirects() {
    return [
      { source: '/youtube', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube-utilities', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube-utilities/dashboard', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube/playlist', destination: '/youtube/channel-content?tab=playlists', permanent: true },
      // Integrations moved under Settings (query strings such as ?tab= / ?code= carry over)
      { source: '/integrations', destination: '/settings/integrations', permanent: true },
      { source: '/settings', destination: '/settings/personalization', permanent: false },
    ];
  },
};

export default nextConfig;
