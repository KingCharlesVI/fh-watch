import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";

const config: NextConfig = {
  poweredByHeader: false,
  // In production nginx sends /v1 straight to the API; this does the same in development (e.g. /v1/docs).
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${apiUrl}/v1/:path*` }];
  },
};

export default config;
