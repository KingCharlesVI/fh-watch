import { existsSync } from "node:fs";
import { pino } from "pino";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import type { AppDeps } from "./deps.js";
import { startJobs } from "./jobs.js";
import { logMailer, smtpMailer } from "./services/mailer.js";
import { chromiumPdfRenderer } from "./services/pdf.js";
import { expoPushSender, logPushSender } from "./services/push.js";

// Development convenience; in production the service manager supplies the environment from api.env.
if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const { db, close } = createDb(config.databaseUrl);

const deps: AppDeps = {
  config,
  db,
  now: () => new Date(),
  authRateLimit: { max: 10, windowMs: 15 * 60 * 1000 },
  // A website page makes up to about 6 API calls, so this is roughly 100 page views a minute.
  apiRateLimit: { max: 600, windowMs: 60 * 1000 },
  exportRateLimit: { max: 30, windowMs: 60 * 1000 },
  pdf: chromiumPdfRenderer(),
  mailer: config.smtpUrl ? smtpMailer(config.smtpUrl, config.mailFrom) : logMailer(log),
  push:
    config.expoAccessToken || config.env === "production" ? expoPushSender(config.expoAccessToken, log) : logPushSender(log),
};

if (!process.env.JWT_SECRET) log.warn("JWT_SECRET is not set; using a random key, so sign-ins won't survive a restart.");
if (config.env === "production" && !config.smtpUrl) {
  log.warn("SMTP_URL is not set: emails (sign-up confirmation, password resets) are only written to this log.");
}

const app = await buildApp(deps, { logger: log });
const stopJobs = config.jobsEnabled ? startJobs(deps, log) : () => {};

async function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`);
  stopJobs();
  await app.close();
  await deps.pdf.close();
  await close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
