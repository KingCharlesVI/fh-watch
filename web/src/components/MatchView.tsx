import { type MatchEvent, describeEvent, eventTime, periodLabel } from "@fh/shared";
import { Download, FileJson, FileSpreadsheet, FileText, MapPin, Trophy, Users } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLongDateTime } from "@/lib/format";
import type { FullMatch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ShareButton } from "./ShareButton";

const TIMELINE_TYPES = new Set<MatchEvent["type"]>(["goal", "card", "penalty_stroke", "shootout_attempt", "note"]);
const CARD_COLOURS = { green: "bg-green-600", yellow: "bg-yellow-400", red: "bg-red-600" } as const;

type Side = "home" | "away";

/** A match: the scoreboard, then the timeline beside the scores by period and the statistics. */
export function MatchView({ data, downloadBase }: { data: FullMatch; downloadBase: string }) {
  const { match, document: doc } = data;
  return (
    <article className="space-y-6">
      <Scoreboard data={data} downloadBase={downloadBase} />
      <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Timeline data={data} />
        <div className="space-y-6">
          <PeriodScores data={data} />
          <Statistics data={data} />
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail icon={Users} label="Umpires">
                {match.umpires.length ? match.umpires.map((u) => u.name).join(" and ") : "Not recorded"}
              </Detail>
              {doc.venue && (
                <Detail icon={MapPin} label="Venue">
                  {doc.venue}
                </Detail>
              )}
              {doc.competition && (
                <Detail icon={Trophy} label="Competition">
                  {doc.competition}
                </Detail>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </article>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Users; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-muted-foreground">{label}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

function Scoreboard({ data, downloadBase }: { data: FullMatch; downloadBase: string }) {
  const { match, document: doc, summary: s } = data;
  const { home, away } = doc.teams;
  const winner = s.result.winner;
  const team = (side: Side) => {
    const t = doc.teams[side];
    return (
      <div className={cn("flex min-w-0 flex-col gap-2", side === "home" ? "items-end text-right" : "items-start text-left")}>
        <span aria-hidden className="h-1.5 w-10 rounded-full border border-black/10" style={{ background: t.color }} />
        <span className={cn("font-heading text-lg leading-tight font-semibold wrap-break-word sm:text-2xl", winner && winner !== side && "text-muted-foreground")}>
          {t.name}
        </span>
      </div>
    );
  };
  return (
    <Card className="overflow-hidden py-0">
      <div className="border-b bg-muted/40 px-4 py-2 text-center text-sm text-muted-foreground">
        {[formatLongDateTime(doc.startedAt), doc.competition].filter(Boolean).join(" · ")}
      </div>
      <CardContent className="py-6 sm:py-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
          {team("home")}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3 font-heading text-5xl font-extrabold tabular-nums sm:text-6xl">
              <span>{s.score.home}</span>
              <span className="text-muted-foreground/60">–</span>
              <span>{s.score.away}</span>
            </div>
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Full time</span>
          </div>
          {team("away")}
        </div>
        {s.shootout && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Shootout {s.shootout.home}–{s.shootout.away}
            {s.result.decidedBy === "shootout" && s.result.winner && <> · {doc.teams[s.result.winner].name} win</>}
          </p>
        )}
      </CardContent>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t px-4 py-3">
        {match.status === "published" && match.shareUrl && <ShareButton url={match.shareUrl} title={`${home.name} ${s.score.home}–${s.score.away} ${away.name}`} />}
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
    </Card>
  );
}

/** Events in two columns, home on the left and away on the right, with the time between and a divider per period. */
function Timeline({ data }: { data: FullMatch }) {
  const { document: doc, summary: s } = data;
  const events = s.timeline.filter((e) => TIMELINE_TYPES.has(e.type));
  const inShootout = (e: MatchEvent) => e.type === "shootout_attempt" || (e.type === "card" && e.shootout === true);
  const sectionOf = (e: MatchEvent) =>
    inShootout(e) ? "Shootout" : "period" in e && e.period !== undefined ? periodLabel(doc.settings.periods, e.period) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground">No goals, cards or notes recorded.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-[1fr_3rem_1fr] gap-2 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_4rem_1fr]">
              <span className="truncate text-right">{doc.teams.home.name}</span>
              <span />
              <span className="truncate">{doc.teams.away.name}</span>
            </div>
            <ol className="space-y-1">
              {events.map((e, i) => {
                const section = sectionOf(e);
                const newSection = section && section !== (i > 0 ? sectionOf(events[i - 1]!) : "");
                const side = "team" in e ? (e.team as Side) : null;
                // A shootout card has no time of its own: it's under the Shootout divider.
                const time = e.type === "shootout_attempt" ? `R${e.round}` : inShootout(e) ? "" : eventTime(e, doc.settings).split(" ").at(-1);
                return (
                  <Fragment key={e.seq}>
                    {newSection && (
                      <li aria-hidden className="flex items-center gap-3 pt-3 pb-1 text-xs font-medium text-muted-foreground first:pt-0">
                        <span className="h-px flex-1 bg-border" />
                        {section}
                        <span className="h-px flex-1 bg-border" />
                      </li>
                    )}
                    {side === null ? (
                      <li className="rounded-md bg-muted/60 px-3 py-2 text-center text-sm text-muted-foreground">
                        {time && <span className="tabular-nums">{time} · </span>}
                        {describeEvent(e, doc.settings)}
                      </li>
                    ) : (
                      <li className="grid grid-cols-[1fr_3rem_1fr] items-center gap-2 py-1 sm:grid-cols-[1fr_4rem_1fr]">
                        <span className="text-right">{side === "home" && <EventLabel event={e} align="right" />}</span>
                        <span className="text-center text-sm text-muted-foreground tabular-nums">{time}</span>
                        <span>{side === "away" && <EventLabel event={e} align="left" />}</span>
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The marker (a card, a ball) stays beside the words, which wrap on a narrow screen. */
function EventLabel({ event: e, align }: { event: MatchEvent; align: "left" | "right" }) {
  const player = "player" in e && e.player !== undefined ? `#${e.player}` : null;
  // The round is in the middle column already.
  const text = e.type === "shootout_attempt" ? (e.forfeit ? "Forfeited" : e.scored ? "Scored" : "Missed") : describeEvent(e, { periods: 0 });
  return (
    <span className={cn("inline-flex items-start gap-1.5 text-sm", align === "right" && "flex-row-reverse text-right")}>
      {e.type === "card" && <span aria-hidden className={cn("mt-[3px] inline-block h-3.5 w-2.5 shrink-0 rounded-xs", CARD_COLOURS[e.color])} />}
      {e.type === "goal" && <span aria-hidden className="mt-[5px] inline-block size-2.5 shrink-0 rounded-full bg-foreground" />}
      <span>
        <span className={cn(e.type === "goal" && "font-semibold", e.type === "shootout_attempt" && !e.scored && "text-muted-foreground")}>{text}</span>
        {player && <span className="text-muted-foreground"> {player}</span>}
      </span>
    </span>
  );
}

function PeriodScores({ data }: { data: FullMatch }) {
  const { document: doc, summary: s } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Score by period</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              {s.periodScores.map((p) => (
                <TableHead key={p.period} className="text-center">
                  {periodLabel(doc.settings.periods, p.period)}
                </TableHead>
              ))}
              <TableHead className="text-center">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(["home", "away"] as const).map((side) => (
              <TableRow key={side}>
                <TableCell className="font-medium whitespace-normal">{doc.teams[side].name}</TableCell>
                {s.periodScores.map((p) => (
                  <TableCell key={p.period} className="text-center tabular-nums">
                    {p[side]}
                  </TableCell>
                ))}
                <TableCell className="text-center font-bold tabular-nums">{s.score[side]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Each statistic as the two teams' numbers either side of a bar split between them, in their colours. */
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
  rows.push({ label: "Green cards", home: s.cards.home.green, away: s.cards.away.green });
  rows.push({ label: "Yellow cards", home: s.cards.home.yellow, away: s.cards.away.yellow });
  rows.push({ label: "Red cards", home: s.cards.home.red, away: s.cards.away.red });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const total = r.home + r.away;
          const homeShare = total === 0 ? 50 : (r.home / total) * 100;
          return (
            <div key={r.label} className="space-y-1.5">
              <div className="grid grid-cols-[3rem_1fr_3rem] items-baseline text-sm">
                <span className="font-semibold tabular-nums">{r.text?.[0] ?? r.home}</span>
                <span className="text-center text-muted-foreground">{r.label}</span>
                <span className="text-right font-semibold tabular-nums">{r.text?.[1] ?? r.away}</span>
              </div>
              <div className="flex h-1.5 gap-1 overflow-hidden rounded-full" aria-hidden>
                {total === 0 ? (
                  <span className="flex-1 rounded-full bg-muted" />
                ) : (
                  <>
                    <span className="rounded-full" style={{ width: `${homeShare}%`, background: doc.teams.home.color }} />
                    <span className="flex-1 rounded-full" style={{ background: doc.teams.away.color }} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
