import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  /**
   * Where the build goes.
   *
   * It is the same directory for the shop itself, but a second server
   * can be given one of its own with `NEXT_DIST_DIR`. The dev server
   * keeps its lock file in this directory, so two of them cannot run
   * against the same one — and a check that needs a second server
   * pointed somewhere else needs it to have a lock of its own.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // node:sqlite is a Node built-in; keep it external to the server bundle.
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
