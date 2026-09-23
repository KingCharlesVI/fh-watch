import type { FastifyBaseLogger } from "fastify";
import type { AppDeps } from "./deps.js";
import { autoPublishDue, purgeExpired } from "./services/matches.js";

const AUTO_PUBLISH_EVERY_MS = 60 * 1000;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

/** Runs the background jobs on timers inside the API process. Returns a stop function. */
export function startJobs(deps: AppDeps, log: FastifyBaseLogger): () => void {
  const run = (name: string, job: () => Promise<unknown>) => async () => {
    try {
      const result = await job();
      log.debug({ job: name, result }, "Job finished");
    } catch (err) {
      log.error({ err, job: name }, "Job failed");
    }
  };

  const autoPublish = run("auto-publish", () => autoPublishDue(deps, log));
  const purge = run("purge", () => purgeExpired(deps));

  const timers = [setInterval(autoPublish, AUTO_PUBLISH_EVERY_MS), setInterval(purge, PURGE_EVERY_MS)];
  for (const t of timers) t.unref();
  void autoPublish();
  void purge();

  return () => timers.forEach(clearInterval);
}
