import { type Availability, type AvailabilityDay, weekdayOf } from "@fh/shared";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/api";
import { MONTHS_AHEAD, type Mark, addMonths, dayStatus, lastDay, monthGrid, monthLabel, nextMark, readHours, withMark } from "@/core/availability";
import { dayLabel, isoDay } from "@/core/upcoming";
import { api } from "@/services";
import { Banner, Button, Card, Chip, Field, Ionicons, Row, Screen, T, Text } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Monday first, as the calendar is; 0 is Sunday, as the server counts. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map((day, i) => ({ day, label: WEEKDAY_HEADINGS[i]! }));

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
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);

  const load = useCallback(async () => {
    try {
      const a: Availability = await api.myAvailability(today, lastDay(addMonths(today.slice(0, 7), MONTHS_AHEAD - 1)));
      setDays(new Map(a.days.map((d) => [d.date, d])));
      setNeverFree(a.unavailableWeekdays);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [today]);

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
          <Card>
            <Calendar
              month={month}
              onMonth={setMonth}
              first={thisMonth}
              last={addMonths(thisMonth, MONTHS_AHEAD - 1)}
              today={today}
              days={days}
              neverFree={neverFree}
              onTap={(date) => void mark(date, nextMark(days.get(date)))}
              onHold={(date) => setHoursFor(date)}
            />
            <T variant="small">Tap a day once if you&apos;re free, twice if you&apos;re not, and again to unmark it. Press and hold a day if you&apos;re free for only some of it.</T>
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

/** A month at a time, like the phone's own date pickers, with each day coloured by what you've said. */
function Calendar({
  month,
  onMonth,
  first,
  last,
  today,
  days,
  neverFree,
  onTap,
  onHold,
}: {
  month: string;
  onMonth: (month: string) => void;
  first: string;
  last: string;
  today: string;
  days: ReadonlyMap<string, AvailabilityDay>;
  neverFree: readonly number[];
  onTap: (date: string) => void;
  onHold: (date: string) => void;
}) {
  const c = useColors();
  const turn = (by: number, enabled: boolean, icon: "chevron-back" | "chevron-forward", label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      hitSlop={8}
      onPress={() => onMonth(addMonths(month, by))}
      style={({ pressed }) => [styles.turn, pressed && { backgroundColor: c.subtle }, !enabled && { opacity: 0.3 }]}
    >
      <Ionicons name={icon} size={20} color={c.text} />
    </Pressable>
  );

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.header}>
        {turn(-1, month > first, "chevron-back", "Previous month")}
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }} accessibilityRole="header">
          {monthLabel(month)}
        </Text>
        {turn(1, month < last, "chevron-forward", "Next month")}
      </View>
      <View style={styles.week}>
        {WEEKDAY_HEADINGS.map((d) => (
          <Text key={d} style={[styles.heading, { color: c.muted }]}>
            {d.slice(0, 1)}
          </Text>
        ))}
      </View>
      {monthGrid(month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const past = date < today;
            const day = days.get(date);
            const { tone, label } = dayStatus(day, neverFree.includes(weekdayOf(date)));
            const hours = !!day?.available && !!(day.from || day.to);
            const fill = tone === "free" ? c.primary : tone === "busy" ? c.danger : tone === "usually-busy" ? c.subtle : "transparent";
            const ink = tone === "free" || tone === "busy" ? c.primaryText : tone === "usually-busy" ? c.muted : c.text;
            return (
              <View key={date} style={styles.cell}>
                <Pressable
                  disabled={past}
                  accessibilityRole="button"
                  accessibilityLabel={`${date}: ${label || "not said"}`}
                  onPress={() => onTap(date)}
                  onLongPress={() => onHold(date)}
                  style={({ pressed }) => [
                    styles.day,
                    { backgroundColor: fill },
                    date === today && { borderWidth: 2, borderColor: tone === "unknown" || tone === "usually-busy" ? c.primary : c.text },
                    pressed && { opacity: 0.6 },
                    past && { opacity: 0.35 },
                  ]}
                >
                  <Text style={{ color: ink, fontSize: 15, fontWeight: date === today ? "700" : "400" }}>{Number(date.slice(8))}</Text>
                  {hours && <View style={[styles.dot, { backgroundColor: ink }]} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <Key colour={c.primary} label="Free" />
        <Key colour={c.danger} label="Not free" />
        <Key colour={c.subtle} label="Never free that day" />
        <View style={styles.key}>
          <View style={[styles.dot, { backgroundColor: c.muted }]} />
          <Text style={{ color: c.muted, fontSize: 12 }}>Some hours</Text>
        </View>
      </View>
    </View>
  );
}

function Key({ colour, label }: { colour: string; label: string }) {
  const c = useColors();
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: colour, borderColor: c.border }]} />
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  turn: { padding: space.sm, borderRadius: radius.lg },
  week: { flexDirection: "row" },
  heading: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "500" },
  cell: { flex: 1, aspectRatio: 1, padding: 2 },
  day: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  dot: { width: 4, height: 4, borderRadius: 2, position: "absolute", bottom: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space.xs, paddingTop: space.xs },
  key: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
