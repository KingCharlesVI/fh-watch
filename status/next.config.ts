import type { NextConfig } from "next";

// A server app, not a static export: it checks the services when a page is asked for.
const config: NextConfig = {
  poweredByHeader: false,
};

export default config;
