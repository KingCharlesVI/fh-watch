import type { NextConfig } from "next";

// A static site: `next build` writes plain files to out/, which Vercel (or any host) serves.
const config: NextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default config;
