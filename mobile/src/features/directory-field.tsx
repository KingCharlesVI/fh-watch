import { type ComponentProps, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ONLINE } from "@/config";
import { Field, Ionicons, Text } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

export interface Suggestion {
  id: string;
  /** What the field is set to when it's picked. */
  value: string;
  /** Under it, e.g. the club. */
  detail?: string;
}

/**
 * A text field that also offers matches from the club directory as you type: pick one, or
 * keep typing your own. Only with the API (beta); offline, or with nothing found, it's an
 * ordinary field.
 */
export function DirectoryField({
  label,
  value,
  onChangeText,
  search,
  icon,
  error,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  search: (q: string) => Promise<Suggestion[]>;
  /** Beside each suggestion. */
  icon: ComponentProps<typeof Ionicons>["name"];
  error?: string;
  maxLength: number;
  placeholder?: string;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Suggestion[]>([]);
  const q = value.trim();

  useEffect(() => {
    if (!ONLINE || !focused || q.length < 2) return setResults([]);
    let live = true;
    const timer = setTimeout(() => {
      search(q)
        .then((found) => live && setResults(found.slice(0, 6)))
        // Offline or the server's down: typing still works.
        .catch(() => live && setResults([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, focused, search]);

  // Nothing to offer once what's typed is one of them.
  const shown = results.filter((r) => r.value.toLowerCase() !== q.toLowerCase());

  return (
    <View style={{ gap: space.xs }}>
      <Field
        label={label}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoCorrect={false}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        error={error}
        hint={ONLINE ? "Type a name, or pick one as you type." : undefined}
      />
      {shown.length > 0 && (
        <View style={[styles.list, { borderColor: c.border }]} accessibilityRole="list">
          {shown.map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={r.detail ? `${r.value}, ${r.detail}` : r.value}
              onPress={() => {
                onChangeText(r.value.slice(0, maxLength));
                setResults([]);
              }}
              style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { backgroundColor: c.subtle }]}
            >
              <Ionicons name={icon} size={16} color={c.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text }}>{r.value}</Text>
                {r.detail && <Text style={{ color: c.muted, fontSize: 13 }}>{r.detail}</Text>}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 10, paddingHorizontal: space.md },
});
