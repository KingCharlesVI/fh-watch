import { summarizeMatch } from "@fh/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/api";
import { overdueUploads } from "@/core/upload-reminders";
import { StatusBadges, formatDate } from "@/features/match-view";
import { UpdateNotice } from "@/features/update-notice";
import { ONLINE } from "@/config";
import { sync } from "@/services";
import { drainWatchInbox } from "@/services/watch";
import { type MatchRow, useMatches } from "@/state/sync";
import { useUpdates } from "@/state/updates";
import { Banner, Button, Empty, Screen, Tabs, Text } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

type Tab = "new" | "saved" | "drafts" | "published";

/** Alpha has no server, so opened matches are simply saved; beta splits them by what the website shows. */
const TABS: Tab[] = ONLINE ? ["new", "drafts", "published"] : ["new", "saved"];
const TAB_NAMES: Record<Tab, string> = { new: "New", saved: "Saved", drafts: "Drafts", published: "Published" };

const inTab = (row: MatchRow, tab: Tab) => {
  const m = row.match;
  if (!m.seen) return tab === "new";
  if (!ONLINE) return tab === "saved";
  return m.server?.status === "published" ? tab === "published" : tab === "drafts";
};

export default function MatchesScreen() {
  const { rows, loaded } = useMatches();
  const c = useColors();
  const [tab, setTab] = useState<Tab>("new");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { update, dismissed } = useUpdates();
  const counts = { new: 0, saved: 0, drafts: 0, published: 0 };
  for (const r of rows) for (const t of TABS) if (inTab(r, t)) counts[t]++;
  const shown = rows.filter((r) => inTab(r, tab));

  async function refresh() {
    setRefreshing(true);
    try {
      // Alpha: check for matches from the watch. Beta: fetch the umpire's matches from the server too.
      await (ONLINE ? Promise.all([sync.refresh(), drainWatchInbox()]) : drainWatchInbox());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen refresh={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {update && dismissed !== update.release.tag && <UpdateNotice update={update} later />}
      <Tabs value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t, label: `${TAB_NAMES[t]} (${counts[t]})` }))} />
      {error && <Banner tone="warn" icon="cloud-offline-outline" title="Couldn't refresh">{error}</Banner>}
      {ONLINE && <UploadReminder rows={rows} />}
      {loaded && shown.length === 0 && (
        <Empty icon={tab === "new" ? "watch-outline" : "document-text-outline"} title={tab === "new" ? "Nothing new" : "No matches here"}>
          {tab === "new"
            ? "Matches from your watch appear here when they arrive. You can also import one from a file in Settings."
            : ONLINE
              ? "Pull down to check the server."
              : "Matches you've opened are kept here, on this phone."}
        </Empty>
      )}
      {shown.length > 0 && (
        // One bordered list with dividers, like the website's match lists.
        <View style={[styles.list, { borderColor: c.border, backgroundColor: c.card }]}>
          {shown.map((r, i) => (
            <MatchItem key={r.match.id} row={r} first={i === 0} />
          ))}
        </View>
      )}
    </Screen>
  );
}

/**
 * Nothing publishes by itself, so matches from the watch still not uploaded two hours
 * after they arrived get a reminder here (and a notification, if they're on).
 */
function UploadReminder({ rows }: { rows: MatchRow[] }) {
  const [busy, setBusy] = useState(false);
  const overdue = overdueUploads(
    rows.map((r) => r.match),
    Date.now(),
  );
  if (overdue.length === 0) return null;
  const one = overdue.length === 1 ? overdue[0]!.document!.teams : null;
  return (
    <Banner
      tone="warn"
      icon="cloud-upload-outline"
      title={one ? `${one.home.name} v ${one.away.name} isn't uploaded` : `${overdue.length} matches aren't uploaded`}
      action={
        <Button
          small
          title={one ? "Upload" : "Upload all"}
          icon="cloud-upload-outline"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              for (const m of overdue) await sync.requestUpload(m.id);
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      {one ? "It came from your watch over 2 hours ago." : "They came from your watch over 2 hours ago."} Upload to put {one ? "it" : "them"} on the website as a draft, ready to publish.
    </Banner>
  );
}

function MatchItem({ row, first }: { row: MatchRow; first: boolean }) {
  const c = useColors();
  const m = row.match;
  const doc = m.document;
  const home = doc?.teams.home.name ?? m.server?.home.name ?? "Home";
  const away = doc?.teams.away.name ?? m.server?.away.name ?? "Away";
  const score = doc ? summarizeMatch(doc).score : m.server ? { home: m.server.home.score, away: m.server.away.score } : null;
  const played = doc?.startedAt ?? m.server?.playedAt ?? m.receivedAt;

  return (
    // A plain Pressable: with Link asChild, a style function is dropped and the row loses its layout.
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/match/${m.id}`)}
      style={({ pressed }) => [styles.item, !first && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { backgroundColor: c.subtle }]}
    >
      <View style={styles.itemTop}>
        <Text style={{ color: c.muted, fontSize: 14 }}>{formatDate(played)}</Text>
        {!m.seen && <View style={[styles.dot, { backgroundColor: c.primary }]} accessibilityLabel="New" />}
      </View>
      <View style={styles.teams}>
        <Text style={[styles.team, score && score.home > score.away && styles.winner]} numberOfLines={1}>
          {home}
        </Text>
        <Text style={styles.score}>{score ? `${score.home}–${score.away}` : "–"}</Text>
        <Text style={[styles.team, { textAlign: "right" }, score && score.away > score.home && styles.winner]} numberOfLines={1}>
          {away}
        </Text>
      </View>
      <StatusBadges match={m} state={row.state} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: radius.xl, overflow: "hidden" },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 6 },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  teams: { flexDirection: "row", alignItems: "center", gap: space.sm },
  team: { flex: 1, fontSize: 16 },
  winner: { fontWeight: "600" },
  score: { fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
