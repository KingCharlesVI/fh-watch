import { UMPIRING_TIME_ZONE, addDays, fixtureWhen, localDay, weekdayOf } from "@fh/shared";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { clubs, fixtures, umpiringGapNotices } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import type { Mail } from "./mailer.js";
import { appointmentsFor, clubAdminEmails, needsUmpires } from "./umpiring.js";

/** How far ahead gaps are looked for. */
const WINDOW_DAYS = 7;
/** A gap this close sends an email whatever the day. */
const URGENT_DAYS = 2;
/** No emails before this hour, UK time. */
const SEND_FROM_HOUR = 8;

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: UMPIRING_TIME_ZONE, hour: "2-digit", hourCycle: "h23" });

/**
 * Emails each club's admins about its fixtures in the next week that still need umpires:
 * on Mondays, as an overview, and whenever one is two days away. Once a day at most, and
 * not before 8am.
 */
export async function emailUmpiringGaps(deps: Pick<AppDeps, "db" | "now" | "mailer" | "config">): Promise<{ clubs: number }> {
  const { db } = deps;
  const now = deps.now();
  if (Number(hourFormat.format(now)) < SEND_FROM_HOUR) return { clubs: 0 };
  const today = localDay(now);
  const monday = weekdayOf(today) === 1;
  const urgentDay = addDays(today, URGENT_DAYS);

  const gaps = await db
    .select({ f: fixtures, clubName: clubs.name, sentOn: umpiringGapNotices.sentOn })
    .from(fixtures)
    .innerJoin(clubs, eq(clubs.id, fixtures.clubId))
    .leftJoin(umpiringGapNotices, eq(umpiringGapNotices.clubId, fixtures.clubId))
    .where(and(gte(fixtures.date, today), lte(fixtures.date, addDays(today, WINDOW_DAYS)), needsUmpires))
    .orderBy(asc(fixtures.date), sql`${fixtures.time} asc nulls last`);

  const byClub = new Map<string, typeof gaps>();
  for (const g of gaps) {
    if (g.sentOn === today) continue;
    byClub.set(g.f.clubId, [...(byClub.get(g.f.clubId) ?? []), g]);
  }

  let sent = 0;
  for (const [clubId, list] of byClub) {
    if (!monday && !list.some((g) => g.f.date === urgentDay)) continue;
    const to = await clubAdminEmails(db, clubId);
    const appointed = await appointmentsFor(
      db,
      list.map((g) => g.f.id),
    );
    const lines = list.map(({ f }) => {
      const active = appointed.get(f.id)!.filter((a) => a.status === "offered" || a.status === "accepted");
      const accepted = active.filter((a) => a.status === "accepted").length;
      const waiting = active.filter((a) => a.status === "offered").map((a) => a.displayName);
      const short = f.umpiresNeeded - accepted;
      return (
        `- ${fixtureWhen(f.date, f.time)}: ${f.homeName} v ${f.awayName}. Needs ${short} more` +
        (waiting.length ? ` (${waiting.join(" and ")} asked, no answer yet).` : ".")
      );
    });
    const mails: Mail[] = to.map((email) => ({
      to: email,
      subject: `${list.length === 1 ? "A fixture needs" : `${list.length} fixtures need`} umpires`,
      text: `${list[0]!.clubName}'s fixtures in the next week that are short of umpires:\n\n${lines.join("\n")}\n\nAppoint umpires here:\n\n${deps.config.webUrl}/dashboard/fixtures`,
    }));
    // Recorded first, so a failed email isn't retried every hour.
    await db
      .insert(umpiringGapNotices)
      .values({ clubId, sentOn: today })
      .onConflictDoUpdate({ target: umpiringGapNotices.clubId, set: { sentOn: today } });
    await Promise.allSettled(mails.map((m) => deps.mailer.send(m)));
    sent++;
  }
  return { clubs: sent };
}
