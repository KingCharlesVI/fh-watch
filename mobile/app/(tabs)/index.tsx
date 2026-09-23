import { summarizeMatch } from "@fh/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { errorMessage } from "@/core/api";
import { StatusBadges, formatDate } from "@/features/match-view";
import { sync } from "@/services";
import { type MatchRow, useMatches } from "@/state/sync";
import { Banner, Choice, Empty, Screen } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

type Tab = "new" | "drafts" | "published";

const inTab = (row: MatchRow, tab: Tab) => {
  const m = row.match;
  if (!m.seen) return tab === "new";
  return m.server?.status === "published" ? tab === "published" : tab === "drafts";
};

export default function MatchesScreen() {
  const { rows, loaded } = useMatches();
  const [tab, setTab] = useState<Tab>("new");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counts = { new: 0, drafts: 0, published: 0 };
  for (const r of rows) for (const t of ["new", "drafts", "published"] as const) if (inTab(r, t)) counts[t]++;
  const shown = rows.filter((r) => inTab(r, tab));

  async function refresh() {
    setRefreshing(true);
    try {
      await sync.refresh();
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen refresh={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Choice
        value={tab}
        onChange={setTab}
        options={[
          { value: "new", label: `New (${counts.new})` },
          { value: "drafts", label: `Drafts (${counts.drafts})` },
          { value: "published", label: `Published (${counts.published})` },
        ]}
      />
      {error && <Banner tone="warn" icon="cloud-offline-outline" title="Couldn't refresh">{error}</Banner>}
      {loaded && shown.length === 0 && (
        <Empty icon={tab === "new" ? "watch-outline" : "document-text-outline"} title={tab === "new" ? "Nothing new" : "No matches here"}>
          {tab === "new" ? "Matches from your watch appear here when they arrive. You can also import one from a file in Settings." : "Pull down to check the server."}
        </Empty>
      )}
      <View style={{ gap: space.sm }}>
        {shown.map((r) => (
          <MatchItem key={r.match.id} row={r} />
        ))}
      </View>
    </Screen>
  );
}

function MatchItem({ row }: { row: MatchRow }) {
  const c = useColors();
  const m = row.match;
  const doc = m.document;
  const home = doc?.teams.home.name ?? m.server?.home.name ?? "Home";
  const away = doc?.teams.away.name ?? m.server?.away.name ?? "Away";
  const score = doc ? summarizeMatch(doc).score : m.server ? { home: m.server.home.score, away: m.server.away.score } : null;
  const played = doc?.startedAt ?? m.server?.playedAt ?? m.receivedAt;

  return (
    <Link href={`/match/${m.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.item, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
        <View style={styles.itemTop}>
          <Text style={{ color: c.muted, fontSize: 13 }}>{formatDate(played)}</Text>
          {!m.seen && <View style={[styles.dot, { backgroundColor: c.primary }]} accessibilityLabel="New" />}
        </View>
        <View style={styles.teams}>
          <Text style={[styles.team, { color: c.text }]} numberOfLines={1}>
            {home}
          </Text>
          <Text style={[styles.score, { color: c.text }]}>{score ? `${score.home}–${score.away}` : "–"}</Text>
          <Text style={[styles.team, { color: c.text, textAlign: "right" }]} numberOfLines={1}>
            {away}
          </Text>
        </View>
        <StatusBadges match={m} state={row.state} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  teams: { flexDirection: "row", alignItems: "center", gap: space.sm },
  team: { flex: 1, fontSize: 16, fontWeight: "600" },
  score: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
