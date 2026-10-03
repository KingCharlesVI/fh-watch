import { componentLevel, showMs } from "@/lib/board";
import { GROUPS } from "@/lib/components";
import { type Day, type Incident, type Note, UPTIME_DAYS, days, uptime } from "@/lib/incidents";
import type { Check } from "@/lib/probe";
import { showDate } from "@/lib/site";
import { LEVEL_LOOK, LEVEL_TEXT, type Level } from "@/lib/status";
import { Checked } from "./Checked";
import { Dot, Panel } from "./ui";

/**
 * The components, grouped, each with its state, how quickly it answered and the
 * last 90 days. Rendered on the server from a live check; the page refreshes
 * itself (see Checked), so there's one rendering path and no state to drift.
 */
export function Board({ checks, notes, open, history }: { checks: Check[]; notes: Note[]; open: Incident[]; history: Incident[] }) {
  return (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <section key={group.name} className="space-y-3">
          <div>
            <h2 className="font-semibold tracking-tight">{group.name}</h2>
            {group.description && <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>}
          </div>
          <Panel className="divide-y">
            {group.components.map((component) => {
              const check = checks.find((c) => c.id === component.id);
              const { level, detail, ms } = componentLevel(component, check, notes, open);
              return (
                <div key={component.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Dot level={level} />
                    <span className="font-medium">{component.name}</span>
                    <span className="ml-auto flex items-center gap-3 text-sm">
                      {level === "operational" && <span className="text-muted-foreground tabular-nums">{showMs(ms)}</span>}
                      <span className={`font-medium ${LEVEL_LOOK[level].text}`}>{LEVEL_TEXT[level].label}</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {component.description}
                    {detail && <> · {detail}</>}
                  </p>
                  <Uptime days={days(history, component.id)} percent={uptime(history, component.id)} />
                </div>
              );
            })}
          </Panel>
        </section>
      ))}
    </div>
  );
}

/** One bar per day, oldest first, with the uptime for the window beside it. */
function Uptime({ days: bars, percent }: { days: Day[]; percent: number }) {
  return (
    <div className="mt-3">
      <div className="flex h-6 items-stretch gap-[2px]" role="img" aria-label={`${format(percent)} uptime over the last ${UPTIME_DAYS} days`}>
        {bars.map((day) => (
          <span
            key={day.date.toISOString()}
            title={`${showDate(day.date)}: ${LEVEL_TEXT[day.level].label}${day.incidents.length ? ` — ${day.incidents.map((i) => i.title).join(", ")}` : ""}`}
            className={`flex-1 rounded-[1px] ${day.level === "operational" ? "bg-ok/35" : LEVEL_LOOK[day.level].bar}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>{UPTIME_DAYS} days ago</span>
        <span className="tabular-nums">{format(percent)} uptime</span>
        <span>today</span>
      </div>
    </div>
  );
}

const format = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/** The headline band at the top of the page. */
export function Banner({ level, checkedAt }: { level: Level; checkedAt: Date }) {
  return (
    <Panel className={`flex flex-wrap items-center gap-x-4 gap-y-2 p-5 ${LEVEL_LOOK[level].band}`}>
      <Dot level={level} size={14} />
      <h1 className="text-xl font-semibold tracking-tight">{LEVEL_TEXT[level].summary}</h1>
      <Checked at={checkedAt.toISOString()} />
    </Panel>
  );
}
