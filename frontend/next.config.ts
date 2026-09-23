import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // YouTube pages live under /youtube/dashboard and /youtube/channel-content
  async redirects() {
    return [
      { source: '/youtube', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube-utilities', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube-utilities/dashboard', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube/playlist', destination: '/youtube/channel-content?tab=playlists', permanent: true },
    ];
  },
};

export default nextConfig;
