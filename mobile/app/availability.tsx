import { type Availability, type AvailabilityDay, weekdayOf } from "@fh/shared";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/api";
import { type Mark, calendarWeeks, dayStatus, nextMark, readHours, withMark } from "@/core/availability";
import { dayLabel, isoDay } from "@/core/upcoming";
import { api } from "@/services";
import { Banner, Button, Card, Chip, Field, Row, Screen, T, Text } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Monday first, as the calendar is; 0 is Sunday, as the server counts. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map((day, i) => ({ day, label: WEEKDAY_HEADINGS[i]! }));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * When you can umpire, for your clubs' admins to see when they appoint: the same as the
 * website's Availability page. Each change is saved as it's made, and undone if it can't be.
 */
export default function AvailabilityScreen() {
  const [days, setDays] = useState<Map<string, AvailabilityDay> | null>(null);
  const [neverFree, setNeverFree] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The day whose hours are being given, if any.
  const [hoursFor, setHoursFor] = useState<string | null>(null);
  const today = isoDay(new Date());

  const load = useCallback(async () => {
    try {
      const a: Availability = await api.myAvailability();
      setDays(new Map(a.days.map((d) => [d.date, d])));
      setNeverFree(a.unavailableWeekdays);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function mark(date: string, to: Mark, hours?: { from: string | null; to: string | null }) {
    if (!days) return;
    const before = days;
    setDays(withMark(days, date, to, hours));
    try {
      if (to === "clear") await api.unmarkDay(date);
      else await api.markDay(date, to === "available", hours);
    } catch (err) {
      setDays(before);
      Alert.alert("Couldn't save that", errorMessage(err));
    }
  }

  async function toggleWeekday(day: number) {
    const before = neverFree;
    const after = before.includes(day) ? before.filter((d) => d !== day) : [...before, day].sort();
    setNeverFree(after);
    try {
      await api.setUnavailableWeekdays(after);
    } catch (err) {
      setNeverFree(before);
      Alert.alert("Couldn't save that", errorMessage(err));
    }
  }

  return (
    <Screen
      refresh={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <T variant="muted">When you can umpire. Your clubs&apos; admins see it when they choose who to ask.</T>
      {error && (
        <Banner tone="warn" icon="cloud-offline-outline" title="Couldn't fetch your availability" action={<Button small variant="outline" title="Try again" onPress={() => void load()} />}>
          {error}
        </Banner>
      )}
      {days && (
        <>
          <Card title="The next 12 weeks">
            <T variant="small">Tap a day once if you&apos;re free, twice if you&apos;re not, and again to unmark it. Press and hold a day if you&apos;re free for only some of it.</T>
            <Calendar
              today={today}
              days={days}
              neverFree={neverFree}
              onTap={(date) => void mark(date, nextMark(days.get(date)))}
              onHold={(date) => setHoursFor(date)}
            />
          </Card>
          {hoursFor && (
            <Hours
              key={hoursFor}
              date={hoursFor}
              day={days.get(hoursFor)}
              onSave={(hours) => {
                void mark(hoursFor, "available", hours);
                setHoursFor(null);
              }}
              onClose={() => setHoursFor(null)}
            />
          )}
          <Card title="Never free on">
            <T variant="small">A day you mark in the calendar overrides this.</T>
            <View style={styles.wrap}>
              {WEEKDAYS.map((w) => (
                <Chip key={w.day} label={w.label} selected={neverFree.includes(w.day)} onPress={() => void toggleWeekday(w.day)} />
              ))}
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Calendar({
  today,
  days,
  neverFree,
  onTap,
  onHold,
}: {
  today: string;
  days: ReadonlyMap<string, AvailabilityDay>;
  neverFree: readonly number[];
  onTap: (date: string) => void;
  onHold: (date: string) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <View style={styles.week}>
        {WEEKDAY_HEADINGS.map((d) => (
          <Text key={d} style={[styles.heading, { color: c.muted }]}>
            {d}
          </Text>
        ))}
      </View>
      {calendarWeeks(today).map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((date) => {
            const past = date < today;
            const [, m, d] = date.split("-").map(Number);
            const { tone, label } = dayStatus(days.get(date), neverFree.includes(weekdayOf(date)));
            const colour = tone === "free" ? c.primary : tone === "busy" ? c.danger : c.muted;
            return (
              <Pressable
                key={date}
                disabled={past}
                accessibilityRole="button"
                accessibilityLabel={`${date}: ${label || "not said"}`}
                onPress={() => onTap(date)}
                onLongPress={() => onHold(date)}
                style={({ pressed }) => [
                  styles.day,
                  { borderColor: c.border },
                  tone === "free" && { borderColor: c.primary, backgroundColor: c.primarySoft },
                  tone === "busy" && { borderColor: c.danger, backgroundColor: c.dangerSoft },
                  tone === "usually-busy" && { borderStyle: "dashed", backgroundColor: c.subtle },
                  pressed && { opacity: 0.6 },
                  past && { opacity: 0.4 },
                ]}
              >
                <Text style={{ color: c.muted, fontSize: 11 }}>
                  {d}
                  {d === 1 ? ` ${MONTHS[m! - 1]}` : ""}
                </Text>
                <Text style={{ color: colour, fontSize: 10, fontWeight: "500" }} numberOfLines={2}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Free for only some of a day: the hours you can do. */
function Hours({
  date,
  day,
  onSave,
  onClose,
}: {
  date: string;
  day: AvailabilityDay | undefined;
  onSave: (hours: { from: string | null; to: string | null }) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const [from, setFrom] = useState(day?.from ?? "");
  const [to, setTo] = useState(day?.to ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const hours = readHours(from, to);
    if ("error" in hours) return setError(hours.error);
    onSave(hours);
  }

  return (
    <Card title={`Free on ${dayLabel(date, new Date())}`}>
      <T variant="small">Matches kicking off outside these hours count you as not free.</T>
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="From" value={from} onChangeText={setFrom} placeholder="10:00" keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Until" value={to} onChangeText={setTo} placeholder="16:00" keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>
      </Row>
      {error && <T variant="small" style={{ color: c.danger }}>{error}</T>}
      <Row>
        <View style={{ flex: 1 }}>
          <Button title="Save hours" onPress={save} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" variant="outline" onPress={onClose} />
        </View>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: "row", gap: space.xs },
  heading: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "500" },
  day: { flex: 1, height: 52, justifyContent: "space-between", borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 4, paddingVertical: 3 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
