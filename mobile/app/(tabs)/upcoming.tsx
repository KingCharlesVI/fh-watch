import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { presetOf } from "@/core/setup";
import { type UpcomingMatch, isPast, sortUpcoming, whenLabel } from "@/core/upcoming";
import { useUpcoming } from "@/state/upcoming";
import { Badge, Button, Empty, Screen, Swatch, Text } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

/** Matches set up ahead of time, soonest first, to send to the watch at the ground. */
export default function UpcomingScreen() {
  const list = useUpcoming();
  const c = useColors();
  const today = new Date();
  const shown = list ? sortUpcoming(list) : [];

  return (
    <Screen>
      <Button title="New match" icon="add" onPress={() => router.push("/upcoming/new")} />
      {list && shown.length === 0 && (
        <Empty icon="calendar-outline" title="No upcoming matches">
          Set your next matches up here ahead of time, then send each one to your watch at the ground.
        </Empty>
      )}
      {shown.length > 0 && (
        <View style={[styles.list, { borderColor: c.border, backgroundColor: c.card }]}>
          {shown.map((u, i) => (
            <UpcomingItem key={u.id} match={u} today={today} first={i === 0} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function UpcomingItem({ match: u, today, first }: { match: UpcomingMatch; today: Date; first: boolean }) {
  const c = useColors();
  const s = u.setup;
  const format = presetOf(s)?.label ?? `${s.periods} × ${s.periodMinutes} min`;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/upcoming/${u.id}`)}
      style={({ pressed }) => [styles.item, !first && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { backgroundColor: c.subtle }]}
    >
      <View style={styles.itemTop}>
        <Text style={{ color: isPast(u, today) ? c.warn : c.muted, fontSize: 14 }}>{whenLabel(u, today) ?? "No date"}</Text>
        {u.sentAt && <Badge label="Sent to watch" icon="watch-outline" />}
      </View>
      <View style={styles.teams}>
        <Swatch color={s.homeColor} />
        <Text style={styles.team} numberOfLines={1}>
          {s.homeName.trim() || "Home"}
        </Text>
        <Text style={{ color: c.muted }}>v</Text>
        <Text style={[styles.team, { textAlign: "right" }]} numberOfLines={1}>
          {s.awayName.trim() || "Away"}
        </Text>
        <Swatch color={s.awayColor} />
      </View>
      <Text style={{ color: c.muted, fontSize: 14 }} numberOfLines={1}>
        {[format, s.venue?.trim()].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: radius.xl, overflow: "hidden" },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 6 },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  teams: { flexDirection: "row", alignItems: "center", gap: space.sm },
  team: { flex: 1, fontSize: 16 },
});
