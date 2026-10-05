import { CARD_REASONS } from "@fh/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { formatDistance } from "@/core/fitness";
import { type Period, inPeriod, seasonLabel, umpireSummary } from "@/core/umpire-summary";
import { useMatches } from "@/state/sync";
import { Card, Empty, Row, Screen, Swatch, T, Tabs, Text } from "@/ui/kit";
import { CARD_COLOURS, radius, space, useColors } from "@/ui/theme";

/** The umpire's own numbers, from the matches on this phone, by season. */
export default function SummaryScreen() {
  const { rows, loaded } = useMatches();
  const c = useColors();
  const [period, setPeriod] = useState<Period>("season");
  const today = new Date();
  const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const matches = rows.flatMap((r) =>
    r.match.document && inPeriod(r.match.document.startedAt, period, today) ? [{ document: r.match.document, fitness: r.match.fitness }] : [],
  );
  const s = umpireSummary(matches);
  const totalCards = s.cards.green + s.cards.yellow + s.cards.red;
  const perMatch = (n: number) => (s.matches > 0 ? (n / s.matches).toFixed(1) : "0");
  const mostReasons = Math.max(1, ...s.reasons.map((r) => r.count));

  return (
    <Screen>
      <Tabs
        value={period}
        onChange={setPeriod}
        options={[
          { value: "season", label: seasonLabel(today) },
          { value: "lastSeason", label: seasonLabel(lastYear) },
          { value: "all", label: "All time" },
        ]}
      />
      {loaded && s.matches === 0 ? (
        <Empty icon="stats-chart-outline" title="No matches yet">
          {period === "all" ? "Your numbers appear here once matches come in from your watch." : "No matches on this phone from this season."}
        </Empty>
      ) : (
        <>
          <Row style={{ gap: space.sm }}>
            <Tile label="Matches" value={String(s.matches)} />
            <Tile label="Goals" value={String(s.goals)} detail={`${perMatch(s.goals)} a match`} />
            <Tile label="Cards" value={String(totalCards)} detail={`${perMatch(totalCards)} a match`} />
          </Row>

          <Card title="Cards">
            {(["green", "yellow", "red"] as const).map((color) => (
              <Row key={color} style={{ justifyContent: "space-between" }}>
                <Row style={{ gap: space.sm }}>
                  <Swatch color={CARD_COLOURS[color]} size={14} />
                  <T>{color[0]!.toUpperCase() + color.slice(1)}</T>
                </Row>
                <Text style={styles.number}>{s.cards[color]}</Text>
              </Row>
            ))}
          </Card>

          {s.reasons.length > 0 && (
            <Card title="Why">
              {s.reasons.map((r) => (
                <View key={r.reason ?? "none"} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <T>{r.reason ? CARD_REASONS[r.reason] : "No reason given"}</T>
                    <Text style={styles.number}>{r.count}</Text>
                  </Row>
                  <View style={[styles.track, { backgroundColor: c.subtle }]}>
                    <View style={[styles.bar, { backgroundColor: c.primary, width: `${(r.count / mostReasons) * 100}%` }]} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Card title="Results">
            <Stat label="Home wins" value={s.results.home} />
            <Stat label="Draws" value={s.results.draw} />
            <Stat label="Away wins" value={s.results.away} />
            <Stat label="Went to a shootout" value={s.shootouts} />
          </Card>

          {s.teams.length > 0 && (
            <Card title="Teams you've umpired most">
              {s.teams.map((t) => (
                <Stat key={t.name} label={t.name} value={t.matches} />
              ))}
            </Card>
          )}

          {s.distanceM !== null && (
            <Card title="Running">
              <Stat label="Distance" value={formatDistance(s.distanceM)} />
              <T variant="small">
                From the {s.workouts === 1 ? "match" : `${s.workouts} matches`} your watch recorded a workout for.
              </T>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

/** A headline number. */
function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const c = useColors();
  return (
    <View style={[styles.tile, { borderColor: c.border, backgroundColor: c.card }]}>
      <T variant="small">{label}</T>
      <Text style={styles.tileValue}>{value}</Text>
      {detail && <T variant="small">{detail}</T>}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Row style={{ justifyContent: "space-between", gap: space.md }}>
      <T style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </T>
      <Text style={styles.number}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderWidth: 1, borderRadius: radius.xl, padding: space.md, gap: 2 },
  tileValue: { fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"] },
  number: { fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"] },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
});
