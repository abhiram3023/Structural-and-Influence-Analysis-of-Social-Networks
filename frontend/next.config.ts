import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lets a second dev server (or a production build) use its own output folder instead of clobbering .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
