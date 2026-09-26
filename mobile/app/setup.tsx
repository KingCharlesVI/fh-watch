import Storage from "expo-sqlite/kv-store";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import {
  COLOUR_NAMES,
  PRESETS,
  TEAM_COLOURS,
  type WatchSetup,
  hasHalfTime,
  presetOf,
  readSavedSetup,
  setupErrors,
  setupMessage,
} from "@/core/setup";
import { WatchSync, useConnectedWatches, watchSyncAvailable } from "@/services/watch";
import { Banner, Button, Card, Choice, Field, Row, Screen, Swatch, T } from "@/ui/kit";
import { space, useColors } from "@/ui/theme";

const SAVED_KEY = "lastWatchSetup";

/**
 * Setup on phone: type the teams and format here instead of on the watch, then send
 * them to the watch, which opens its setup screen with them to check and start.
 * The watch opens this screen (fhmatchcentre://setup); Settings has a way in too.
 */
export default function SetupScreen() {
  const watches = useConnectedWatches();
  const [setup, setSetup] = useState<WatchSetup | null>(null);
  // Numbers as typed, so a field can be empty while it's being changed.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"sent" | "noWatch" | "failed" | null>(null);

  // Starts from the last setup sent: often the same teams and format.
  useEffect(() => {
    Storage.getItem(SAVED_KEY)
      .catch(() => null)
      .then((saved) => setSetup(readSavedSetup(saved)));
  }, []);

  if (!setup) return <Screen>{null}</Screen>;

  const errors = setupErrors(setup);
  const update = (change: Partial<WatchSetup>) => {
    setSetup({ ...setup, ...change });
    setResult(null);
  };
  const numberField = (key: "periods" | "periodMinutes" | "breakMinutes" | "halfTimeMinutes" | "homeCaptain" | "awayCaptain") => ({
    value: typed[key] ?? (setup[key] == null ? "" : String(setup[key])),
    keyboardType: "number-pad" as const,
    maxLength: 2,
    onChangeText: (v: string) => {
      const digits = v.replace(/\D/g, "");
      setTyped({ ...typed, [key]: digits });
      const captain = key === "homeCaptain" || key === "awayCaptain";
      // An empty captain means none; an empty number elsewhere is left for the check below to flag.
      update({ [key]: digits === "" ? (captain ? null : Number.NaN) : Number(digits) });
    },
  });

  async function send() {
    if (!setup) return;
    setSending(true);
    try {
      const got = await WatchSync.sendSetup(setupMessage(setup));
      if (got > 0) await Storage.setItem(SAVED_KEY, JSON.stringify(setup)).catch(() => {});
      setResult(got > 0 ? "sent" : "noWatch");
    } catch {
      setResult("failed");
    } finally {
      setSending(false);
    }
  }

  const preset = presetOf(setup);
  const ready = Object.keys(errors).length === 0;

  return (
    <Screen>
      {!watchSyncAvailable ? (
        <Banner tone="warn" icon="watch-outline" title="Only with a Wear OS watch">
          Setting up on the phone arrives for Apple Watch with the watchOS app.
        </Banner>
      ) : watches !== null && watches.length === 0 ? (
        <Banner tone="warn" icon="watch-outline" title="No watch in reach">
          Keep your watch near the phone with Bluetooth on to send the setup.
        </Banner>
      ) : null}

      <Card title="Format">
        <Choice
          value={preset?.label ?? "custom"}
          options={[...PRESETS.map((p) => ({ value: p.label, label: p.label })), { value: "custom", label: "Custom" }]}
          onChange={(label) => {
            const p = PRESETS.find((x) => x.label === label);
            if (!p) return;
            setTyped({});
            update({ periods: p.periods, periodMinutes: p.periodMinutes, breakMinutes: p.breakMinutes, halfTimeMinutes: p.halfTimeMinutes });
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
          <ShootoutSwitch value={setup.shootoutIfDrawn} onChange={(v) => update({ shootoutIfDrawn: v })} />
        </Row>
      </Card>

      {(["home", "away"] as const).map((side) => (
        <Card key={side} title={side === "home" ? "Home team" : "Away team"}>
          <Field label="Name" value={setup[`${side}Name`]} maxLength={80} onChangeText={(v) => update({ [`${side}Name`]: v })} error={errors[`${side}Name`]} />
          <ColourPicker value={setup[`${side}Color`]} onChange={(col) => update({ [`${side}Color`]: col })} />
          <Field label="Captain's shirt number (optional)" {...numberField(`${side}Captain`)} error={errors[`${side}Captain`]} />
        </Card>
      ))}

      <Card title="Venue">
        <Field label="Where (optional)" value={setup.venue ?? ""} maxLength={120} onChangeText={(v) => update({ venue: v })} />
      </Card>

      {result === "sent" && (
        <Banner tone="primary" icon="checkmark-circle-outline" title="Sent to your watch">
          Check it there and tap Ready to start.
        </Banner>
      )}
      {result === "noWatch" && (
        <Banner tone="warn" icon="watch-outline" title="No watch got it">
          Keep your watch near the phone with Bluetooth on, paired in its app (Galaxy Wearable or Pixel Watch), then send again.
        </Banner>
      )}
      {result === "failed" && <Banner tone="danger" icon="alert-circle-outline" title="Couldn't send to the watch" />}
      <Button title="Send to watch" icon="watch-outline" onPress={send} loading={sending} disabled={!ready || !watchSyncAvailable} />
    </Screen>
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
