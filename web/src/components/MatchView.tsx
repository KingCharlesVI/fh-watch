import { type MatchEvent, describeEvent, eventTime, periodLabel } from "@fh/shared";
import { Download, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLongDateTime } from "@/lib/format";
import type { FullMatch } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIMELINE_TYPES = new Set<MatchEvent["type"]>(["goal", "card", "penalty_stroke", "shootout_attempt", "note"]);
const CARD_COLOURS = { green: "bg-green-600", yellow: "bg-yellow-400", red: "bg-red-600" } as const;

function Swatch({ color, className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3.5 shrink-0 rounded-sm border border-black/15", !color && "invisible", className)}
      style={color ? { background: color } : undefined}
    />
  );
}

/** Score, periods, statistics and timeline for one match. */
export function MatchView({ data, downloadBase }: { data: FullMatch; downloadBase: string }) {
  const { match, document: doc, summary: s } = data;
  const { home, away } = doc.teams;
  const timeline = s.timeline.filter((e) => TIMELINE_TYPES.has(e.type));

  return (
    <article className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {formatLongDateTime(doc.startedAt)}
        {doc.competition && <> · {doc.competition}</>}
        {doc.venue && <> · {doc.venue}</>}
      </p>

      <Card aria-label="Final score">
        <CardContent className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex min-w-0 items-center gap-2.5 text-base font-semibold sm:text-xl">
            <Swatch color={home.color} className="size-4" />
            <span className="wrap-break-word">{home.name}</span>
          </div>
          <div className="flex gap-2 font-heading text-4xl font-extrabold tabular-nums sm:text-5xl">
            <span>{s.score.home}</span>
            <span className="text-muted-foreground">–</span>
            <span>{s.score.away}</span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2.5 text-right text-base font-semibold sm:text-xl">
            <span className="wrap-break-word">{away.name}</span>
            <Swatch color={away.color} className="size-4" />
          </div>
          {s.shootout && (
            <p className="col-span-3 text-center text-muted-foreground">
              Shootout {s.shootout.home}–{s.shootout.away}
              {s.result.decidedBy === "shootout" && s.result.winner && <> · {doc.teams[s.result.winner].name} win</>}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <div className="space-y-6">
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

          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <Stat label="Penalty corners" home={s.penaltyCorners.home} away={s.penaltyCorners.away} />
                  <Stat
                    label="Penalty strokes (scored)"
                    home={`${s.penaltyStrokes.home.awarded} (${s.penaltyStrokes.home.scored})`}
                    away={`${s.penaltyStrokes.away.awarded} (${s.penaltyStrokes.away.scored})`}
                  />
                  <Stat label="Green cards" home={s.cards.home.green} away={s.cards.away.green} />
                  <Stat label="Yellow cards" home={s.cards.home.yellow} away={s.cards.away.yellow} />
                  <Stat label="Red cards" home={s.cards.home.red} away={s.cards.away.red} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-muted-foreground">No goals, cards or notes recorded.</p>
              ) : (
                <ol className="divide-y">
                  {timeline.map((e) => (
                    <li key={e.seq} className="grid grid-cols-[4.5rem_auto_1fr] items-baseline gap-3 py-2">
                      <span className="text-sm text-muted-foreground tabular-nums">{eventTime(e, doc.settings)}</span>
                      <Swatch color={"team" in e ? doc.teams[e.team].color : undefined} className="size-2.5" />
                      <span className={cn(e.type === "goal" && "font-semibold")}>
                        {e.type === "card" && (
                          <span aria-hidden className={cn("mr-1.5 inline-block h-3 w-2 rounded-xs align-[-1px]", CARD_COLOURS[e.color])} />
                        )}
                        {describeEvent(e, doc.settings)}
                        {"team" in e && <span className="font-normal text-muted-foreground"> · {doc.teams[e.team].name}</span>}
                        {"player" in e && e.player !== undefined && <span className="font-normal text-muted-foreground"> · #{e.player}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Umpires</CardTitle>
            </CardHeader>
            <CardContent>{match.umpires.length ? match.umpires.map((u) => u.name).join(" and ") : "Not recorded"}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="size-4" /> Download
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`${downloadBase}/pdf`}>
                  <FileText /> PDF report
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`${downloadBase}/csv`}>
                  <FileSpreadsheet /> CSV
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`${downloadBase}/json`}>
                  <FileJson /> JSON
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, home, away }: { label: string; home: number | string; away: number | string }) {
  return (
    <TableRow>
      <TableCell className="tabular-nums">{home}</TableCell>
      <TableCell className="text-center text-muted-foreground">{label}</TableCell>
      <TableCell className="text-right tabular-nums">{away}</TableCell>
    </TableRow>
  );
}
