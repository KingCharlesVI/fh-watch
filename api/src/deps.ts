import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { Mailer } from "./services/mailer.js";
import type { PdfRenderer } from "./services/pdf.js";
import type { PushSender } from "./services/push.js";

/** Everything the routes and jobs need from outside. Tests swap in fakes. */
export interface AppDeps {
  config: Config;
  db: Db;
  mailer: Mailer;
  push: PushSender;
  pdf: PdfRenderer;
  now: () => Date;
  /** Sign-in, reset and verification requests per IP and per email. */
  authRateLimit: { max: number; windowMs: number };
  /** Every other API request per IP: generous, only to stop scripts. */
  apiRateLimit: { max: number; windowMs: number };
  /** CSV and PDF downloads per IP, on top of the general limit: a PDF is the heaviest thing the API does. */
  exportRateLimit: { max: number; windowMs: number };
}
