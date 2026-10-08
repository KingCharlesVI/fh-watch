"use client";

import { addDays, weekdayOf } from "@fh/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markDay } from "@/app/actions/umpiring";
import type { Availability, AvailabilityDay } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type State = "available" | "unavailable" | "clear";
/** Each tap moves a day on: not said → free → not free → not said. */
const NEXT: Record<State, State> = { clear: "available", available: "unavailable", unavailable: "clear" };

/**
 * The next 12 weeks, Monday first. Tap a day to say you're free, then not free, then to
 * unmark it. Weekdays you're never free show as not free unless you mark the day.
 */
export function AvailabilityCalendar({ today, availability }: { today: string; availability: Availability }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(() => new Map(availability.days.map((d) => [d.date, d])));
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(monday, w * 7 + d)));

  function tap(date: string) {
    const marked = days.get(date);
    const next = NEXT[marked ? (marked.available ? "available" : "unavailable") : "clear"];
    const before = new Map(days);
    const after = new Map(days);
    if (next === "clear") after.delete(date);
    else after.set(date, { date, available: next === "available", from: null, to: null });
    setDays(after);
    startTransition(async () => {
      const state = await markDay(date, next);
      if (state?.error) {
        setDays(before);
        toast.error(state.error);
      } else router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto" aria-busy={pending}>
      <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} className="font-medium text-muted-foreground">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((date) => (
                <td key={date}>
                  <Day
                    date={date}
                    past={date < today}
                    marked={days.get(date)}
                    neverFree={availability.unavailableWeekdays.includes(weekdayOf(date))}
                    onTap={() => tap(date)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Day({ date, past, marked, neverFree, onTap }: { date: string; past: boolean; marked?: AvailabilityDay; neverFree: boolean; onTap: () => void }) {
  const [, m, d] = date.split("-").map(Number);
  const label = marked ? (marked.available ? (marked.from || marked.to ? `${marked.from ?? ""}–${marked.to ?? ""}` : "Free") : "Not free") : neverFree ? "Not free" : "";
  const tone = marked ? (marked.available ? "free" : "busy") : neverFree ? "usually-busy" : "unknown";
  return (
    <button
      type="button"
      disabled={past}
      onClick={onTap}
      aria-label={`${date}: ${label || "not said"}`}
      className={cn(
        "flex h-14 w-full flex-col items-start justify-between rounded-md border px-1.5 py-1 text-left transition-colors disabled:opacity-40",
        tone === "free" && "border-primary bg-primary/10",
        tone === "busy" && "border-destructive/40 bg-destructive/10",
        tone === "usually-busy" && "border-dashed bg-muted/50",
        tone === "unknown" && "hover:bg-muted",
      )}
    >
      <span className="text-xs text-muted-foreground">
        {d}
        {d === 1 ? ` ${MONTHS[m! - 1]}` : ""}
      </span>
      <span className={cn("text-xs font-medium", tone === "free" && "text-primary", tone === "busy" && "text-destructive")}>{label}</span>
    </button>
  );
}
