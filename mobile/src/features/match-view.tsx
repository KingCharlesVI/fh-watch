import { type MatchDocument, type MatchEvent, type MatchSummary, describeEvent, eventTime, periodLabel } from "@fh/shared";
import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { ONLINE } from "@/config";
import { type Fitness, fitnessStats } from "@/core/fitness";
import type { LocalMatch } from "@/core/store";
import type { SyncState } from "@/core/sync";
import { Badge, Card, HeaderPanel, Score, Swatch, T, Text } from "@/ui/kit";
import { CARD_COLOURS, FONT_MONO, FONT_SECTION, space, useColors } from "@/ui/theme";

// UK time, where the matches are played.
const dateFmt = safeFormat({ weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const dateTimeFmt = safeFormat({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

function safeFormat(options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-GB", options);
  } catch {
    const { timeZone: _ignored, ...rest } = options;
    return new Intl.DateTimeFormat("en-GB", rest);
  }
}

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

/**
 * The scoreboard, like the website's match page: the competition and where, the teams either
 * side of a big condensed score with the loser's number dimmed, "Full time" stamped under it,
 * and the score by period in small boxes along the bottom.
 */
export function ScoreCard({ doc, summary }: { doc: MatchDocument; summary: MatchSummary }) {
  const c = useColors();
  const winner = summary.result.winner;
  const dim = (side: "home" | "away") => (winner && winner !== side ? c.muted : c.text);
  return (
    <HeaderPanel style={{ alignItems: "stretch", gap: space.lg, paddingTop: space.xl }}>
      <View style={{ alignItems: "center", gap: 6 }}>
        {doc.competition && (
          <Text style={{ fontFamily: FONT_SECTION, fontSize: 14, textTransform: "uppercase", letterSpacing: 0.2, color: c.primary, textAlign: "center" }}>{doc.competition}</Text>
        )}
        <T variant="small" style={{ textAlign: "center" }}>
          {[formatDateTime(doc.startedAt), doc.venue].filter(Boolean).join(" · ")}
        </T>
      </View>
      <View style={styles.score}>
        <TeamName name={doc.teams.home.name} color={doc.teams.home.color} />
        <View style={{ alignItems: "center", gap: space.sm }}>
          <View style={styles.scoreDigits} accessible accessibilityLabel={`${summary.score.home} to ${summary.score.away}`}>
            <Score size={64} color={dim("home")}>{summary.score.home}</Score>
            <Score size={34} color={c.border}>–</Score>
            <Score size={64} color={dim("away")}>{summary.score.away}</Score>
          </View>
          {/* Stamped on, like the umpire's card. */}
          <Text style={[styles.stamp, { backgroundColor: c.text, color: c.card }]}>Full time</Text>
        </View>
        <TeamName name={doc.teams.away.name} color={doc.teams.away.color} right />
      </View>
      {summary.shootout && (
        <T variant="muted" style={{ textAlign: "center" }}>
          Shootout {summary.shootout.home}–{summary.shootout.away}
          {summary.result.decidedBy === "shootout" && summary.result.winner ? ` · ${doc.teams[summary.result.winner].name} win` : ""}
        </T>
      )}
      {summary.periodScores.length > 1 && (
        <View style={styles.periods} accessibilityLabel="Score by period">
          {summary.periodScores.map((p) => (
            <View key={p.period} style={[styles.period, { borderColor: c.border, backgroundColor: c.background }]}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: c.muted }}>{periodLabel(doc.settings.periods, p.period)}</Text>
              <Score size={20}>
                {p.home}–{p.away}
              </Score>
            </View>
          ))}
        </View>
      )}
    </HeaderPanel>
  );
}

function TeamName({ name, color, right }: { name: string; color: string; right?: boolean }) {
  return (
    <View style={[styles.team, right && { alignItems: "flex-end" }]}>
      <Swatch color={color} size={14} />
      <T variant="heading" style={right ? { textAlign: "right" } : undefined}>
        {name}
      </T>
    </View>
  );
}

export function StatsCard({ summary }: { summary: MatchSummary }) {
  const c = useColors();
  const { penaltyCorners: pcs, penaltyStrokes: ps } = summary;
  const rows: [string, string | number, string | number][] = [
    // Corners and strokes aren't recorded any more; only older matches have them.
    ...(pcs.home + pcs.away > 0 ? [["Penalty corners", pcs.home, pcs.away] as [string, number, number]] : []),
    ...(ps.home.awarded + ps.away.awarded > 0
      ? [["Strokes (scored)", `${ps.home.awarded} (${ps.home.scored})`, `${ps.away.awarded} (${ps.away.scored})`] as [string, string, string]]
      : []),
    ["Green cards", summary.cards.home.green, summary.cards.away.green],
    ["Yellow cards", summary.cards.home.yellow, summary.cards.away.yellow],
    ["Red cards", summary.cards.home.red, summary.cards.away.red],
  ];
  return (
    <Card title="Statistics">
      {rows.map(([label, h, a], i) => (
        <View key={label} style={[styles.statRow, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[styles.statValue, { color: c.text }]}>{h}</Text>
          <Text style={{ color: c.muted, flex: 1, textAlign: "center" }}>{label}</Text>
          <Text style={[styles.statValue, { color: c.text, textAlign: "right" }]}>{a}</Text>
        </View>
      ))}
    </Card>
  );
}

/** The umpire's workout during the match, from the watch. Only ever on this phone. */
export function FitnessCard({ fitness, footer }: { fitness: Fitness; footer?: ReactNode }) {
  const c = useColors();
  const stats = fitnessStats(fitness);
  return (
    <Card title="Your workout">
      {fitness.heartRateSamples.length > 1 && <HeartRateChart samples={fitness.heartRateSamples} />}
      {stats.map(([label, value], i) => (
        <View key={label} style={[styles.statRow, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={{ color: c.muted, flex: 1 }}>{label}</Text>
          <Text style={{ color: c.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
        </View>
      ))}
      {stats.length === 0 && <T variant="small">The watch didn&apos;t record anything for this match.</T>}
      {footer}
    </Card>
  );
}

/** Heart rate through the match, scaled between its lowest and highest. */
function HeartRateChart({ samples }: { samples: [number, number][] }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const height = 72;
  const end = samples[samples.length - 1]![0] || 1;
  const bpm = samples.map((s) => s[1]);
  const lo = Math.min(...bpm);
  const span = Math.max(Math.max(...bpm) - lo, 1);
  const points = samples.map(([t, b]) => `${((t / end) * width).toFixed(1)},${(height - 2 - ((b - lo) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height, marginBottom: space.sm }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Polyline points={points} fill="none" stroke={c.danger} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

const TIMELINE: MatchEvent["type"][] = ["goal", "card", "penalty_stroke", "shootout_attempt", "note"];

export function Timeline({ doc, summary }: { doc: MatchDocument; summary: MatchSummary }) {
  const c = useColors();
  const events = summary.timeline.filter((e) => TIMELINE.includes(e.type));
  return (
    <Card title="Timeline">
      {events.length === 0 && <T variant="muted">No goals, cards or notes recorded.</T>}
      {events.map((e, i) => (
        <View key={e.seq} style={[styles.event, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[styles.eventTime, { color: c.muted }]}>{eventTime(e, doc.settings)}</Text>
          {"team" in e ? <Swatch color={doc.teams[e.team].color} size={10} /> : <View style={{ width: 10 }} />}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {e.type === "card" && <View style={{ width: 8, height: 12, borderRadius: 2, backgroundColor: CARD_COLOURS[e.color] }} />}
            <Text style={{ color: c.text, fontWeight: e.type === "goal" ? "700" : "400" }}>{describeEvent(e, doc.settings)}</Text>
            {"team" in e && <Text style={{ color: c.muted }}>{doc.teams[e.team].name}</Text>}
            {"player" in e && e.player !== undefined && <Text style={{ color: c.muted }}>#{e.player}</Text>}
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Where a match stands, for lists and the match screen. Alpha has no server, so nothing to say. */
export function StatusBadges({ match, state }: { match: LocalMatch; state: SyncState }) {
  if (!ONLINE) return null;
  const s = match.server;
  const doc = match.document;
  const unlinked = doc ? doc.teams.home.teamId === null || doc.teams.away.teamId === null : s ? s.home.teamId === null || s.away.teamId === null : false;
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      {state === "local" && <Badge label={match.baseRevision === null ? "Not uploaded" : "Changes not uploaded"} icon="phone-portrait-outline" />}
      {state === "pending" && <Badge label="Waiting to upload" icon="cloud-upload-outline" />}
      {state === "uploading" && <Badge label="Uploading" icon="sync-outline" />}
      {state === "conflict" && <Badge label="Changed elsewhere" tone="danger" icon="git-compare-outline" />}
      {state === "error" && <Badge label="Upload refused" tone="danger" icon="alert-circle-outline" />}
      {s?.status === "published" && <Badge label="Published" tone="primary" />}
      {s?.status === "draft" && <Badge label="Draft" />}
      {unlinked && <Badge label="Link teams" tone="warn" />}
    </View>
  );
}

const styles = StyleSheet.create({
  score: { flexDirection: "row", alignItems: "center", gap: space.md },
  scoreDigits: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stamp: { fontFamily: FONT_SECTION, fontSize: 13, textTransform: "uppercase", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 3, overflow: "hidden", transform: [{ rotate: "-2deg" }] },
  team: { flex: 1, gap: 6 },
  periods: { flexDirection: "row", gap: space.sm },
  period: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  statValue: { width: 56, fontVariant: ["tabular-nums"] },
  event: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 8 },
  eventTime: { width: 64, fontFamily: FONT_MONO, fontWeight: "500", fontSize: 12 },
});
