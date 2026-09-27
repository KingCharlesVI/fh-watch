import type { CardColor, CardReason, MatchDocument, MatchEvent, MatchSettings, TeamSide } from "./schema.js";

/**
 * Edits umpires make after the match, shared by the website and phone app.
 * Every function returns a new document and leaves its input untouched.
 */

export type NewEvent = MatchEvent extends infer E ? (E extends MatchEvent ? Omit<E, "seq"> : never) : never;

// JSON copy rather than structuredClone, which React Native lacks; documents are plain JSON anyway.
const clone = (doc: MatchDocument): MatchDocument => JSON.parse(JSON.stringify(doc)) as MatchDocument;

export function nextSeq(doc: MatchDocument): number {
  return doc.events.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
}

/** Seqs of events cancelled by a `void`. */
export function voidedSeqs(doc: MatchDocument): Set<number> {
  return new Set(doc.events.flatMap((e) => (e.type === "void" ? [e.refSeq] : [])));
}

export function addEvent(doc: MatchDocument, event: NewEvent): MatchDocument {
  const next = clone(doc);
  next.events.push({ ...event, seq: nextSeq(doc) } as MatchEvent);
  return next;
}

/**
 * Cancels an event. One that's already saved gets a `void`, so the original
 * record survives; one added in this editing session (not in `savedSeqs`) is
 * simply removed.
 */
export function cancelEvent(doc: MatchDocument, seq: number, savedSeqs: ReadonlySet<number>): MatchDocument {
  const next = clone(doc);
  if (savedSeqs.has(seq)) next.events.push({ seq: nextSeq(doc), type: "void", refSeq: seq });
  else next.events = next.events.filter((e) => e.seq !== seq);
  return next;
}

/** Undoes a cancellation by removing the `void`s that target the event. */
export function restoreEvent(doc: MatchDocument, seq: number): MatchDocument {
  const next = clone(doc);
  next.events = next.events.filter((e) => !(e.type === "void" && e.refSeq === seq));
  return next;
}

/**
 * Sets or clears the reason on a card (null clears it). Unlike other corrections,
 * this edits the card itself: the reason is a detail of the card, not a separate
 * event, and a new revision keeps the old one in the history.
 */
export function setCardReason(doc: MatchDocument, seq: number, reason: CardReason | null): MatchDocument {
  return {
    ...doc,
    events: doc.events.map((e) => {
      if (e.seq !== seq || e.type !== "card") return e;
      const { reason: _old, ...rest } = e;
      return reason ? { ...rest, reason } : rest;
    }),
  };
}

/** "12:30" or "12" (minutes) → milliseconds. Null if unreadable. */
export function parseClock(value: string): number | null {
  const m = /^\s*(\d{1,3})(?::([0-5]\d))?\s*$/.exec(value);
  return m ? (Number(m[1]) * 60 + Number(m[2] ?? 0)) * 1000 : null;
}

/** What the "add an event" form collects. */
export interface EventInput {
  type: "goal" | "card" | "penalty_corner" | "penalty_stroke" | "note";
  team: TeamSide;
  period: number;
  /** As typed: "12:30". Optional for notes. */
  clock: string;
  /** Shirt number as typed; "" for none. */
  player: string;
  method?: "field" | "pc" | "ps";
  color?: CardColor;
  /** Yellow cards: the longer suspension. */
  yellowLong?: boolean;
  /** Cards: why it was given, if known. */
  reason?: CardReason;
  scored?: boolean;
  text?: string;
}

/** Turns form input into an event, or explains what's missing. */
export function buildEvent(input: EventInput, settings: MatchSettings): { event: NewEvent } | { error: string } {
  const clockMs = parseClock(input.clock);
  if (input.type !== "note" && clockMs === null) return { error: "Enter the time on the match clock, e.g. 12:30." };
  if (input.type === "note" && !input.text?.trim()) return { error: "Write the note first." };
  if (input.type === "card" && input.player.trim() === "") return { error: "Cards need the player's shirt number." };
  const player = input.player.trim() === "" ? undefined : Number(input.player);
  if (player !== undefined && (!Number.isInteger(player) || player < 0 || player > 999)) {
    return { error: "Shirt numbers are whole numbers from 0 to 999." };
  }
  if (input.period < 1 || input.period > settings.periods) return { error: "Pick a period in this match." };

  const at = { period: input.period, clockMs: clockMs ?? 0 };
  const shirt = player === undefined ? {} : { player };
  const d = settings.cardDurationsSec;

  switch (input.type) {
    case "goal":
      return { event: { type: "goal", team: input.team, ...at, ...shirt, ...(input.method ? { method: input.method } : {}) } };
    case "card": {
      const color = input.color ?? "green";
      const durationSec = color === "green" ? d.green : color === "yellow" ? (input.yellowLong ? d.yellowLong : d.yellowShort) : undefined;
      return {
        event: { type: "card", team: input.team, ...at, ...shirt, color, ...(input.reason ? { reason: input.reason } : {}), ...(durationSec ? { durationSec } : {}) },
      };
    }
    case "penalty_corner":
      return { event: { type: "penalty_corner", team: input.team, ...at } };
    case "penalty_stroke":
      return { event: { type: "penalty_stroke", team: input.team, ...at, scored: input.scored ?? true } };
    case "note":
      return { event: { type: "note", text: input.text!.trim(), ...(clockMs === null ? {} : at) } };
  }
}
