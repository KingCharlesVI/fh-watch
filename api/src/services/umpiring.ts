import type { Appointment } from "@fh/shared";
import { and, arrayContains, asc, eq, inArray, ne } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { DbOrTx } from "../db/client.js";
import { appointments, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import type { Mail } from "./mailer.js";

type AppointmentRow = typeof appointments.$inferSelect;

export const appointmentDto = (a: AppointmentRow, displayName: string): Appointment => ({
  id: a.id,
  fixtureId: a.fixtureId,
  userId: a.userId,
  displayName,
  role: a.role,
  mentoring: a.mentoring,
  status: a.status,
  coverRequested: a.coverRequestedAt !== null,
  createdAt: a.createdAt.toISOString(),
  respondedAt: a.respondedAt?.toISOString() ?? null,
});

/** Each fixture's appointments, the watch umpire first; given up ones are left out. */
export async function appointmentsFor(db: DbOrTx, fixtureIds: string[]): Promise<Map<string, Appointment[]>> {
  const byFixture = new Map<string, Appointment[]>(fixtureIds.map((id) => [id, []]));
  if (fixtureIds.length === 0) return byFixture;
  const rows = await db
    .select({ a: appointments, displayName: users.displayName })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.userId))
    .where(and(inArray(appointments.fixtureId, fixtureIds), ne(appointments.status, "released")))
    .orderBy(asc(appointments.role), asc(appointments.createdAt));
  for (const r of rows) byFixture.get(r.a.fixtureId)!.push(appointmentDto(r.a, r.displayName));
  return byFixture;
}

/** The email addresses of a club's admins, to tell about declines, cover and gaps. */
export async function clubAdminEmails(db: DbOrTx, clubId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.clubId, clubId), arrayContains(users.roles, ["club_admin"])));
  return rows.map((r) => r.email);
}

/** Sends emails without failing the request that caused them: a failure is only logged. */
export function sendAll(deps: AppDeps, log: FastifyBaseLogger, mails: Mail[]) {
  for (const mail of mails) {
    deps.mailer.send(mail).catch((err: unknown) => log.error({ err, to: mail.to }, "Failed to send email"));
  }
}
