import type { NextConfig } from "next";

const serverUrl = process.env.CONSOLE_API_URL ?? "http://127.0.0.1:3000";

const nextConfig: NextConfig = {
  agentRules: false,
  async rewrites() {
    return [
      {
        source: "/api/health",
        destination: `${serverUrl.replace(/\/$/, "")}/health`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${serverUrl.replace(/\/$/, "")}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
