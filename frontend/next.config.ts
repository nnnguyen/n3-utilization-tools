import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // YouTube Utilities and YouTube Dashboard were merged into /youtube
  async redirects() {
    return [
      { source: '/youtube-utilities', destination: '/youtube', permanent: true },
      { source: '/youtube-utilities/dashboard', destination: '/youtube', permanent: true },
    ];
  },
};

export default nextConfig;
