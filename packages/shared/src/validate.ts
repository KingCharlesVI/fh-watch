import { MatchDocument, type MatchEvent } from "./schema.js";

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
      `Expected ${settings.periods - 1} break lengths for ${settings.periods} periods, got ${settings.breakLengthsSec.length}.`,
    );
  }

  if (match.endedAt && Date.parse(match.endedAt) < Date.parse(match.startedAt)) {
    error("ended_before_started", ["endedAt"], "endedAt is earlier than startedAt.");
  }

  const bySeq = new Map<number, { event: MatchEvent; index: number }>();
  const voidedSeqs = new Set<number>();
  let prevSeq = 0;

  events.forEach((event, index) => {
    const path = ["events", index];

    if (event.seq <= prevSeq) {
      error("seq_order", [...path, "seq"], `seq ${event.seq} must be greater than the previous event's seq ${prevSeq}.`);
    }
    prevSeq = Math.max(prevSeq, event.seq);

    if ("period" in event && event.period !== undefined && event.period > settings.periods) {
      error("period_range", [...path, "period"], `Period ${event.period} is beyond the match's ${settings.periods} periods.`);
    }

    if ("clockMs" in event && event.clockMs !== undefined && event.clockMs > settings.periodLengthSec * 1000) {
      warn("clock_overrun", [...path, "clockMs"], `Clock time ${event.clockMs} ms is past the end of a ${settings.periodLengthSec} s period.`);
    }

    if (event.type === "card") {
      if (event.color === "red" && event.durationSec !== undefined) {
        error("card_duration", [...path, "durationSec"], "A red card has no suspension duration.");
      }
      if (event.color !== "red" && event.durationSec === undefined) {
        error("card_duration", [...path, "durationSec"], `A ${event.color} card needs a suspension duration.`);
      }
      const d = settings.cardDurationsSec;
      if (event.color === "green" && event.durationSec !== undefined && event.durationSec !== d.green) {
        warn("card_duration_setting", [...path, "durationSec"], `Green card lasts ${event.durationSec} s; match setting is ${d.green} s.`);
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
          `Yellow card lasts ${event.durationSec} s; match settings are ${d.yellowShort} s or ${d.yellowLong} s.`,
        );
      }
    }

    if (event.type === "card_end" || event.type === "void") {
      const target = bySeq.get(event.refSeq);
      if (!target) {
        error("ref_missing", [...path, "refSeq"], `refSeq ${event.refSeq} does not match any earlier event.`);
      } else if (event.type === "card_end" && (target.event.type !== "card" || target.event.color === "red")) {
        error("ref_type", [...path, "refSeq"], `card_end must refer to a green or yellow card, not ${describe(target.event)}.`);
      } else if (event.type === "void" && target.event.type === "void") {
        error("ref_type", [...path, "refSeq"], "A void cannot cancel another void.");
      } else if (event.type === "void") {
        if (voidedSeqs.has(event.refSeq)) {
          warn("double_void", [...path, "refSeq"], `Event ${event.refSeq} is already voided.`);
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
        `${match.teams[side].name}: ${scoredStrokes} scored penalty stroke(s) but ${strokeGoals} penalty-stroke goal(s).`,
      );
    }
  }

  const shootoutIndex = events.findIndex((e) => e.type === "shootout_attempt" && !voidedSeqs.has(e.seq));
  if (shootoutIndex !== -1) {
    if (!settings.shootoutIfDrawn) {
      warn("unexpected_shootout", ["events", shootoutIndex], "Shootout recorded but the match settings don't allow one.");
    }
    const goals = { home: 0, away: 0 };
    for (const e of active) if (e.type === "goal") goals[e.team]++;
    if (goals.home !== goals.away) {
      warn("unexpected_shootout", ["events", shootoutIndex], `Shootout recorded but the match wasn't drawn (${goals.home}–${goals.away}).`);
    }
  }

  return issues;
}

function describe(event: MatchEvent): string {
  return event.type === "card" ? `a ${event.color} card` : `a ${event.type} event`;
}
