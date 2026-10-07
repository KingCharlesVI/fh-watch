import { and, lt, ne } from "drizzle-orm";
import { accessRequests, clubRequests } from "../db/schema.js";
import type { AppDeps } from "../deps.js";

/** How long an answered request (to join a test, or about a club) is kept: the privacy policy says 12 months. */
export const ANSWERED_REQUEST_RETENTION_MONTHS = 12;

/**
 * Deletes requests to join a test, and club requests, answered more than 12 months ago.
 * Waiting ones are kept, however old. (A club request also goes when its account does.)
 */
export async function purgeAnsweredRequests(deps: Pick<AppDeps, "db" | "now">): Promise<{ accessRequests: number; clubRequests: number }> {
  // A copy: now() may hand out a shared Date (the tests' clock does).
  const cutoff = new Date(deps.now());
  cutoff.setMonth(cutoff.getMonth() - ANSWERED_REQUEST_RETENTION_MONTHS);
  const access = await deps.db
    .delete(accessRequests)
    .where(and(ne(accessRequests.status, "pending"), lt(accessRequests.reviewedAt, cutoff)))
    .returning({ id: accessRequests.id });
  const club = await deps.db
    .delete(clubRequests)
    .where(and(ne(clubRequests.status, "pending"), lt(clubRequests.reviewedAt, cutoff)))
    .returning({ id: clubRequests.id });
  return { accessRequests: access.length, clubRequests: club.length };
}
