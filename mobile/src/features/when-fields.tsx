import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View, useColorScheme } from "react-native";
import { type UpcomingMatch, clockTime, dayLabel, isoDay, pickerStart } from "@/core/upcoming";
import { Ionicons, T } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

type When = Pick<UpcomingMatch, "date" | "time">;

/**
 * An upcoming match's day and kick-off, each picked with the phone's own picker:
 * a dialog on Android, and on iOS one that opens under the field. Either can be
 * cleared, since neither is needed to send the match to the watch.
 */
export function WhenFields({ when, onChange }: { when: When; onChange: (change: Partial<When>) => void }) {
  const [open, setOpen] = useState<"date" | "time" | null>(null);
  const scheme = useColorScheme();
  const c = useColors();
  const today = new Date();
  const start = pickerStart(when, today);
  const pick = (mode: "date" | "time", d: Date) => onChange(mode === "date" ? { date: isoDay(d) } : { time: clockTime(d) });

  function press(mode: "date" | "time") {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({ value: start, mode, minimumDate: mode === "date" ? today : undefined, onValueChange: (_, d) => pick(mode, d) });
      return;
    }
    // The iOS picker only reports a change, so what it opens on is taken as picked.
    if (open !== mode && (mode === "date" ? !when.date : !when.time)) pick(mode, start);
    setOpen(open === mode ? null : mode);
  }

  const field = (mode: "date" | "time", label: string, value: string | null) => (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <View style={[styles.field, { borderColor: open === mode ? c.primary : c.input }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? "not set"}`} onPress={() => press(mode)} style={styles.value}>
          <Ionicons name={mode === "date" ? "calendar-outline" : "time-outline"} size={18} color={c.muted} />
          <T style={value ? undefined : { color: c.muted }}>{value ?? "Not set"}</T>
        </Pressable>
        {value && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            hitSlop={8}
            onPress={() => {
              onChange(mode === "date" ? { date: null } : { time: null });
              if (open === mode) setOpen(null);
            }}
            style={styles.clear}
          >
            <Ionicons name="close-circle" size={18} color={c.muted} />
          </Pressable>
        )}
      </View>
      {Platform.OS === "ios" && open === mode && (
        <DateTimePicker
          value={start}
          mode={mode}
          display={mode === "date" ? "inline" : "spinner"}
          minimumDate={mode === "date" ? today : undefined}
          minuteInterval={5}
          accentColor={c.primary}
          themeVariant={scheme === "dark" ? "dark" : "light"}
          onValueChange={(_, d) => pick(mode, d)}
        />
      )}
    </View>
  );

  return (
    <>
      {field("date", "Day", when.date && dayLabel(when.date, today))}
      {field("time", "Kick-off", when.time)}
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.lg },
  value: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: 11 },
  clear: { paddingHorizontal: space.md, paddingVertical: 11 },
});
