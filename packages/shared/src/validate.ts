import { eventTime, formatDuration } from "./describe.js";
import { MatchDocument, type MatchEvent } from "./schema.js";
import { formatClock, shootoutTaker } from "./summary.js";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Machine-readable code, e.g. `seq_order`. `schema` for structural failures. */
  code: string;
  path: (string | number)[];
  message: string;
}

export type ParseResult =
  | { ok: true; match: MatchDocument; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

/**
 * Parse and fully validate an untrusted match document (from the watch, the
 * phone or an API request). Errors make the document unusable; warnings flag
 * likely mistakes the umpire should review but that must not block an upload.
 */
export function parseMatch(input: unknown): ParseResult {
  const parsed = MatchDocument.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map(
      (issue): ValidationIssue => ({
        severity: "error",
        code: "schema",
        path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
        message: issue.message,
      }),
    );
    return { ok: false, errors, warnings: [] };
  }

  const issues = checkSemantics(parsed.data);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, match: parsed.data, warnings };
}

/** Rules a JSON Schema can't express. Assumes `match` already passed the Zod schema. */
export function checkSemantics(match: MatchDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, path: (string | number)[], message: string) =>
    issues.push({ severity: "error", code, path, message });
  const warn = (code: string, path: (string | number)[], message: string) =>
    issues.push({ severity: "warning", code, path, message });

  const { settings, events } = match;

  if (settings.breakLengthsSec.length !== settings.periods - 1) {
    error(
      "break_count",
      ["settings", "breakLengthsSec"],
      `A match with ${settings.periods} periods needs ${settings.periods - 1} break lengths, not ${settings.breakLengthsSec.length}.`,
    );
  }

  if (match.endedAt && Date.parse(match.endedAt) < Date.parse(match.startedAt)) {
    error("ended_before_started", ["endedAt"], "The match ends before it starts.");
  }

  const bySeq = new Map<number, { event: MatchEvent; index: number }>();
  const voidedSeqs = new Set<number>();
  let prevSeq = 0;

  events.forEach((event, index) => {
    const path = ["events", index];

    if (event.seq <= prevSeq) {
      error("seq_order", [...path, "seq"], `Event ${event.seq} is out of order: event numbers must increase (previous was ${prevSeq}).`);
    }
    prevSeq = Math.max(prevSeq, event.seq);

    if ("period" in event && event.period !== undefined && event.period > settings.periods) {
      error("period_range", [...path, "period"], `${eventTime(event, settings)} is in period ${event.period}, but the match has only ${settings.periods}.`);
    }

    if ("clockMs" in event && event.clockMs !== undefined && event.clockMs > settings.periodLengthSec * 1000) {
      warn("clock_overrun", [...path, "clockMs"], `${eventTime(event, settings)} is after the end of the period (${formatClock(settings.periodLengthSec * 1000)}).`);
    }

    if (event.type === "card" && event.shootout) {
      // FIH: only yellow or red in the shootout, and the player is out for the rest of it.
      if (event.color === "green") {
        error("shootout_card", [...path, "color"], "A green card can't be given in the shootout: only yellow or red.");
      }
      if (event.durationSec !== undefined) {
        error("card_duration", [...path, "durationSec"], "A card in the shootout has no suspension duration: the player takes no further part.");
      }
    } else if (event.type === "card") {
      if (event.color === "red" && event.durationSec !== undefined) {
        error("card_duration", [...path, "durationSec"], "A red card has no suspension duration.");
      }
      if (event.color !== "red" && event.durationSec === undefined) {
        error("card_duration", [...path, "durationSec"], `A ${event.color} card needs a suspension duration.`);
      }
      const d = settings.cardDurationsSec;
      if (event.color === "green" && event.durationSec !== undefined && event.durationSec !== d.green) {
        warn("card_duration_setting", [...path, "durationSec"], `${eventTime(event, settings)}: this green card lasts ${formatDuration(event.durationSec)}, but green cards are set to ${formatDuration(d.green)}.`);
      }
      if (
        event.color === "yellow" &&
        event.durationSec !== undefined &&
        event.durationSec !== d.yellowShort &&
        event.durationSec !== d.yellowLong
      ) {
        warn(
          "card_duration_setting",
          [...path, "durationSec"],
          `${eventTime(event, settings)}: this yellow card lasts ${formatDuration(event.durationSec)}, but yellow cards are set to ${formatDuration(d.yellowShort)} or ${formatDuration(d.yellowLong)}.`,
        );
      }
    }

    if (event.type === "card_end" || event.type === "void") {
      const target = bySeq.get(event.refSeq);
      if (!target) {
        error("ref_missing", [...path, "refSeq"], `Event ${event.seq} refers to event ${event.refSeq}, which doesn't exist before it.`);
      } else if (event.type === "card_end" && (target.event.type !== "card" || target.event.color === "red")) {
        error("ref_type", [...path, "refSeq"], `Event ${event.seq} ends a suspension, but event ${event.refSeq} is ${describe(target.event)}, not a green or yellow card.`);
      } else if (event.type === "void" && target.event.type === "void") {
        error("ref_type", [...path, "refSeq"], `Event ${event.seq} tries to cancel a cancellation; restore the original event instead.`);
      } else if (event.type === "void") {
        if (voidedSeqs.has(event.refSeq)) {
          warn("double_void", [...path, "refSeq"], `Event ${event.refSeq} is cancelled more than once.`);
        }
        voidedSeqs.add(event.refSeq);
      }
    }

    bySeq.set(event.seq, { event, index });
  });

  // Cross-event checks on the events that still count.
  const active = events.filter((e) => e.type !== "void" && !voidedSeqs.has(e.seq));

  for (const side of ["home", "away"] as const) {
    const scoredStrokes = active.filter((e) => e.type === "penalty_stroke" && e.team === side && e.scored).length;
    const strokeGoals = active.filter((e) => e.type === "goal" && e.team === side && e.method === "ps").length;
    if (scoredStrokes !== strokeGoals) {
      warn(
        "stroke_goal_mismatch",
        ["events"],
        `${match.teams[side].name}: ${scoredStrokes} scored penalty stroke(s) but ${strokeGoals} goal(s) from a penalty stroke. Each scored stroke needs its goal too.`,
      );
    }
  }

  const shootoutIndex = events.findIndex((e) => e.type === "shootout_attempt" && !voidedSeqs.has(e.seq));
  if (shootoutIndex !== -1) {
    if (!settings.shootoutIfDrawn) {
      warn("unexpected_shootout", ["events", shootoutIndex], "There's a shootout, but this match was set up without one.");
    }
    const goals = { home: 0, away: 0 };
    for (const e of active) if (e.type === "goal") goals[e.team]++;
    if (goals.home !== goals.away) {
      warn("unexpected_shootout", ["events", shootoutIndex], `There's a shootout, but the match wasn't drawn (${goals.home}–${goals.away}).`);
    }
  }

  const attempts = active.filter((e) => e.type === "shootout_attempt");
  let outOfOrder = false;
  attempts.forEach((attempt, i) => {
    const path = ["events", events.indexOf(attempt)];
    if (attempt.forfeit && attempt.scored) {
      error("forfeit_scored", [...path, "scored"], "A forfeited shoot-out can't be scored.");
    }
    if (attempt.forfeit && !active.some((e) => e.type === "card" && e.shootout && e.team === attempt.team && e.seq < attempt.seq)) {
      warn("forfeit_without_card", path, `${match.teams[attempt.team].name} forfeit a shoot-out, but none of their players was suspended in the shootout.`);
    }
    if (!outOfOrder && attempt.team !== shootoutTaker(attempts[0]!.team, i)) {
      outOfOrder = true;
      warn("shootout_order", path, `Shoot-out ${i + 1} was taken by ${match.teams[attempt.team].name}, out of turn.`);
    }
  });

  return issues;
}

function describe(event: MatchEvent): string {
  return event.type === "card" ? `a ${event.color} card` : `a ${event.type.replace("_", " ")}`;
}
