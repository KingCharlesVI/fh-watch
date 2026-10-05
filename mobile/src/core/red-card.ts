import { CARD_REASONS, type CardEvent, type MatchDocument, eventTime, voidedSeqs } from "@fh/shared";
import type { LocalMatch } from "./store";

/**
 * Red card reports, for England Hockey's online Red Card and Misconduct Complaint
 * Form. The app gathers what its checklist asks for, filled in from the match where
 * it can, so the umpire can copy each answer into the form, or send it as a PDF.
 * Reports stay on the phone: they're never uploaded.
 */

/** England Hockey's online form (25-26 season). */
export const RED_CARD_FORM_URL =
  "https://forms.cloud.microsoft/pages/responsepage.aspx?id=NvkYmuiQxU--asEa8eSc6iwKMs7VYSdMtjj9uM4cfo9UOTFIUTgzWEZNVjFDM0ZPUDFCR0VTWFNSNS4u&route=shorturl";

/** England Hockey's areas, as the form lists them. */
export const AREAS = ["East", "Midlands", "North", "South", "West"] as const;

/** The umpire's own details, the same on every report, so the phone remembers them. */
export interface ReporterDetails {
  name: string;
  qualification: string;
  contact: string;
}

/** One red card's report. Blank strings are answers not given yet. */
export interface RedCardReport {
  /** The card's `seq` in the match document. */
  cardSeq: number;
  colleague: string;
  offenderName: string;
  shirtNumber: string;
  /** Whether the offender is under 18, or null until known. */
  under18: boolean | null;
  club: string;
  team: string;
  area: string;
  league: string;
  fixture: string;
  /** What happened, in the umpire's words. */
  details: string;
  /** Sent through England Hockey's form. */
  submittedAt: string | null;
  updatedAt: string;
}

export const EMPTY_REPORTER: ReporterDetails = { name: "", qualification: "", contact: "" };

/** The red cards in a match that haven't been cancelled, in the order they were given. */
export function redCards(doc: MatchDocument): CardEvent[] {
  const voided = voidedSeqs(doc);
  return doc.events.filter((e): e is CardEvent => e.type === "card" && e.color === "red" && !voided.has(e.seq));
}

/** A new report for a red card, filled in from the match. */
export function draftReport(m: LocalMatch, card: CardEvent, me: ReporterDetails, now: Date): RedCardReport {
  const doc = m.document!;
  const team = doc.teams[card.team].name;
  // The other umpire: the one listed for the match who isn't the reporter.
  const mine = me.name.trim().toLowerCase();
  const others = (m.umpireNames ?? []).filter((n) => n.trim().toLowerCase() !== mine);
  return {
    cardSeq: card.seq,
    colleague: mine && others.length === 1 ? others[0]! : "",
    offenderName: "",
    shirtNumber: card.player !== undefined ? String(card.player) : "",
    under18: null,
    club: "",
    team,
    area: "",
    league: doc.competition ?? "",
    fixture: `${doc.teams.home.name} vs. ${doc.teams.away.name}`,
    details: "",
    submittedAt: null,
    updatedAt: now.toISOString(),
  };
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** When and why the card was given, from the match: "Q3 4:12, physical misconduct", or "Shootout, dissent". */
export function offenceSummary(doc: MatchDocument, card: CardEvent): string {
  const time = card.shootout ? "Shootout" : eventTime(card, doc.settings);
  return card.reason ? `${time}, ${CARD_REASONS[card.reason].toLowerCase()}` : time;
}

export interface Answer {
  section: string;
  label: string;
  value: string;
}

/** Every answer, in the order of England Hockey's checklist. */
export function reportAnswers(doc: MatchDocument, card: CardEvent, r: RedCardReport, me: ReporterDetails): Answer[] {
  const when = card.shootout
    ? `Red card in the shootout${card.reason ? `, ${CARD_REASONS[card.reason].toLowerCase()}` : ""}.`
    : `Red card at ${offenceSummary(doc, card)}.`;
  const facts = [when, doc.venue ? `Venue: ${doc.venue}.` : ""].filter(Boolean).join(" ");
  return [
    { section: "You", label: "Name", value: me.name },
    { section: "You", label: "Umpiring qualification", value: me.qualification },
    { section: "You", label: "Contact details", value: me.contact },
    { section: "Your colleague", label: "Name", value: r.colleague },
    { section: "Offender and club", label: "Name of offender", value: r.offenderName },
    { section: "Offender and club", label: "Shirt number", value: r.shirtNumber },
    { section: "Offender and club", label: "Over or under 18", value: r.under18 === null ? "" : r.under18 ? "Under 18" : "Over 18" },
    { section: "Offender and club", label: "Club", value: r.club },
    { section: "Offender and club", label: "Team", value: r.team },
    { section: "Competition and match", label: "Date of match", value: dateFmt.format(new Date(doc.startedAt)) },
    { section: "Competition and match", label: "Area", value: r.area },
    { section: "Competition and match", label: "League and division", value: r.league },
    { section: "Competition and match", label: "Fixture", value: r.fixture },
    { section: "Details of offence", label: "Details", value: [facts, r.details.trim()].filter(Boolean).join("\n\n") },
  ];
}

/** Checklist items still blank. */
export function missingAnswers(answers: Answer[]): Answer[] {
  return answers.filter((a) => !a.value.trim());
}

/** The report as plain text, for email or notes. */
export function reportText(answers: Answer[]): string {
  const lines = ["Red card report"];
  let section = "";
  for (const a of answers) {
    if (a.section !== section) {
      section = a.section;
      lines.push("", section.toUpperCase());
    }
    lines.push(`${a.label}: ${a.value || "(not given)"}`);
  }
  return lines.join("\n");
}

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** One-page A4 report as self-contained HTML, for printing to PDF. Every value is escaped. */
export function renderRedCardReport(doc: MatchDocument, answers: Answer[], generatedAt: Date): string {
  const sections: string[] = [];
  let open = "";
  for (const a of answers) {
    if (a.section !== open) {
      if (open) sections.push("</tbody></table>");
      open = a.section;
      sections.push(`<h2>${esc(a.section)}</h2><table><tbody>`);
    }
    const value = a.value ? esc(a.value).replace(/\n/g, "<br>") : `<span class="blank">Not given</span>`;
    sections.push(`<tr><th>${esc(a.label)}</th><td>${value}</td></tr>`);
  }
  if (open) sections.push("</tbody></table>");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Red card report: ${esc(doc.teams.home.name)} v ${esc(doc.teams.away.name)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font: 10.5pt/1.45 "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  .meta { color: #555; font-size: 9.5pt; border-bottom: 2px solid #111; padding-bottom: 8px; }
  h2 { font-size: 10.5pt; margin: 16px 0 4px; text-transform: uppercase; letter-spacing: .04em; color: #444; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { width: 34%; font-weight: 500; color: #444; }
  .blank { color: #999; font-style: italic; }
  footer { margin-top: 18px; padding-top: 6px; border-top: 1px solid #ccc; color: #666; font-size: 8.5pt; }
</style></head>
<body>
<h1>Red card report</h1>
<div class="meta">${esc(doc.teams.home.name)} v ${esc(doc.teams.away.name)} · ${esc(dateFmt.format(new Date(doc.startedAt)))}</div>
${sections.join("\n")}
<footer>For England Hockey's Red Card and Misconduct Complaint Form. From the FH Match Centre app, ${esc(generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC.</footer>
</body></html>`;
}
