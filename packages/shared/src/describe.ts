import type { MatchEvent, MatchSettings } from "./schema.js";
import { formatClock } from "./summary.js";

/** "Q2" for quarters, "H1"/"H2" for halves, "P3" otherwise. */
export function periodLabel(periods: number, period: number): string {
  if (periods === 4) return `Q${period}`;
  if (periods === 2) return `H${period}`;
  return `P${period}`;
}

/** 120 → "2 min", 90 → "90 s". */
export function formatDuration(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`;
}

const capitalize = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Plain-English description of an event, for timelines and reports. Team and player are shown separately. */
export function describeEvent(event: MatchEvent, settings: Pick<MatchSettings, "periods">): string {
  switch (event.type) {
    case "period_start":
      return `Start of ${periodLabel(settings.periods, event.period)}`;
    case "period_end":
      return `End of ${periodLabel(settings.periods, event.period)}`;
    case "clock_stop":
      return event.reason ? `Clock stopped (${event.reason})` : "Clock stopped";
    case "clock_resume":
      return "Clock restarted";
    case "goal":
      return event.method === "pc" ? "Goal (penalty corner)" : event.method === "ps" ? "Goal (penalty stroke)" : "Goal";
    case "card":
      return event.durationSec === undefined
        ? `${capitalize(event.color)} card`
        : `${capitalize(event.color)} card (${formatDuration(event.durationSec)})`;
    case "card_end":
      return "Suspension ended";
    case "penalty_corner":
      return "Penalty corner";
    case "penalty_stroke":
      return event.scored ? "Penalty stroke scored" : "Penalty stroke missed";
    case "shootout_attempt":
      return `Shootout round ${event.round}: ${event.scored ? "scored" : "missed"}`;
    case "void":
      return `Cancelled event ${event.refSeq}`;
    case "note":
      return event.text;
  }
}

/** "Q2 6:52", "SO" for shootout attempts, "" for untimed events. */
export function eventTime(event: MatchEvent, settings: Pick<MatchSettings, "periods">): string {
  if (event.type === "shootout_attempt") return "SO";
  if (!("period" in event) || event.period === undefined) return "";
  const period = periodLabel(settings.periods, event.period);
  return "clockMs" in event && event.clockMs !== undefined ? `${period} ${formatClock(event.clockMs)}` : period;
}
