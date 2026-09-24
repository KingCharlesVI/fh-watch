import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.url(),
  /** HS256 key for access tokens. Required in production; a random one is made per process otherwise. */
  JWT_SECRET: z.string().min(32).optional(),
  /** Public website origin, used in email links and share URLs. */
  WEB_URL: z.url().default("http://localhost:3000"),
  MAIL_FROM: z.string().default("FH Match Centre <no-reply@fhmatchcentre.com>"),
  /** nodemailer SMTP URL, e.g. smtps://user:pass@smtp.example.com. Unset: emails are logged. */
  SMTP_URL: z.string().optional(),
  /** Expo push access token. Unset: pushes are logged. */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Where rendered match PDFs are cached. */
  PDF_CACHE_DIR: z.string().default(join(tmpdir(), "fh-pdf-cache")),
  /**
   * Header carrying the visitor's IP address, set by a proxy on this machine:
   * cf-connecting-ip behind a Cloudflare Tunnel. Unset: X-Forwarded-For.
   */
  CLIENT_IP_HEADER: z.string().optional(),
  JOBS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export interface Config {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  jwtSecret: Uint8Array;
  webUrl: string;
  mailFrom: string;
  smtpUrl: string | undefined;
  expoAccessToken: string | undefined;
  jobsEnabled: boolean;
  pdfCacheDir: string;
  clientIpHeader: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `KEY=` with nothing after it (as in .env.example) means unset.
  const e = Env.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
  if (!e.JWT_SECRET && e.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production (at least 32 characters).");
  }
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET ? new TextEncoder().encode(e.JWT_SECRET) : randomBytes(32),
    webUrl: e.WEB_URL.replace(/\/$/, ""),
    mailFrom: e.MAIL_FROM,
    smtpUrl: e.SMTP_URL,
    expoAccessToken: e.EXPO_ACCESS_TOKEN,
    jobsEnabled: e.JOBS_ENABLED,
    pdfCacheDir: e.PDF_CACHE_DIR,
    clientIpHeader: e.CLIENT_IP_HEADER?.toLowerCase(),
  };
}
