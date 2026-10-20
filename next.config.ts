import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  headers: async () => [
    { source: "/(.*)", headers: [{ key: "Permissions-Policy", value: "microphone=(self), camera=(self)" }] },
  ],
};

export default nextConfig;
