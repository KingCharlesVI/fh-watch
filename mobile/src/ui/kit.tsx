import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { type Colors, radius, space, useColors } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, refresh }: { children: ReactNode; refresh?: React.ReactElement<RefreshControlProps> }) {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh}
    >
      {children}
    </ScrollView>
  );
}

type TextVariant = "title" | "heading" | "body" | "muted" | "small" | "label";

export function T({ children, variant = "body", style, numberOfLines }: { children: ReactNode; variant?: TextVariant; style?: TextStyle; numberOfLines?: number }) {
  const c = useColors();
  const base: Record<TextVariant, TextStyle> = {
    title: { fontSize: 24, fontWeight: "700", color: c.text },
    heading: { fontSize: 17, fontWeight: "600", color: c.text },
    body: { fontSize: 16, color: c.text },
    muted: { fontSize: 15, color: c.muted },
    small: { fontSize: 13, color: c.muted },
    label: { fontSize: 14, fontWeight: "600", color: c.text },
  };
  return (
    <Text style={[base[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Card({ children, style, title, action }: { children?: ReactNode; style?: ViewStyle; title?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.card, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.md }, style]}>
      {(title || action) && (
        <View style={styles.rowBetween}>
          {title && <T variant="heading">{title}</T>}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const c = useColors();
  const look = buttonLook(c)[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: look.bg, borderColor: look.border, opacity: off ? 0.55 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={look.fg} size="small" /> : icon && <Ionicons name={icon} size={small ? 16 : 18} color={look.fg} />}
      <Text style={{ color: look.fg, fontWeight: "600", fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
}

const buttonLook = (c: Colors) => ({
  primary: { bg: c.primary, fg: c.primaryText, border: c.primary },
  outline: { bg: c.card, fg: c.text, border: c.border },
  ghost: { bg: "transparent", fg: c.primary, border: "transparent" },
  danger: { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
});

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={c.muted}
        {...input}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.input, borderColor: error ? c.danger : c.border },
          input.multiline && { minHeight: 72, textAlignVertical: "top" },
          input.style,
        ]}
      />
      {hint && !error && <T variant="small">{hint}</T>}
      {error && <T variant="small" style={{ color: c.danger }}>{error}</T>}
    </View>
  );
}

export function Chip({ label, selected, onPress, swatch }: { label: string; selected: boolean; onPress: () => void; swatch?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primarySoft : c.card }]}
    >
      {swatch && <Swatch color={swatch} />}
      <Text style={{ color: selected ? c.text : c.muted, fontWeight: selected ? "600" : "400" }}>{label}</Text>
    </Pressable>
  );
}

/** A row of chips where one is picked. */
export function Choice<V extends string | number>({ label, value, options, onChange }: { label?: string; value: V; options: { value: V; label: string; swatch?: string }[]; onChange: (v: V) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      {label && <T variant="label">{label}</T>}
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} swatch={o.swatch} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

type Tone = "neutral" | "primary" | "warn" | "danger";

const toneColors = (c: Colors, tone: Tone) =>
  ({
    neutral: { bg: c.border, fg: c.text },
    primary: { bg: c.primarySoft, fg: c.primary },
    warn: { bg: c.warnSoft, fg: c.warn },
    danger: { bg: c.dangerSoft, fg: c.danger },
  })[tone];

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon && <Ionicons name={icon} size={12} color={t.fg} />}
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Banner({ tone = "neutral", icon, title, children, action }: { tone?: Tone; icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.banner, { backgroundColor: tone === "neutral" ? c.card : t.bg, borderColor: tone === "neutral" ? c.border : t.bg }]}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
        {icon && <Ionicons name={icon} size={20} color={t.fg} style={{ marginTop: 1 }} />}
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={{ color: t.fg, fontWeight: "600", fontSize: 15 }}>{title}</Text>
          {typeof children === "string" ? <Text style={{ color: t.fg, fontSize: 14 }}>{children}</Text> : children}
        </View>
      </View>
      {action}
    </View>
  );
}

export function Swatch({ color, size = 12 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: 3, backgroundColor: color, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.25)" }} />;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xl * 2, gap: space.sm }}>
      <Ionicons name={icon} size={40} color={c.muted} />
      <T variant="heading">{title}</T>
      {children && <T variant="muted" style={{ textAlign: "center" }}>{children}</T>}
    </View>
  );
}

export { Ionicons };

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1 },
  buttonSmall: { minHeight: 36, paddingHorizontal: space.md },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  banner: { borderRadius: radius.md, padding: space.md, gap: space.md, borderWidth: 1 },
});
