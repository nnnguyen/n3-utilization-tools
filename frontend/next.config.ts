import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // YouTube pages now live under /youtube/dashboard and /youtube/playlist
  async redirects() {
    return [
      { source: '/youtube', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube-utilities', destination: '/youtube/dashboard', permanent: true },
      { source: '/youtube-utilities/dashboard', destination: '/youtube/dashboard', permanent: true },
    ];
  },
};

export default nextConfig;
