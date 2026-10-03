import type { StatusComponent } from "./components";
import type { Incident, Note } from "./incidents";
import type { Check } from "./probe";
import { type Level, worst } from "./status";

/**
 * What a component's state actually is, from everything we know about it: the live
 * check, anything an admin set by hand, and any incident filed against it. The worst
 * of them wins, so a note saying "operational" can't paper over a check that times out.
 */
export function componentLevel(
  component: StatusComponent,
  check: Check | undefined,
  notes: Note[],
  open: Incident[],
): { level: Level; detail?: string; ms?: number | null } {
  const note = notes.find((n) => n.id === component.id);
  const fromIncidents = open.filter((i) => i.components.includes(component.id)).map((i) => i.level);
  const level = worst([...(check?.level ? [check.level] : []), ...(note ? [note.level] : []), ...fromIncidents]);
  // Say why, when there's something to say: the check's reason, or the note's.
  const detail = check?.detail ?? note?.note ?? undefined;
  return { level, detail: level === "operational" ? undefined : (detail ?? undefined), ms: check?.ms ?? null };
}

/** The headline at the top of the page. */
export const overall = (levels: Level[]): Level => worst(levels);

/** "182 ms", or nothing for a component nothing can check. */
export const showMs = (ms: number | null | undefined) => (typeof ms === "number" ? `${ms} ms` : null);
