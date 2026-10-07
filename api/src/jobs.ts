import type { FastifyBaseLogger } from "fastify";
import type { AppDeps } from "./deps.js";
import { purgeExpired } from "./services/matches.js";
import { purgeAnsweredRequests } from "./services/retention.js";

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

  const purge = run("purge", () => purgeExpired(deps));
  const purgeRequests = run("purge-requests", () => purgeAnsweredRequests(deps));

  const timers = [setInterval(purge, PURGE_EVERY_MS), setInterval(purgeRequests, PURGE_EVERY_MS)];
  for (const t of timers) t.unref();
  void purge();
  void purgeRequests();

  return () => timers.forEach(clearInterval);
}
