import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
// Read at build time from web.env: the public address, e.g. https://fhmatchcentre.com.
const site = new URL(process.env.SITE_URL ?? "http://localhost:3000");
const https = site.protocol === "https:";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // The tunnel sends www here too; send it on to the main address.
    if (!https) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: `www.${site.hostname}` }],
        destination: `${site.origin}/:path*`,
        permanent: true,
      },
    ];
  },
  // In production the Cloudflare Tunnel sends /v1 straight to the API; this does the same in development (e.g. /v1/docs).
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${apiUrl}/v1/:path*` }];
  },
};

export default config;
