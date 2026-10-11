import { describeEvent, eventTime } from "./describe.js";
import type { MatchDocument, MatchEvent, TeamSide } from "./schema.js";
import { summarizeMatch } from "./summary.js";

/**
 * What changed from one revision of a match to the next, in plain English, for the match's
 * history: "Score: 2–1 → 2–2", "Added: H2 15:00 Goal, Reading M1 #7". Events are matched by
 * `seq`, so a correction to an event (a shirt number, a card's reason) shows as a change to it.
 * Empty if nothing anyone would notice changed.
 */
export function describeChanges(before: MatchDocument, after: MatchDocument): string[] {
  const lines: string[] = [];
  const changed = (label: string, a: string, b: string) => {
    if (a !== b) lines.push(`${label}: ${a} → ${b}`);
  };
  const quoted = (v: string | null | undefined) => (v ? `“${v}”` : "none");

  for (const side of ["home", "away"] as const) {
    const a = before.teams[side];
    const b = after.teams[side];
    const label = side === "home" ? "Home team" : "Away team";
    changed(label, quoted(a.name), quoted(b.name));
    if (a.teamId !== b.teamId) lines.push(b.teamId === null ? `${label} unlinked from its club` : `${label} linked to a club`);
    if (a.color.toLowerCase() !== b.color.toLowerCase()) lines.push(`${label}'s colour changed`);
    changed(`${label}'s captain`, shirt(a.captain), shirt(b.captain));
  }
  changed("Venue", quoted(before.venue), quoted(after.venue));
  changed("Competition", quoted(before.competition), quoted(after.competition));
  if (before.startedAt !== after.startedAt) lines.push("Start time changed");
  if ((before.endedAt ?? null) !== (after.endedAt ?? null)) lines.push("Final whistle time changed");
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) lines.push("Match format changed");

  const scoreA = summarizeMatch(before);
  const scoreB = summarizeMatch(after);
  changed("Score", score(scoreA), score(scoreB));
  changed("Shootout", shootout(scoreA), shootout(scoreB));

  const old = new Map(before.events.map((e) => [e.seq, e]));
  const now = new Map(after.events.map((e) => [e.seq, e]));
  for (const e of after.events) {
    const was = old.get(e.seq);
    if (!was) {
      if (e.type === "void") {
        const target = now.get(e.refSeq) ?? old.get(e.refSeq);
        lines.push(`Cancelled: ${target ? eventLabel(target, after) : `event ${e.refSeq}`}`);
      } else {
        lines.push(`Added: ${eventLabel(e, after)}`);
      }
    } else if (JSON.stringify(was) !== JSON.stringify(e)) {
      lines.push(`Changed: ${eventLabel(was, before)} → ${eventLabel(e, after)}`);
    }
  }
  for (const e of before.events) {
    if (now.has(e.seq)) continue;
    if (e.type === "void") {
      const target = now.get(e.refSeq) ?? old.get(e.refSeq);
      lines.push(`Restored: ${target ? eventLabel(target, after) : `event ${e.refSeq}`}`);
    } else {
      lines.push(`Removed: ${eventLabel(e, before)}`);
    }
  }
  return lines;
}

const shirt = (n: number | null | undefined) => (n === null || n === undefined ? "none" : `#${n}`);

const score = (s: ReturnType<typeof summarizeMatch>) => `${s.score.home}–${s.score.away}`;

const shootout = (s: ReturnType<typeof summarizeMatch>) => (s.shootout ? `${s.shootout.home}–${s.shootout.away}` : "none");

/** "H2 15:00 Goal, Reading M1 #7". */
function eventLabel(event: MatchEvent, doc: MatchDocument): string {
  const parts = [eventTime(event, doc.settings), describeEvent(event, doc.settings)].filter(Boolean).join(" ");
  const team = "team" in event ? teamName(doc, event.team) : null;
  const player = "player" in event && event.player !== undefined ? `#${event.player}` : null;
  const who = [team, player].filter(Boolean).join(" ");
  return who ? `${parts}, ${who}` : parts;
}

const teamName = (doc: MatchDocument, side: TeamSide) => doc.teams[side].name;
