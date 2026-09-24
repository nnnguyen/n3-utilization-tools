import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
