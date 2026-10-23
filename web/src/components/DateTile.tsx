import { cn } from "@/lib/utils";

const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

/** A fixture's day as a small calendar leaf: "SAT", "19", "SEP". Takes a yyyy-mm-dd date. */
export function DateTile({ date, className }: { date: string; className?: string }) {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <span aria-hidden className={cn("flex w-14 shrink-0 flex-col items-center rounded-md bg-muted py-1.5 leading-none", className)}>
      <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{weekdayFmt.format(d)}</span>
      <span className="font-score mt-1 text-3xl">{d.getUTCDate()}</span>
      <span className="mt-0.5 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{monthFmt.format(d)}</span>
    </span>
  );
}
