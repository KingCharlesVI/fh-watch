import Ionicons from "@expo/vector-icons/Ionicons";
import { type ComponentProps, createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
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
import { type Colors, FONT, FONT_SCORE, FONT_SECTION, FONT_TITLE, radius, space, useColors } from "./theme";

/**
 * The app's building blocks, in the website's pitchside look (web/src/components): plain
 * cards with hairline borders and square-ish corners on turf-tinted greys, lead panels edged
 * in pitch green, condensed capitals for section titles and scoreboard numbers. Sizes are a
 * little larger than the site's for touch.
 */

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Anything on screen that can say where it is, e.g. a View or a TextInput. */
type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type Reveal = (target: Measurable | null | undefined) => void;

const RevealContext = createContext<Reveal>(() => {});

/**
 * Scrolls the screen so `target` (a field, and whatever opens under it) sits above the
 * keyboard. Does nothing while the keyboard is down.
 */
export const useReveal = () => useContext(RevealContext);

export function Screen({ children, refresh }: { children: ReactNode; refresh?: React.ReactElement<RefreshControlProps> }) {
  const c = useColors();
  const frame = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  // Where the keyboard's top edge is on screen, while it's up.
  const keyboardTop = useRef<number | null>(null);
  // How much of the screen the keyboard covers: room added under the content, so the last
  // fields can still scroll up above it. The app is edge to edge, so Android doesn't resize
  // the window for the keyboard any more.
  const [covered, setCovered] = useState(0);

  const reveal = useCallback<Reveal>((target) => {
    const top = keyboardTop.current;
    if (!target || top == null || !frame.current) return;
    frame.current.measureInWindow((_x, frameTop) => {
      target.measureInWindow((_tx, y, _w, height) => {
        const hidden = y + height + space.md - top;
        // But not so far that its top goes off the top of the screen.
        const by = Math.min(hidden, y - frameTop - space.md);
        if (by > 0) scroll.current?.scrollTo({ y: offset.current + by });
      });
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const shown = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      const top = e.endCoordinates.screenY;
      keyboardTop.current = top;
      frame.current?.measureInWindow((_x, y, _w, height) => setCovered(Math.max(0, y + height - top)));
    });
    const hidden = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => {
      keyboardTop.current = null;
      setCovered(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Once there's room, bring up the field being typed in.
  useEffect(() => {
    if (covered > 0) requestAnimationFrame(() => reveal(TextInput.State.currentlyFocusedInput()));
  }, [covered, reveal]);

  return (
    <RevealContext.Provider value={reveal}>
      <View ref={frame} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 + covered }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refresh}
          onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>
      </View>
    </RevealContext.Provider>
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
    // Wide and heavy, like the site's page titles. The cut is 800 only, so no fontWeight.
    title: { fontFamily: FONT_TITLE, fontSize: 26, letterSpacing: -0.4, color: c.text },
    heading: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2, color: c.text },
    body: { fontSize: 16, color: c.text },
    muted: { fontSize: 14, lineHeight: 20, color: c.muted },
    small: { fontSize: 13, lineHeight: 18, color: c.muted },
    label: { fontSize: 14, fontWeight: "600", color: c.text },
  };
  return (
    <Text style={[base[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/** A screen's own title, wide like the site's, with a line under it. For screens without a header bar. */
export function PageTitle({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <T variant="title">{title}</T>
      {description && <T variant="muted">{description}</T>}
    </View>
  );
}

/**
 * A section's title, in condensed capitals like a matchday programme's, with a hairline running
 * off to the right (the site's section-title, as on its results by day).
 */
export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionTitle} accessibilityRole="header">
      <Text style={{ fontFamily: FONT_SECTION, fontSize: 16, lineHeight: 18, letterSpacing: 0.2, textTransform: "uppercase", color: c.muted }}>{children}</Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
      {action}
    </View>
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

/** A screen's lead panel, edged in pitch green like the site's header: the scoreboard, a match's teams. */
export function HeaderPanel({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, borderTopColor: c.pitch, borderTopWidth: 3 }, style]}>{children}</View>;
}

/** A list in one card, rows split by hairlines, like the site's results table. */
export function List({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  const rows = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <View style={[styles.list, { backgroundColor: c.card, borderColor: c.border }, style]}>
      {rows.map((row, i) => (
        <View key={i} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** A number in scoreboard type: condensed and heavy, figures all one width. */
export function Score({ children, size = 24, color, style }: { children: ReactNode; size?: number; color?: string; style?: TextStyle }) {
  const c = useColors();
  return <Text style={[{ fontFamily: FONT_SCORE, fontSize: size, lineHeight: size * 1.05, fontVariant: ["tabular-nums"], color: color ?? c.text }, style]}>{children}</Text>;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** A day as a small calendar leaf, "SAT", "19", "SEP", like the site's DateTile. Takes "2026-09-19". */
export function DateTile({ date }: { date: string }) {
  const c = useColors();
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const day = new Date(y, m - 1, d);
  const small: TextStyle = { fontSize: 10, fontWeight: "600", letterSpacing: 0.6, color: c.muted };
  return (
    <View style={[styles.dateTile, { backgroundColor: c.subtle }]} importantForAccessibility="no-hide-descendants">
      <Text style={small}>{WEEKDAYS[day.getDay()]}</Text>
      <Score size={28}>{d}</Score>
      <Text style={small}>{MONTHS[m - 1]}</Text>
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
      <Text style={{ color: look.fg, fontWeight: "600", fontSize: small ? 14 : 15 }}>{title}</Text>
    </Pressable>
  );
}

const buttonLook = (c: Colors) => ({
  primary: { bg: c.primary, pressed: c.primary + "E6", fg: c.primaryText, border: c.primary },
  outline: { bg: c.card, pressed: c.subtle, fg: c.text, border: c.border },
  secondary: { bg: c.subtle, pressed: c.border, fg: c.text, border: c.subtle },
  ghost: { bg: "transparent", pressed: c.subtle, fg: c.text, border: "transparent" },
  danger: { bg: c.dangerSoft, pressed: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
});

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const c = useColors();
  const reveal = useReveal();
  const box = useRef<View>(null);
  return (
    <View ref={box} style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={c.muted}
        {...input}
        onFocus={(e) => {
          input.onFocus?.(e);
          // Moving between fields with the keyboard already up.
          reveal(box.current);
        }}
        style={[
          styles.input,
          { color: c.text, borderColor: error ? c.danger : c.input, backgroundColor: c.card },
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
      style={[styles.chip, { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primarySoft : c.card }]}
    >
      {swatch && <Swatch color={swatch} />}
      <Text style={{ color: selected ? c.primary : c.text, fontWeight: selected ? "600" : "400", fontSize: 14 }}>{label}</Text>
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

/** Switches between views of a list, like the website's tabs: the picked one raised on a muted strip. */
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
            style={[styles.tab, active && { backgroundColor: c.card, borderColor: c.border }]}
          >
            <Text style={{ fontSize: 14, fontWeight: active ? "600" : "500", color: active ? c.text : c.muted }} numberOfLines={1}>
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
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
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
          <Text style={{ color: look.title, fontWeight: "600", fontSize: 15 }}>{title}</Text>
          {typeof children === "string" ? <Text style={{ color: look.body, fontSize: 14, lineHeight: 20 }}>{children}</Text> : children}
        </View>
      </View>
      {action}
    </View>
  );
}

/** A team colour, round like the site's. */
export function Swatch({ color, size = 12 }: { color: string; size?: number }) {
  const c = useColors();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: StyleSheet.hairlineWidth, borderColor: c.text + "33" }} />;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.card, styles.empty, { borderColor: c.border, backgroundColor: c.card }]}>
      <Ionicons name={icon} size={30} color={c.muted} />
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
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  empty: { alignItems: "center", paddingVertical: space.xl * 1.5, gap: space.sm },
  dateTile: { width: 56, alignItems: "center", paddingVertical: 6, borderRadius: radius.md, gap: 2 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, minHeight: 46, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1 },
  buttonSmall: { minHeight: 34, paddingHorizontal: space.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16, fontFamily: FONT },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1 },
  tabs: { flexDirection: "row", padding: 3, borderRadius: radius.md, alignSelf: "stretch" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1, alignSelf: "flex-start" },
  banner: { borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md, borderWidth: StyleSheet.hairlineWidth },
});
