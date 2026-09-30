import { type MatchDocument, type MatchEvent, type MatchSummary, describeEvent, eventTime, periodLabel } from "@fh/shared";
import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { ONLINE } from "@/config";
import { type Fitness, fitnessStats } from "@/core/fitness";
import type { LocalMatch } from "@/core/store";
import type { SyncState } from "@/core/sync";
import { Badge, Card, Swatch, T, Text } from "@/ui/kit";
import { CARD_COLOURS, space, useColors } from "@/ui/theme";

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

export function ScoreCard({ doc, summary }: { doc: MatchDocument; summary: MatchSummary }) {
  const c = useColors();
  return (
    <Card style={{ gap: space.sm }}>
      <T variant="small">
        {[formatDateTime(doc.startedAt), doc.competition, doc.venue].filter(Boolean).join(" · ")}
      </T>
      <View style={styles.score}>
        <TeamName name={doc.teams.home.name} color={doc.teams.home.color} />
        <Text style={[styles.scoreText, { color: c.text }]} accessibilityLabel={`${summary.score.home} to ${summary.score.away}`}>
          {summary.score.home}–{summary.score.away}
        </Text>
        <TeamName name={doc.teams.away.name} color={doc.teams.away.color} right />
      </View>
      {summary.shootout && (
        <T variant="muted" style={{ textAlign: "center" }}>
          Shootout {summary.shootout.home}–{summary.shootout.away}
          {summary.result.decidedBy === "shootout" && summary.result.winner ? ` · ${doc.teams[summary.result.winner].name} win` : ""}
        </T>
      )}
    </Card>
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

export function PeriodTable({ doc, summary }: { doc: MatchDocument; summary: MatchSummary }) {
  const c = useColors();
  const cell = (text: string | number, bold = false, key?: string) => (
    <Text key={key} style={[styles.cell, { color: c.text, fontWeight: bold ? "700" : "400" }]}>
      {text}
    </Text>
  );
  return (
    <Card title="Score by period">
      <View style={styles.tableRow}>
        <Text style={[styles.teamCell, { color: c.muted }]}>Team</Text>
        {summary.periodScores.map((p) => (
          <Text key={p.period} style={[styles.cell, { color: c.muted }]}>
            {periodLabel(doc.settings.periods, p.period)}
          </Text>
        ))}
        <Text style={[styles.cell, { color: c.muted }]}>Tot</Text>
      </View>
      {(["home", "away"] as const).map((side) => (
        <View key={side} style={[styles.tableRow, { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[styles.teamCell, { color: c.text }]} numberOfLines={1}>
            {doc.teams[side].name}
          </Text>
          {summary.periodScores.map((p) => cell(p[side], false, String(p.period)))}
          {cell(summary.score[side], true)}
        </View>
      ))}
    </Card>
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
      {s?.status === "draft" && <Badge label={s.autoPublishAt ? `Draft · auto ${formatDateTime(s.autoPublishAt)}` : "Draft"} />}
      {unlinked && <Badge label="Link teams" tone="warn" />}
    </View>
  );
}

const styles = StyleSheet.create({
  score: { flexDirection: "row", alignItems: "center", gap: space.md },
  scoreText: { fontSize: 40, fontWeight: "800", fontVariant: ["tabular-nums"] },
  team: { flex: 1, gap: 6 },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  teamCell: { flex: 1, fontWeight: "500" },
  cell: { width: 36, textAlign: "center", fontVariant: ["tabular-nums"] },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  statValue: { width: 56, fontVariant: ["tabular-nums"] },
  event: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 8 },
  eventTime: { width: 64, fontVariant: ["tabular-nums"], fontSize: 13 },
});
