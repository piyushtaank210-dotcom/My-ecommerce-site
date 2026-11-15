import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  /**
   * Where the build goes.
   *
   * It is always `.next` outside development. A second dev server can
   * be given one of its own with `NEXT_DIST_DIR` — the dev server keeps
   * its lock file in the build directory, so two of them cannot run
   * against the same one — but the production build is never moved. A
   * stray `NEXT_DIST_DIR` in the deployment's environment can therefore
   * not put the build somewhere the platform is not looking for it.
   */
  distDir:
    process.env.NODE_ENV === "development"
      ? process.env.NEXT_DIST_DIR || ".next"
      : ".next",
  // node:sqlite is a Node built-in; keep it external to the server bundle.
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
