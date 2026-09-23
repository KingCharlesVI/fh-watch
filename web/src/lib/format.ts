// Dates are shown in UK time, where the matches are played.
const TIME_ZONE = "Europe/London";

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const longFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: TIME_ZONE });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatLongDateTime = (iso: string) => longFmt.format(new Date(iso));

/** "2–1", or "1–1 (3–2 SO)" when a shootout decided it. */
export function scoreline(home: { score: number; shootout: number | null }, away: { score: number; shootout: number | null }) {
  const main = `${home.score}–${away.score}`;
  return home.shootout !== null && away.shootout !== null ? `${main} (${home.shootout}–${away.shootout} SO)` : main;
}

/** A yyyy-mm-dd date input as the start of that day in UK time, in ISO form. */
export function dayStartIso(day: string | undefined): string | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  // Find the UTC offset London has on that day, then express local midnight in UTC.
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const londonNoon = new Date(noonUtc.toLocaleString("en-US", { timeZone: TIME_ZONE }));
  const utcNoon = new Date(noonUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = londonNoon.getTime() - utcNoon.getTime();
  return new Date(Date.parse(`${day}T00:00:00Z`) - offsetMs).toISOString();
}

export function addDaysIso(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
