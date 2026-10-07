import { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { COLOUR_NAMES, PRESETS, TEAM_COLOURS, type WatchSetup, hasHalfTime, presetOf, setupErrors } from "@/core/setup";
import { DirectoryField } from "@/features/directory-field";
import { searchTeams, searchVenues, useListAdders } from "@/services/directory";
import { Card, Choice, Field, Row, Swatch, T } from "@/ui/kit";
import { space, useColors } from "@/ui/theme";

type NumberKey = "periods" | "periodMinutes" | "breakMinutes" | "halfTimeMinutes" | "homeCaptain" | "awayCaptain";

/**
 * The match a watch is set up with: format, teams and venue, the same fields as the
 * watch's own setup screen. Give it a `key` per match, so what's half-typed doesn't
 * carry over from one to the next.
 */
export function SetupForm({ setup, onChange }: { setup: WatchSetup; onChange: (change: Partial<WatchSetup>) => void }) {
  // Numbers as typed, so a field can be empty while it's being changed.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const errors = setupErrors(setup);
  const numberField = (key: NumberKey) => ({
    value: typed[key] ?? (setup[key] == null ? "" : String(setup[key])),
    keyboardType: "number-pad" as const,
    // Shirt numbers go up to 999; the match numbers to 90.
    maxLength: key === "homeCaptain" || key === "awayCaptain" ? 3 : 2,
    onChangeText: (v: string) => {
      const digits = v.replace(/\D/g, "");
      setTyped({ ...typed, [key]: digits });
      const captain = key === "homeCaptain" || key === "awayCaptain";
      // An empty captain means none; an empty number elsewhere is left for the check below to flag.
      onChange({ [key]: digits === "" ? (captain ? null : Number.NaN) : Number(digits) });
    },
  });
  const preset = presetOf(setup);
  const adders = useListAdders();

  return (
    <>
      <Card title="Format">
        <Choice
          value={preset?.label ?? "custom"}
          options={[...PRESETS.map((p) => ({ value: p.label, label: p.label })), { value: "custom", label: "Custom" }]}
          onChange={(label) => {
            const p = PRESETS.find((x) => x.label === label);
            if (!p) return;
            setTyped({});
            onChange({ periods: p.periods, periodMinutes: p.periodMinutes, breakMinutes: p.breakMinutes, halfTimeMinutes: p.halfTimeMinutes });
          }}
        />
        <Row style={{ gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Periods" {...numberField("periods")} error={errors.periods} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Minutes each" {...numberField("periodMinutes")} error={errors.periodMinutes} />
          </View>
        </Row>
        {setup.periods > 1 && (
          <Row style={{ gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field label={hasHalfTime(setup.periods) ? "Other breaks (min)" : "Breaks (min)"} {...numberField("breakMinutes")} error={errors.breakMinutes} />
            </View>
            {hasHalfTime(setup.periods) && (
              <View style={{ flex: 1 }}>
                <Field label="Half-time (min)" {...numberField("halfTimeMinutes")} error={errors.halfTimeMinutes} />
              </View>
            )}
          </Row>
        )}
        <Row style={{ justifyContent: "space-between" }}>
          <T>Shootout if drawn</T>
          <ShootoutSwitch value={setup.shootoutIfDrawn} onChange={(v) => onChange({ shootoutIfDrawn: v })} />
        </Row>
      </Card>

      {(["home", "away"] as const).map((side) => (
        <Card key={side} title={side === "home" ? "Home team" : "Away team"}>
          <DirectoryField
            label="Name"
            value={setup[`${side}Name`]}
            maxLength={80}
            search={searchTeams}
            icon="shield-outline"
            onChangeText={(v) => onChange({ [`${side}Name`]: v })}
            error={errors[`${side}Name`]}
          />
          <ColourPicker value={setup[`${side}Color`]} onChange={(col) => onChange({ [`${side}Color`]: col })} />
          <Field label="Captain's shirt number (optional)" {...numberField(`${side}Captain`)} error={errors[`${side}Captain`]} />
        </Card>
      ))}

      <Card title="Venue">
        <DirectoryField label="Where (optional)" value={setup.venue ?? ""} maxLength={120} search={searchVenues} add={adders.venue} icon="location-outline" onChangeText={(v) => onChange({ venue: v })} />
      </Card>
    </>
  );
}

function ColourPicker({ value, onChange }: { value: string; onChange: (colour: string) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <T variant="label">Colour: {COLOUR_NAMES[value.toUpperCase()] ?? value}</T>
      <View style={styles.wrap}>
        {TEAM_COLOURS.map((col) => {
          const chosen = value.toUpperCase() === col;
          return (
            <Pressable
              key={col}
              accessibilityRole="radio"
              accessibilityLabel={COLOUR_NAMES[col]}
              accessibilityState={{ selected: chosen }}
              onPress={() => onChange(col)}
              style={[styles.colour, { borderColor: chosen ? c.primary : "transparent" }]}
            >
              <Swatch color={col} size={28} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ShootoutSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" accessibilityLabel="Shootout if drawn" />;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  colour: { padding: 3, borderRadius: 8, borderWidth: 2 },
});
