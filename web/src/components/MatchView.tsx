import { type MatchEvent, describeEvent, eventTime, periodLabel } from "@fh/shared";
import { Download, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cachedPublic } from "@/lib/api";
import { formatLongDateTime, formatTime } from "@/lib/format";
import type { FullMatch, Items, TeamWithClub } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HeaderPanel } from "./HeaderPanel";
import { ShareButton } from "./ShareButton";

const TIMELINE_TYPES = new Set<MatchEvent["type"]>(["goal", "card", "penalty_corner", "penalty_stroke", "shootout_attempt", "note"]);

type Side = "home" | "away";

/**
 * A match: the scoreboard with the score by period, then the timeline, statistics and details.
 * On a phone they follow one another, with links to jump between them; on a wider screen the
 * timeline sits beside the statistics and details.
 */
export function MatchView({ data, downloadBase }: { data: FullMatch; downloadBase: string }) {
  return (
    <article className="space-y-6">
      <Scoreboard data={data} downloadBase={downloadBase} />
      <nav aria-label="Match sections" className="sticky top-16 z-30 -mx-4 flex gap-2 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        {[
          ["#timeline", "Timeline"],
          ["#stats", "Stats"],
          ["#details", "Details"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-md border bg-card px-4 py-1.5 text-sm font-semibold text-foreground no-underline hover:bg-muted hover:no-underline">
            {label}
          </a>
        ))}
      </nav>
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Timeline data={data} />
        <div className="space-y-6">
          <Statistics data={data} />
          <Details data={data} />
        </div>
      </div>
    </article>
  );
}

/** "Quarter 2", "Half 1", "Period 3". */
function periodName(periods: number, period: number): string {
  return `${periods === 4 ? "Quarter" : periods === 2 ? "Half" : "Period"} ${period}`;
}

/** Up to two letters for a team's badge: "Oxford Hawks M1" → "OH", "Reading M1" → "RE". */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !/\d/.test(w));
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Black or white, whichever reads better on a team's colour. */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = Number.parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.4 ? "#111418" : "#ffffff";
}

function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-32 lg:scroll-mt-24", className)}>
      <h2 id={`${id}-title`} className="section-title mb-4 flex items-center gap-3 text-2xl after:h-px after:flex-1 after:bg-border">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Each linked team's club logo, from the cached list of every team. An unlinked team, a club
 * without a logo, or the list not loading leaves that side on its initials.
 */
async function clubLogos(doc: FullMatch["document"]): Promise<Record<Side, string | null>> {
  const ids = { home: doc.teams.home.teamId, away: doc.teams.away.teamId };
  if (!ids.home && !ids.away) return { home: null, away: null };
  const teams = await cachedPublic<Items<TeamWithClub>>("/v1/teams").catch(() => null);
  const logo = (id: string | null) => (id && teams?.items.find((t) => t.id === id)?.club.logoUrl) || null;
  return { home: logo(ids.home), away: logo(ids.away) };
}

async function Scoreboard({ data, downloadBase }: { data: FullMatch; downloadBase: string }) {
  const { match, document: doc, summary: s } = data;
  const winner = s.result.winner;
  const logos = await clubLogos(doc);
  const team = (side: Side) => {
    const t = doc.teams[side];
    const logo = logos[side];
    return (
      <div className="flex min-w-0 flex-col items-center gap-3 text-center">
        {logo ? (
          // Logos are drawn for a white background, so they get one in dark mode too.
          <img src={logo} alt="" aria-hidden className="size-14 rounded-lg bg-white object-contain p-1.5 ring-1 ring-border sm:size-16" />
        ) : (
          <span
            aria-hidden
            className="flex size-14 items-center justify-center rounded-lg font-heading text-lg font-extrabold ring-1 ring-border font-stretch-85% sm:size-16 sm:text-xl"
            style={{ background: t.color, color: textOn(t.color) }}
          >
            {initials(t.name)}
          </span>
        )}
        <span className={cn("font-heading text-base leading-tight font-bold wrap-break-word font-stretch-90% sm:text-2xl", winner && winner !== side && "text-muted-foreground")}>
          {t.name}
        </span>
      </div>
    );
  };
  const where = [formatLongDateTime(doc.startedAt), doc.venue].filter(Boolean).join(" · ");
  return (
    <HeaderPanel label="Score" className="px-4 pt-7 pb-5 sm:px-8 sm:pt-9 sm:pb-6">
      <div className="text-center">
        {doc.competition && <p className="section-title text-sm text-primary">{doc.competition}</p>}
        <p className="mt-2 text-sm text-muted-foreground">{where}</p>
      </div>

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
        {team("home")}
        <div className="flex flex-col items-center gap-2">
          <div className="font-score flex items-center gap-3 text-8xl sm:gap-5 sm:text-[9.5rem]">
            <span className={cn(winner === "away" && "text-muted-foreground/70")}>{s.score.home}</span>
            <span className="text-5xl text-muted-foreground/50 sm:text-7xl">–</span>
            <span className={cn(winner === "home" && "text-muted-foreground/70")}>{s.score.away}</span>
          </div>
          {/* Stamped on, like the umpire's card. */}
          <span className="section-title -rotate-2 rounded-sm bg-foreground px-2.5 py-1 text-sm text-background">Full time</span>
        </div>
        {team("away")}
      </div>

      {s.shootout && (
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Shootout {s.shootout.home}–{s.shootout.away}
          {s.result.decidedBy === "shootout" && s.result.winner && <> · {doc.teams[s.result.winner].name} win</>}
        </p>
      )}

      <ol aria-label="Score by period" className="mx-auto mt-6 grid max-w-xl gap-2" style={{ gridTemplateColumns: `repeat(${s.periodScores.length}, minmax(0, 1fr))` }}>
        {s.periodScores.map((p) => (
          <li key={p.period} className="rounded-md border bg-background py-2 text-center">
            <span className="block text-xs font-semibold text-muted-foreground">{periodLabel(doc.settings.periods, p.period)}</span>
            <span className="font-score text-2xl">
              {p.home}–{p.away}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t pt-5">
        {match.status === "published" && match.shareUrl && (
          <ShareButton variant="default" url={match.shareUrl} title={`${doc.teams.home.name} ${s.score.home}–${s.score.away} ${doc.teams.away.name}`} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download /> Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem asChild>
              <a href={`${downloadBase}/pdf`}>
                <FileText /> Match report (PDF)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`${downloadBase}/csv`}>
                <FileSpreadsheet /> Events (CSV)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`${downloadBase}/json`}>
                <FileJson /> Match data (JSON)
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </HeaderPanel>
  );
}

/** Hockey's card shapes: a green triangle, a yellow rectangle, a red circle. */
function Marker({ event: e }: { event: MatchEvent }) {
  if (e.type === "goal") return <span className="size-3 rounded-full bg-foreground" />;
  if (e.type === "card") {
    if (e.color === "green") return <span className="h-3.5 w-4 bg-green-600 [clip-path:polygon(50%_0,100%_100%,0_100%)]" />;
    if (e.color === "yellow") return <span className="h-4 w-3 rounded-xs bg-yellow-400" />;
    return <span className="size-3.5 rounded-full bg-red-600" />;
  }
  if (e.type === "penalty_corner") return <span className="text-[0.65rem] font-bold text-muted-foreground">PC</span>;
  if (e.type === "penalty_stroke") return <span className="text-[0.65rem] font-bold text-muted-foreground">PS</span>;
  if (e.type === "shootout_attempt") return <span className={cn("size-3 rounded-full", e.scored ? "bg-foreground" : "border-2 border-muted-foreground")} />;
  return null;
}

function eventTitle(e: MatchEvent): string {
  switch (e.type) {
    case "goal":
      return e.method === "pc" ? "Goal from a penalty corner" : e.method === "ps" ? "Goal from a penalty stroke" : "Goal";
    case "shootout_attempt":
      return e.forfeit ? "Forfeited" : e.scored ? "Scored" : "Missed";
    default:
      return describeEvent(e, { periods: 0 });
  }
}

/** One card per event, under a heading per period, edged in the team's colour. */
function Timeline({ data }: { data: FullMatch }) {
  const { document: doc, summary: s } = data;
  // A scored stroke shows as its goal ("Goal from a penalty stroke"), so only missed strokes are listed.
  const events = s.timeline.filter((e) => TIMELINE_TYPES.has(e.type) && !(e.type === "penalty_stroke" && e.scored));
  const inShootout = (e: MatchEvent) => e.type === "shootout_attempt" || (e.type === "card" && e.shootout === true);
  const sectionOf = (e: MatchEvent) =>
    inShootout(e) ? "Shootout" : "period" in e && e.period !== undefined ? periodName(doc.settings.periods, e.period) : "Notes";

  const sections: { title: string; events: MatchEvent[] }[] = [];
  for (const e of events) {
    const title = sectionOf(e);
    const last = sections.at(-1);
    if (last?.title === title) last.events.push(e);
    else sections.push({ title, events: [e] });
  }

  return (
    <Section id="timeline" title="Timeline">
      {sections.length === 0 ? (
        <p className="rounded-lg border bg-card px-5 py-8 text-center text-muted-foreground">No goals, cards or notes recorded.</p>
      ) : (
        <div className="space-y-5">
          {sections.map((sec) => (
            <div key={sec.title}>
              <h3 className="section-title mb-2 text-base text-muted-foreground">{sec.title}</h3>
              <ol className="space-y-2">
                {sec.events.map((e) => {
                  const side = "team" in e ? (e.team as Side) : null;
                  const t = side ? doc.teams[side] : null;
                  const time = e.type === "shootout_attempt" ? `R${e.round}` : inShootout(e) ? "" : eventTime(e, doc.settings).split(" ").at(-1);
                  const player = "player" in e && e.player !== undefined ? `#${e.player}` : null;
                  const who = [t?.name, player].filter(Boolean).join(" · ");
                  return (
                    <li
                      key={e.seq}
                      className="flex items-center gap-3 rounded-md border border-l-[5px] bg-card px-4 py-3"
                      style={{ borderLeftColor: t?.color ?? "var(--border)" } as CSSProperties}
                    >
                      {e.type !== "note" && (
                        <>
                          <span className="w-12 shrink-0 font-mono text-sm font-semibold text-muted-foreground">{time}</span>
                          <span aria-hidden className="flex w-5 shrink-0 justify-center">
                            <Marker event={e} />
                          </span>
                        </>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", e.type === "note" ? "text-muted-foreground" : "font-semibold", e.type === "shootout_attempt" && !e.scored && "text-muted-foreground")}>
                          {eventTitle(e)}
                        </span>
                        {who && <span className="block text-sm text-muted-foreground">{who}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Each statistic recorded, as the two teams' numbers either side of bars in their colours. */
function Statistics({ data }: { data: FullMatch }) {
  const { document: doc, summary: s } = data;
  const rows: { label: string; home: number; away: number; text?: [string, string] }[] = [];
  // Corners and strokes aren't recorded any more; only older matches have them.
  if (s.penaltyCorners.home + s.penaltyCorners.away > 0) rows.push({ label: "Penalty corners", home: s.penaltyCorners.home, away: s.penaltyCorners.away });
  if (s.penaltyStrokes.home.awarded + s.penaltyStrokes.away.awarded > 0) {
    rows.push({
      label: "Penalty strokes (scored)",
      home: s.penaltyStrokes.home.awarded,
      away: s.penaltyStrokes.away.awarded,
      text: [`${s.penaltyStrokes.home.awarded} (${s.penaltyStrokes.home.scored})`, `${s.penaltyStrokes.away.awarded} (${s.penaltyStrokes.away.scored})`],
    });
  }
  for (const [color, label] of [
    ["green", "Green cards"],
    ["yellow", "Yellow cards"],
    ["red", "Red cards"],
  ] as const) {
    if (s.cards.home[color] + s.cards.away[color] > 0) rows.push({ label, home: s.cards.home[color], away: s.cards.away[color] });
  }

  return (
    <Section id="stats" title="Stats">
      <div className="rounded-lg border bg-card px-5 py-4">
        <div className="mb-2 flex justify-between gap-4 text-xs font-semibold text-muted-foreground">
          <span className="truncate">{doc.teams.home.name}</span>
          <span className="truncate text-right">{doc.teams.away.name}</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">No cards given.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const max = Math.max(r.home, r.away, 1);
              return (
                <li key={r.label} className="py-3">
                  <div className="grid grid-cols-[3rem_1fr_3rem] items-baseline text-sm">
                    <span className="font-score text-xl">{r.text?.[0] ?? r.home}</span>
                    <span className="text-center text-muted-foreground">{r.label}</span>
                    <span className="font-score text-right text-xl">{r.text?.[1] ?? r.away}</span>
                  </div>
                  <div aria-hidden className="mt-2 flex h-1.5 gap-1">
                    <span className="flex flex-1 justify-end overflow-hidden rounded-full bg-muted">
                      <span className="rounded-full" style={{ width: `${(r.home / max) * 100}%`, background: doc.teams.home.color }} />
                    </span>
                    <span className="flex flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="rounded-full" style={{ width: `${(r.away / max) * 100}%`, background: doc.teams.away.color }} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}

function Details({ data }: { data: FullMatch }) {
  const { match, document: doc } = data;
  const { periods, periodLengthSec } = doc.settings;
  const rows: [string, string][] = [
    ["Umpires", match.umpires.length ? match.umpires.map((u) => u.name).join(" and ") : "Not recorded"],
    ...(doc.venue ? [["Venue", doc.venue] as [string, string]] : []),
    ...(doc.competition ? [["Competition", doc.competition] as [string, string]] : []),
    ["Format", `${periods} × ${Math.round(periodLengthSec / 60)} min`],
    ["Started", formatTime(doc.startedAt)],
    ...(doc.endedAt ? [["Final whistle", formatTime(doc.endedAt)] as [string, string]] : []),
  ];
  return (
    <Section id="details" title="Details">
      <dl className="divide-y rounded-lg border bg-card px-5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
