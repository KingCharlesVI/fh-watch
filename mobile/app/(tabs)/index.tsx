import { summarizeMatch } from "@fh/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, TextInput, type TextStyle, View } from "react-native";
import { errorMessage } from "@/core/api";
import { matchesSearch } from "@/core/match-search";
import { overdueUploads } from "@/core/upload-reminders";
import { StatusBadges, formatDate } from "@/features/match-view";
import { UpdateNotice } from "@/features/update-notice";
import { ONLINE } from "@/config";
import { sync } from "@/services";
import { drainWatchInbox } from "@/services/watch";
import { type MatchRow, useMatches } from "@/state/sync";
import { useUpdates } from "@/state/updates";
import { clockTime } from "@/core/upcoming";
import { Banner, Button, Empty, Ionicons, List, Score, Screen, SectionTitle, Tabs, Text } from "@/ui/kit";
import { FONT, FONT_MONO, radius, space, useColors } from "@/ui/theme";

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
  const [tab, setTab] = useState<Tab>("new");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { update, dismissed } = useUpdates();
  const found = rows.filter((r) => matchesSearch(r.match, search));
  const counts = { new: 0, saved: 0, drafts: 0, published: 0 };
  for (const r of found) for (const t of TABS) if (inTab(r, t)) counts[t]++;
  const shown = found.filter((r) => inTab(r, tab));
  const searching = search.trim() !== "";

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
      {(rows.length > 0 || searching) && <SearchField value={search} onChange={setSearch} />}
      {loaded && shown.length === 0 && searching && <Empty icon="search-outline" title="No matches found">Nothing here has a team, club, competition or venue with “{search.trim()}” in it.</Empty>}
      {loaded && shown.length === 0 && !searching && (
        <Empty icon={tab === "new" ? "watch-outline" : "document-text-outline"} title={tab === "new" ? "Nothing new" : "No matches here"}>
          {tab === "new"
            ? "Matches from your watch appear here when they arrive. You can also import one from a file in Settings."
            : ONLINE
              ? "Pull down to check the server."
              : "Matches you've opened are kept here, on this phone."}
        </Empty>
      )}
      {byDay(shown).map((group) => (
        // A heading per day, then one bordered list with dividers, like the website's results.
        <View key={group.label} style={{ gap: space.sm }}>
          <SectionTitle>{group.label}</SectionTitle>
          <List>
            {group.rows.map((r) => (
              <MatchItem key={r.match.id} row={r} />
            ))}
          </List>
        </View>
      ))}
    </Screen>
  );
}

/** Narrows the list to matches with these words in a team, club, competition or venue. */
function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={[styles.search, { borderColor: c.input, backgroundColor: c.card }]}>
      <Ionicons name="search-outline" size={18} color={c.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Team, club, competition or venue"
        placeholderTextColor={c.muted}
        accessibilityLabel="Find a match"
        autoCorrect={false}
        returnKeyType="search"
        style={[styles.searchInput, { color: c.text }]}
      />
      {value !== "" && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8} onPress={() => onChange("")}>
          <Ionicons name="close-circle" size={18} color={c.muted} />
        </Pressable>
      )}
    </View>
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

const playedAt = (m: MatchRow["match"]) => m.document?.startedAt ?? m.server?.playedAt ?? m.receivedAt;

/** Rows grouped by the day they were played, in the order they come. */
function byDay(rows: MatchRow[]): { label: string; rows: MatchRow[] }[] {
  const groups: { label: string; rows: MatchRow[] }[] = [];
  for (const r of rows) {
    const label = formatDate(playedAt(r.match));
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

/**
 * A result as the website shows it on a phone: the teams stacked, each level with its number in
 * a small vertical scoreboard on the right, the winner's in green.
 */
function MatchItem({ row }: { row: MatchRow }) {
  const c = useColors();
  const m = row.match;
  const doc = m.document;
  const home = doc?.teams.home.name ?? m.server?.home.name ?? "Home";
  const away = doc?.teams.away.name ?? m.server?.away.name ?? "Away";
  const score = doc ? summarizeMatch(doc).score : m.server ? { home: m.server.home.score, away: m.server.away.score } : null;
  const won = score && score.home !== score.away ? (score.home > score.away ? "home" : "away") : null;
  const details = [doc?.competition, doc?.venue].filter(Boolean).join(" · ");
  const name = (side: "home" | "away"): TextStyle => (won === side ? { fontWeight: "700" } : won ? { color: c.muted } : { fontWeight: "600" });
  const digit = (side: "home" | "away") => (won === side ? c.primary : won ? c.muted : c.text);

  return (
    // A plain Pressable: with Link asChild, a style function is dropped and the row loses its layout.
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={score ? `${home} ${score.home}, ${away} ${score.away}` : `${home} v ${away}`}
      onPress={() => router.push(`/match/${m.id}`)}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: c.subtle }]}
    >
      <View style={styles.itemTop}>
        <Text style={{ fontFamily: FONT_MONO, fontWeight: "600", fontSize: 12, color: c.muted }}>{clockTime(new Date(playedAt(m)))}</Text>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: space.sm }}>
          {details !== "" && (
            <Text style={{ color: c.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
              {details}
            </Text>
          )}
          {!m.seen && <View style={[styles.dot, { backgroundColor: c.primary }]} accessibilityLabel="New" />}
        </View>
      </View>
      <View style={styles.teams}>
        <View style={styles.names}>
          <Text style={[styles.team, name("home")]} numberOfLines={1}>
            {home}
          </Text>
          <Text style={[styles.team, name("away")]} numberOfLines={1}>
            {away}
          </Text>
        </View>
        <View style={[styles.board, { backgroundColor: c.subtle }]}>
          <Score color={digit("home")}>{score ? score.home : "–"}</Score>
          <Score color={digit("away")}>{score ? score.away : "–"}</Score>
        </View>
      </View>
      <StatusBadges match={m} state={row.state} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 16, fontFamily: FONT },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  teams: { flexDirection: "row", alignItems: "stretch", gap: space.lg },
  names: { flex: 1, justifyContent: "space-around", gap: space.sm },
  team: { fontSize: 17 },
  board: { minWidth: 40, alignItems: "flex-end", justifyContent: "space-around", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, gap: 4 },
});
