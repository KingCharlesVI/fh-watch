import { z } from "zod";

/**
 * The match document: the one format the watch writes, the phone edits and the
 * API stores. This Zod schema is the authoring source; `pnpm gen:schema` emits
 * `schema/match.schema.json` from it for the Kotlin and Swift watch apps.
 *
 * Only `seq` orders the event log (append order). Chronological order comes
 * from `period` + `clockMs`, so events added later on the phone can slot in.
 */

export const SCHEMA_VERSION = 1;

export const TeamSide = z.enum(["home", "away"]).meta({ description: "Which team an event belongs to." });

const ShirtNumber = z.int().min(0).max(999).meta({ description: "Player's shirt number." });

const Seq = z.int().min(1).meta({ description: "Position in the event log. Unique, ascending in array order." });

const Period = z.int().min(1).max(8).meta({ description: "1-based period number." });

const ClockMs = z
  .int()
  .min(0)
  .meta({ description: "Match-clock time within the period, in milliseconds. Excludes stoppages." });

const WallTime = z.iso.datetime().meta({ description: "UTC time the event was recorded on the watch." });

/** Fields every event carries. */
const base = {
  seq: Seq,
  wallTime: WallTime.optional(),
};

/** Fields for events that happen at a point on the match clock. */
const timed = {
  ...base,
  period: Period,
  clockMs: ClockMs,
};

export const PeriodStartEvent = z.strictObject({ ...timed, type: z.literal("period_start") });

export const PeriodEndEvent = z.strictObject({ ...timed, type: z.literal("period_end") });

export const ClockStopEvent = z.strictObject({
  ...timed,
  type: z.literal("clock_stop"),
  reason: z.enum(["injury", "video", "other"]).optional(),
});

export const ClockResumeEvent = z.strictObject({ ...timed, type: z.literal("clock_resume") });

export const GoalEvent = z.strictObject({
  ...timed,
  type: z.literal("goal"),
  team: TeamSide,
  player: ShirtNumber.optional(),
  method: z
    .enum(["field", "pc", "ps"])
    .optional()
    .meta({ description: "field = field goal, pc = penalty corner, ps = penalty stroke." }),
});

export const CardColor = z.enum(["green", "yellow", "red"]);

/** Why a card was given. The labels people see are CARD_REASONS in describe.ts. */
export const CardReason = z
  .enum(["danger", "breakdown", "physical", "dissent", "other"])
  .meta({
    description: "Why the card was given: danger, breakdown of play, physical misconduct, dissent, or other.",
  });

export const CardEvent = z.strictObject({
  ...timed,
  type: z.literal("card"),
  team: TeamSide,
  player: ShirtNumber.optional(),
  color: CardColor,
  reason: CardReason.optional(),
  durationSec: z
    .int()
    .min(1)
    .optional()
    .meta({ description: "Suspension length. Required for green and yellow, absent for red and for cards in the shootout." }),
  shootout: z.literal(true).optional().meta({
    description:
      "Given during the shootout: yellow or red only, and the player takes no further part in it. period and clockMs are where the match ended.",
  }),
});

export const CardEndEvent = z.strictObject({
  ...timed,
  type: z.literal("card_end"),
  refSeq: Seq.meta({ description: "seq of the card whose suspension ended." }),
});

export const PenaltyCornerEvent = z.strictObject({
  ...timed,
  type: z.literal("penalty_corner"),
  team: TeamSide.meta({ description: "Team awarded the penalty corner." }),
});

export const PenaltyStrokeEvent = z.strictObject({
  ...timed,
  type: z.literal("penalty_stroke"),
  team: TeamSide.meta({ description: "Team awarded the penalty stroke." }),
  scored: z.boolean().meta({
    description: "Whether the stroke was scored. A scored stroke also needs a goal event with method ps; only goal events count towards the score.",
  }),
});

export const ShootoutAttemptEvent = z.strictObject({
  ...base,
  type: z.literal("shootout_attempt"),
  team: TeamSide,
  round: z.int().min(1),
  player: ShirtNumber.optional(),
  scored: z.boolean(),
  forfeit: z.literal(true).optional().meta({
    description: "Not taken: the player due to take it was suspended during the shootout. Never scored.",
  }),
});

export const VoidEvent = z.strictObject({
  ...base,
  type: z.literal("void"),
  refSeq: Seq.meta({ description: "seq of the event being cancelled. A void cannot target another void." }),
  period: Period.optional(),
  clockMs: ClockMs.optional(),
});

export const NoteEvent = z.strictObject({
  ...base,
  type: z.literal("note"),
  text: z.string().min(1).max(1000),
  period: Period.optional(),
  clockMs: ClockMs.optional(),
});

export const MatchEvent = z.discriminatedUnion("type", [
  PeriodStartEvent,
  PeriodEndEvent,
  ClockStopEvent,
  ClockResumeEvent,
  GoalEvent,
  CardEvent,
  CardEndEvent,
  PenaltyCornerEvent,
  PenaltyStrokeEvent,
  ShootoutAttemptEvent,
  VoidEvent,
  NoteEvent,
]);

export const Team = z.strictObject({
  name: z.string().trim().min(1).max(80),
  teamId: z.uuid().nullable().meta({ description: "Linked team in the directory, or null while unlinked." }),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).meta({ description: "Hex colour, e.g. #1E40AF." }),
  captain: ShirtNumber.nullable().optional(),
});

export const MatchSettings = z.strictObject({
  periods: z.int().min(1).max(8),
  periodLengthSec: z.int().min(60).max(5400),
  breakLengthsSec: z
    .array(z.int().min(0).max(3600))
    .meta({ description: "Break after each period except the last, so periods - 1 entries." }),
  cardDurationsSec: z.strictObject({
    green: z.int().min(1).max(3600),
    yellowShort: z.int().min(1).max(3600),
    yellowLong: z.int().min(1).max(3600),
  }),
  shootoutIfDrawn: z.boolean(),
});

export const MatchDocument = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.uuid().meta({ description: "UUIDv7 created on the watch. Stable from watch to website." }),
    createdOn: z.enum(["wear", "watchos", "mobile", "web"]),
    settings: MatchSettings,
    teams: z.strictObject({ home: Team, away: Team }),
    venue: z.string().trim().min(1).max(120).nullable().optional(),
    competition: z.string().trim().min(1).max(120).nullable().optional(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso
      .datetime()
      .nullable()
      .optional()
      .meta({ description: "Final whistle." }),
    events: z.array(MatchEvent),
  })
  .meta({ title: "Field hockey match document" });

export type TeamSide = z.infer<typeof TeamSide>;
export type CardColor = z.infer<typeof CardColor>;
export type CardReason = z.infer<typeof CardReason>;
export type Team = z.infer<typeof Team>;
export type MatchSettings = z.infer<typeof MatchSettings>;
export type MatchEvent = z.infer<typeof MatchEvent>;
export type MatchEventType = MatchEvent["type"];
export type MatchDocument = z.infer<typeof MatchDocument>;
export type GoalEvent = z.infer<typeof GoalEvent>;
export type CardEvent = z.infer<typeof CardEvent>;
export type ShootoutAttemptEvent = z.infer<typeof ShootoutAttemptEvent>;
