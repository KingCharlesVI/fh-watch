import { describeEvent, eventTime } from "./describe.js";
import type { MatchDocument } from "./schema.js";
import { summarizeMatch } from "./summary.js";

export interface ReportInput {
  document: MatchDocument;
  umpires: { slot: number; name: string }[];
  /** The server revision, or null for a report made on the phone from its own copy. */
  revision: number | null;
  shareUrl: string | null;
  generatedAt: Date;
}

const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" });

/**
 * One-page A4 match report as self-contained HTML (no external assets), for
 * printing to PDF. Every value from the document is escaped.
 */
export function renderMatchReport({ document: doc, umpires, revision, shareUrl, generatedAt }: ReportInput): string {
  const s = summarizeMatch(doc);
  const { home, away } = doc.teams;
  const shownTypes = new Set(["goal", "card", "penalty_stroke", "shootout_attempt", "note"]);
  const rows = s.timeline
    .filter((e) => shownTypes.has(e.type))
    .map((e) => {
      const team = "team" in e ? doc.teams[e.team].name : "";
      const player = "player" in e && e.player !== undefined ? `#${e.player}` : "";
      return `<tr><td class="num">${esc(eventTime(e, doc.settings))}</td><td>${esc(team)}</td><td>${esc(describeEvent(e, doc.settings))}</td><td class="num">${esc(player)}</td></tr>`;
    })
    .join("");

  const periodHead = s.periodScores.map((p) => `<th>${p.period}</th>`).join("");
  const periodRow = (side: "home" | "away") => s.periodScores.map((p) => `<td>${p[side]}</td>`).join("");

  const stat = (label: string, h: number | string, a: number | string) =>
    `<tr><td class="num">${esc(h)}</td><th>${esc(label)}</th><td class="num">${esc(a)}</td></tr>`;

  const meta = [doc.competition, doc.venue].filter(Boolean).map(esc).join(" · ");
  const umpireText = umpires.length ? umpires.map((u) => esc(u.name)).join(" and ") : "Not recorded";
  const shootout = s.shootout
    ? `<p class="shootout">Shootout ${s.shootout.home}–${s.shootout.away} (${s.shootout.rounds} rounds)</p>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(home.name)} v ${esc(away.name)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.4 "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  header .meta { color: #555; font-size: 9.5pt; }
  .score { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin: 10px 0 4px; }
  .team { font-size: 15pt; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .team.away { justify-content: flex-end; text-align: right; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #0002; flex: none; }
  .result { font-size: 28pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .shootout { text-align: center; margin: 0; color: #333; }
  h2 { font-size: 11pt; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #444; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 3px 6px; border-bottom: 1px solid #ddd; text-align: left; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .periods td, .periods th { text-align: center; }
  .periods th:first-child, .periods td:first-child { text-align: left; }
  .stats { width: 60%; margin: 0 auto; }
  .stats th { text-align: center; font-weight: 500; color: #444; }
  .stats td:first-child { text-align: left; } .stats td:last-child { text-align: right; }
  footer { margin-top: 18px; padding-top: 6px; border-top: 1px solid #ccc; color: #666; font-size: 8.5pt; display: flex; justify-content: space-between; }
</style></head>
<body>
<header>
  <div class="meta">${esc(dateFmt.format(new Date(doc.startedAt)))}${meta ? ` · ${meta}` : ""}</div>
  <div class="score">
    <div class="team home"><span class="swatch" style="background:${esc(home.color)}"></span>${esc(home.name)}</div>
    <div class="result">${s.score.home}–${s.score.away}</div>
    <div class="team away">${esc(away.name)}<span class="swatch" style="background:${esc(away.color)}"></span></div>
  </div>
  ${shootout}
</header>

<h2>Score by period</h2>
<table class="periods"><thead><tr><th>Team</th>${periodHead}<th>Total</th></tr></thead>
<tbody>
<tr><td>${esc(home.name)}</td>${periodRow("home")}<td><strong>${s.score.home}</strong></td></tr>
<tr><td>${esc(away.name)}</td>${periodRow("away")}<td><strong>${s.score.away}</strong></td></tr>
</tbody></table>

<h2>Match statistics</h2>
<table class="stats"><tbody>
${stat("Penalty corners", s.penaltyCorners.home, s.penaltyCorners.away)}
${stat("Penalty strokes (scored)", `${s.penaltyStrokes.home.awarded} (${s.penaltyStrokes.home.scored})`, `${s.penaltyStrokes.away.awarded} (${s.penaltyStrokes.away.scored})`)}
${stat("Green cards", s.cards.home.green, s.cards.away.green)}
${stat("Yellow cards", s.cards.home.yellow, s.cards.away.yellow)}
${stat("Red cards", s.cards.home.red, s.cards.away.red)}
</tbody></table>

<h2>Events</h2>
${rows ? `<table><thead><tr><th>Time</th><th>Team</th><th>Event</th><th>Player</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No goals, cards or notes recorded.</p>"}

<p><strong>Umpires:</strong> ${umpireText}</p>

<footer>
  <span>${shareUrl ? esc(shareUrl) : revision === null ? "From the FH Match Centre app" : "Not published"}</span>
  <span>${revision === null ? "" : `Revision ${revision} · `}generated ${esc(generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC</span>
</footer>
</body></html>`;
}
