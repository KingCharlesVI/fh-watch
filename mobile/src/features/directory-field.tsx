import { type ComponentProps, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ONLINE } from "@/config";
import { errorMessage } from "@/core/api";
import { Field, Ionicons, Text } from "@/ui/kit";
import { radius, space, useColors } from "@/ui/theme";

export interface Suggestion {
  id: string;
  /** What the field is set to when it's picked. */
  value: string;
  /** Under it, e.g. the club. */
  detail?: string;
}

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * A text field that also offers matches from the website's lists as you type: pick one, or
 * keep typing your own. With `add`, a name the list doesn't have can be added to it from
 * here. Only with the API (beta); offline, or with nothing found, it's an ordinary field.
 */
export function DirectoryField({
  label,
  value,
  onChangeText,
  search,
  add,
  icon,
  error,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  search: (q: string) => Promise<Suggestion[]>;
  /** Adds what's typed to the list, e.g. as a new venue. `noun` says what it is. */
  add?: { noun: string; run: (name: string) => Promise<unknown> };
  /** Beside each suggestion. */
  icon: IconName;
  error?: string;
  maxLength: number;
  placeholder?: string;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  // What was searched for, and what came back: the add row waits until the list has answered.
  const [found, setFound] = useState<{ q: string; items: Suggestion[] } | null>(null);
  const [adding, setAdding] = useState<"busy" | { added: string } | { failed: string } | null>(null);
  const q = value.trim().replace(/\s+/g, " ");

  useEffect(() => {
    if (!ONLINE || !focused || q.length < 2) return setFound(null);
    let live = true;
    const timer = setTimeout(() => {
      search(q)
        .then((items) => live && setFound({ q, items: items.slice(0, 6) }))
        // Offline or the server's down: typing still works, and there's nothing to add to.
        .catch(() => live && setFound(null));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, focused, search]);

  const same = (s: string) => s.toLowerCase() === q.toLowerCase();
  const results = found?.q === q ? found.items : [];
  // Nothing to offer once what's typed is one of them.
  const shown = results.filter((r) => !same(r.value));
  // Once added, it's among the results, so this goes by itself.
  const canAdd = !!add && found?.q === q && !results.some((r) => same(r.value));

  async function addTyped() {
    setAdding("busy");
    try {
      await add!.run(q);
      setAdding({ added: q });
      setFound({ q, items: [{ id: "added", value: q }, ...results] });
    } catch (err) {
      setAdding({ failed: errorMessage(err) });
    }
  }

  return (
    <View style={{ gap: space.xs }}>
      <Field
        label={label}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoCorrect={false}
        onChangeText={(v) => {
          setAdding(null);
          onChangeText(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        error={error}
        hint={ONLINE ? "Type a name, or pick one as you type." : undefined}
      />
      {(shown.length > 0 || canAdd) && (
        <View style={[styles.list, { borderColor: c.border }]} accessibilityRole="list">
          {shown.map((r, i) => (
            <Row key={r.id} first={i === 0} icon={icon} title={r.value} detail={r.detail} onPress={() => onChangeText(r.value.slice(0, maxLength))} />
          ))}
          {canAdd && (
            <Row
              first={shown.length === 0}
              icon="add-circle-outline"
              title={adding === "busy" ? `Adding “${q}”…` : `Add “${q}” as a new ${add!.noun}`}
              detail={`For everyone to pick from. Only add it if the list doesn't have it already.`}
              tint={c.primary}
              disabled={adding === "busy"}
              onPress={() => void addTyped()}
            />
          )}
        </View>
      )}
      {typeof adding === "object" && adding && "added" in adding && (
        <Text style={{ color: c.muted, fontSize: 13 }}>Added to the {add?.noun}s.</Text>
      )}
      {typeof adding === "object" && adding && "failed" in adding && (
        <Text style={{ color: c.danger, fontSize: 13 }}>Couldn&apos;t add it: {adding.failed}</Text>
      )}
    </View>
  );
}

function Row({
  first,
  icon,
  title,
  detail,
  tint,
  disabled,
  onPress,
}: {
  first: boolean;
  icon: IconName;
  title: string;
  detail?: string;
  tint?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { backgroundColor: c.subtle }]}
    >
      <Ionicons name={icon} size={16} color={tint ?? c.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: tint ?? c.text }}>{title}</Text>
        {detail && <Text style={{ color: c.muted, fontSize: 13 }}>{detail}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 10, paddingHorizontal: space.md },
});
