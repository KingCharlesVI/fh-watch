import { type MatchDocument, summarizeMatch } from "@fh/shared";

// The day in the UK, with the month spelled out here: engines disagree on "Sep" and "Sept".
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/London" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(iso: string): string {
  const part = (type: string) => Number(dayFmt.formatToParts(new Date(iso)).find((p) => p.type === type)?.value);
  return `${part("day")} ${MONTHS[part("month") - 1]} ${part("year")}`;
}

/**
 * What goes with a shared match report: the subject for email, and the message
 * (WhatsApp's caption, an email's body). "Oxford Hawks M1 2–1 Reading M1, 19 Sep 2026".
 */
export function reportShareText(doc: MatchDocument): { subject: string; text: string } {
  const { score, shootout } = summarizeMatch(doc);
  const { home, away } = doc.teams;
  const result = `${home.name} ${score.home}–${score.away} ${away.name}`;
  const shootoutText = shootout ? ` (${shootout.home}–${shootout.away} in the shootout)` : "";
  const date = formatDay(doc.startedAt);
  const where = doc.venue ? ` at ${doc.venue}` : "";
  return {
    subject: `Match report: ${result}${shootoutText}, ${date}`,
    text: `Match report: ${result}${shootoutText}, ${date}${where}.`,
  };
}
