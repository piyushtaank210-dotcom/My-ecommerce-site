import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // node:sqlite is a Node built-in; keep it external to the server bundle.
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
