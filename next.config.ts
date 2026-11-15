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
  images: {
    /**
     * The photographs in the catalogue may live in the shop's own
     * store rather than in the repository.
     *
     * A picture that is uploaded on a serverless deployment is kept in
     * Vercel Blob, and its address is the store's own. The optimiser
     * will only fetch an outside picture from a place it has been told
     * about, so the store is named here.
     *
     * The private store is named as well. A customer's evidence is
     * never served from it directly — it is fetched through a route
     * that checks who is asking — but naming it means a picture that
     * has been made public by mistake still renders.
     */
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.private.blob.vercel-storage.com" },
    ],
    // The one quality the shop's pictures are cut to.
    qualities: [75],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
