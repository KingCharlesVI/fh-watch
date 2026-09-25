import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  type RefreshControlProps,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { type Colors, FONT, radius, space, useColors } from "./theme";

/**
 * The app's building blocks, styled after the website's shadcn/ui components
 * (web/src/components/ui): bordered cards, 10px corners, neutral greys, a green
 * primary and the Geist typeface. Sizes are a little larger than the site's for
 * touch.
 */

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

/** React Native's Text in the app's typeface and colour. Use it (or T) instead of the plain one. */
export function Text({ style, ...props }: TextProps) {
  const c = useColors();
  return <RNText {...props} style={[{ fontFamily: FONT, color: c.text }, style]} />;
}

type TextVariant = "title" | "heading" | "body" | "muted" | "small" | "label";

export function T({ children, variant = "body", style, numberOfLines }: { children: ReactNode; variant?: TextVariant; style?: TextStyle; numberOfLines?: number }) {
  const c = useColors();
  const base: Record<TextVariant, TextStyle> = {
    title: { fontSize: 24, fontWeight: "600", letterSpacing: -0.4, color: c.text },
    heading: { fontSize: 16, fontWeight: "500", color: c.text },
    body: { fontSize: 16, color: c.text },
    muted: { fontSize: 14, lineHeight: 20, color: c.muted },
    small: { fontSize: 13, lineHeight: 18, color: c.muted },
    label: { fontSize: 14, fontWeight: "500", color: c.text },
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
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>
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

type ButtonVariant = "primary" | "outline" | "secondary" | "ghost" | "danger";

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
        { backgroundColor: pressed && !off ? look.pressed : look.bg, borderColor: look.border, opacity: off ? 0.5 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={look.fg} size="small" /> : icon && <Ionicons name={icon} size={small ? 15 : 17} color={look.fg} />}
      <Text style={{ color: look.fg, fontWeight: "500", fontSize: small ? 14 : 15 }}>{title}</Text>
    </Pressable>
  );
}

const buttonLook = (c: Colors) => ({
  primary: { bg: c.primary, pressed: c.primary + "CC", fg: c.primaryText, border: c.primary },
  outline: { bg: c.background, pressed: c.subtle, fg: c.text, border: c.border },
  secondary: { bg: c.subtle, pressed: c.border, fg: c.text, border: c.subtle },
  ghost: { bg: "transparent", pressed: c.subtle, fg: c.text, border: "transparent" },
  danger: { bg: c.dangerSoft, pressed: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
});

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={c.muted}
        {...input}
        style={[
          styles.input,
          { color: c.text, borderColor: error ? c.danger : c.input },
          input.multiline && { minHeight: 80, textAlignVertical: "top" },
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
      style={[styles.chip, { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primarySoft : c.background }]}
    >
      {swatch && <Swatch color={swatch} />}
      <Text style={{ color: selected ? c.primary : c.text, fontWeight: selected ? "500" : "400", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** A row of chips where one is picked, for choices in forms. */
export function Choice<V extends string | number>({ label, value, options, onChange }: { label?: string; value: V; options: { value: V; label: string; swatch?: string }[]; onChange: (v: V) => void }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <T variant="label">{label}</T>}
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} swatch={o.swatch} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** Switches between views of a list, like the website's tabs. */
export function Tabs<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={[styles.tabs, { backgroundColor: c.subtle }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.tab, active && { backgroundColor: c.background, borderColor: c.border }]}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: active ? c.text : c.muted }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type Tone = "neutral" | "primary" | "warn" | "danger";

const toneColors = (c: Colors, tone: Tone) =>
  ({
    neutral: { bg: c.subtle, fg: c.text, border: c.subtle },
    primary: { bg: c.primary, fg: c.primaryText, border: c.primary },
    warn: { bg: c.warnSoft, fg: c.warn, border: c.warnBorder },
    danger: { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
  })[tone];

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      {icon && <Ionicons name={icon} size={12} color={t.fg} />}
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}

/** A notice, like the website's alerts: bordered, with a coloured title for warnings and errors. */
export function Banner({ tone = "neutral", icon, title, children, action }: { tone?: Tone; icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  const c = useColors();
  const look = {
    neutral: { bg: c.card, border: c.border, title: c.text, body: c.muted },
    primary: { bg: c.primarySoft, border: c.primarySoft, title: c.primary, body: c.text },
    warn: { bg: c.warnSoft, border: c.warnBorder, title: c.warn, body: c.warn },
    danger: { bg: c.card, border: c.border, title: c.danger, body: c.danger },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: look.bg, borderColor: look.border }]}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
        {icon && <Ionicons name={icon} size={18} color={look.title} style={{ marginTop: 1 }} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: look.title, fontWeight: "500", fontSize: 15 }}>{title}</Text>
          {typeof children === "string" ? <Text style={{ color: look.body, fontSize: 14, lineHeight: 20 }}>{children}</Text> : children}
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
    <View style={[styles.card, styles.empty, { borderColor: c.border, backgroundColor: c.card }]}>
      <Ionicons name={icon} size={32} color={c.muted} />
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
  card: { borderWidth: 1, borderRadius: radius.xl, padding: space.lg, gap: space.md },
  empty: { alignItems: "center", paddingVertical: space.xl * 1.5, gap: space.sm },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  buttonSmall: { minHeight: 34, paddingHorizontal: space.md },
  input: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16, fontFamily: FONT, backgroundColor: "transparent" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1 },
  tabs: { flexDirection: "row", padding: 3, borderRadius: radius.lg, alignSelf: "stretch" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7, paddingHorizontal: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  banner: { borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md, borderWidth: 1 },
});
