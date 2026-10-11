import type { MyAppointment } from "@fh/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { ONLINE } from "@/config";
import { errorMessage } from "@/core/api";
import { isAppointmentUpcoming } from "@/core/appointments";
import { presetOf } from "@/core/setup";
import { type UpcomingMatch, dayLabel, isPast, playedUpcoming, sortUpcoming, whenLabel } from "@/core/upcoming";
import { answerAppointment, refreshAppointments, useAppointments } from "@/state/appointments";
import { useMatches } from "@/state/sync";
import { upcoming, useUpcoming } from "@/state/upcoming";
import { Badge, Button, Card, Empty, Row, Screen, Swatch, T, Text } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

/** Matches set up ahead of time, soonest first, to send to the watch at the ground. */
export default function UpcomingScreen() {
  const list = useUpcoming();
  const { rows } = useMatches();
  const c = useColors();
  const today = new Date();
  const shown = list ? sortUpcoming(list) : [];
  const { items: appointments } = useAppointments();
  const [refreshing, setRefreshing] = useState(false);

  // Appointments from clubs: fetched again each time this tab opens.
  useFocusEffect(
    useCallback(() => {
      if (ONLINE) void refreshAppointments();
    }, []),
  );

  // Once a match that was sent comes back from the watch played, it's no longer upcoming.
  useEffect(() => {
    if (!list) return;
    const played = rows.flatMap((r) => (r.match.document ? [r.match.document] : []));
    upcoming.removeAll(playedUpcoming(list, played));
  }, [list, rows]);

  return (
    <Screen
      refresh={
        ONLINE ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refreshAppointments();
              setRefreshing(false);
            }}
          />
        ) : undefined
      }
    >
      <Button title="New match" icon="add" onPress={() => router.push("/upcoming/new")} />
      {appointments && <Appointments items={appointments} today={today} />}
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
        <View style={{ flexDirection: "row", gap: space.xs }}>
          {isAppointmentUpcoming(u) && <Badge label="Appointed" icon="ribbon-outline" />}
          {u.sentAt && <Badge label="Sent to watch" icon="watch-outline" />}
        </View>
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
        {[format, s.competition?.trim(), s.venue?.trim()].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

/**
 * Appointments from clubs: ones asking for an answer, and ones as second umpire (a watch
 * umpire's accepted ones are in the list below, set up).
 */
function Appointments({ items, today }: { items: MyAppointment[]; today: Date }) {
  const asked = items.filter((a) => a.status === "offered");
  const second = items.filter((a) => a.status === "accepted" && a.role === "second");
  if (asked.length === 0 && second.length === 0) return null;
  return (
    <>
      {asked.map((a) => (
        <AppointmentCard key={a.id} a={a} today={today} title={`${a.club.name} asks you to umpire`} answer />
      ))}
      {second.map((a) => (
        <AppointmentCard key={a.id} a={a} today={today} title="Second umpire" />
      ))}
    </>
  );
}

function AppointmentCard({ a, today, title, answer }: { a: MyAppointment; today: Date; title: string; answer?: boolean }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const f = a.fixture;
  const role = a.role === "watch" ? "Watch umpire: you run the watch app" : "Second umpire";
  async function respond(choice: "accept" | "decline") {
    setBusy(choice);
    try {
      await answerAppointment(a.id, choice);
    } catch (err) {
      Alert.alert("Couldn't answer", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card title={title}>
      <T variant="heading">
        {f.home.name} v {f.away.name}
      </T>
      <T variant="muted">{[f.time ? `${dayLabel(f.date, today)}, ${f.time}` : dayLabel(f.date, today), f.venue].filter(Boolean).join(" · ")}</T>
      <T variant="small">
        {answer ? role : `For ${a.club.name}`}
        {a.mentoring ? " (mentoring)" : ""}
        {a.colleague ? `, with ${a.colleague.displayName}` : ""}
      </T>
      {f.notes && <T variant="small">{f.notes}</T>}
      {answer && (
        <Row>
          <View style={{ flex: 1 }}>
            <Button title="Accept" icon="checkmark" loading={busy === "accept"} disabled={busy !== null} onPress={() => void respond("accept")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Decline"
              variant="outline"
              loading={busy === "decline"}
              disabled={busy !== null}
              onPress={() =>
                Alert.alert("Decline it?", `${a.club.name}'s admins are told, so they can ask someone else.`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Decline", style: "destructive", onPress: () => void respond("decline") },
                ])
              }
            />
          </View>
        </Row>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: radius.xl, overflow: "hidden" },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 6 },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  teams: { flexDirection: "row", alignItems: "center", gap: space.sm },
  team: { flex: 1, fontSize: 16 },
});
