import {
  CARD_REASONS,
  type CardReason,
  type EventInput,
  type MatchDocument,
  type TeamSide,
  type TeamWithClub,
  addEvent,
  buildEvent,
  cancelEvent,
  describeEvent,
  eventTime,
  parseMatch,
  periodLabel,
  restoreEvent,
  setCardReason,
  sortChronologically,
  summarizeMatch,
  voidedSeqs,
} from "@fh/shared";
import { Stack, router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/api";
import { TEAM_COLOURS } from "@/core/setup";
import { ONLINE } from "@/config";
import { DirectoryField } from "@/features/directory-field";
import { api, sync } from "@/services";
import { searchCompetitions, searchVenues, useListAdders } from "@/services/directory";
import { useMatch } from "@/state/sync";
import { Badge, Banner, Button, Card, Choice, Field, Row, Screen, Swatch, T, Text } from "@/ui/kit";
import { space, useColors } from "@/ui/theme";


export default function EditMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { row } = useMatch(id);
  const saved = row?.match.document ?? null;
  const [doc, setDoc] = useState<MatchDocument | null>(null);
  // Alpha keeps umpire names on the phone; beta has the server's umpire list instead.
  const savedUmpires = row?.match.umpireNames ?? [];
  const [umpires, setUmpires] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const navigation = useNavigation();
  const adders = useListAdders();

  useEffect(() => {
    if (saved && !doc) setDoc(saved);
  }, [saved, doc]);
  useEffect(() => {
    if (row && !umpires) setUmpires(row.match.umpireNames ?? []);
  }, [row, umpires]);

  const docDirty = !!doc && !!saved && JSON.stringify(doc) !== JSON.stringify(saved);
  const umpiresDirty = !!umpires && JSON.stringify(umpires.map((u) => u.trim()).filter(Boolean)) !== JSON.stringify(savedUmpires);
  const dirty = docDirty || umpiresDirty;
  const check = useMemo(() => (doc ? parseMatch(doc) : null), [doc]);
  const errors = check && !check.ok ? check.errors.map((e) => e.message) : [];

  // Leaving with unsaved changes asks first.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty && !saving;
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (!dirtyRef.current) return;
        e.preventDefault();
        Alert.alert("Discard your changes?", "They haven't been saved.", [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation],
  );

  if (!doc || !saved) return <Screen>{null}</Screen>;

  const update = (change: (d: MatchDocument) => void) =>
    setDoc((d) => {
      const next = JSON.parse(JSON.stringify(d)) as MatchDocument;
      change(next);
      return next;
    });

  async function save() {
    setSaving(true);
    if (docDirty) {
      const res = await sync.saveEdit(id, doc!);
      if (!res.ok) {
        setSaving(false);
        Alert.alert("Can't save yet", res.errors.join("\n"));
        return;
      }
    }
    if (umpiresDirty) await sync.setUmpireNames(id, umpires!);
    router.back();
  }

  const summary = summarizeMatch(doc);
  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => <Button small title="Save" onPress={save} disabled={!dirty || errors.length > 0} loading={saving} />,
        }}
      />
      <Card style={{ paddingVertical: space.md }}>
        <T variant="muted">
          Score now: <Text style={{ fontWeight: "700" }}>{doc.teams.home.name} {summary.score.home}–{summary.score.away} {doc.teams.away.name}</Text>
        </T>
      </Card>
      {errors.length > 0 && (
        <Banner tone="danger" icon="alert-circle-outline" title="Fix these before saving">
          {errors.map((e) => `• ${e}`).join("\n")}
        </Banner>
      )}

      <TeamEditor side="home" doc={doc} update={update} />
      <TeamEditor side="away" doc={doc} update={update} />

      <Card title="Details">
        <DirectoryField
          label="Competition"
          value={doc.competition ?? ""}
          maxLength={120}
          search={searchCompetitions}
          add={adders.competition}
          icon="trophy-outline"
          onChangeText={(v) => update((d) => void (d.competition = v || null))}
        />
        <DirectoryField
          label="Venue"
          value={doc.venue ?? ""}
          maxLength={120}
          search={searchVenues}
          add={adders.venue}
          icon="location-outline"
          onChangeText={(v) => update((d) => void (d.venue = v || null))}
        />
      </Card>

      {ONLINE ? <UmpiresCard id={id} /> : <LocalUmpires names={umpires ?? []} onChange={setUmpires} />}
      <EventsCard doc={doc} saved={saved} onChange={setDoc} />
      <Button title="Save changes" icon="save-outline" onPress={save} disabled={!dirty || errors.length > 0} loading={saving} />
    </Screen>
  );
}

type Update = (change: (d: MatchDocument) => void) => void;

function TeamEditor({ side, doc, update }: { side: TeamSide; doc: MatchDocument; update: Update }) {
  const team = doc.teams[side];
  return (
    <Card title={side === "home" ? "Home team" : "Away team"}>
      <Field label="Name shown" value={team.name} maxLength={80} onChangeText={(v) => update((d) => void (d.teams[side].name = v))} />
      <View style={{ gap: space.xs }}>
        <T variant="label">Colour</T>
        <View style={styles.wrap}>
          {TEAM_COLOURS.map((col) => (
            <Pressable
              key={col}
              accessibilityLabel={`Colour ${col}`}
              accessibilityState={{ selected: team.color.toUpperCase() === col }}
              onPress={() => update((d) => void (d.teams[side].color = col))}
              style={[styles.colour, { borderColor: team.color.toUpperCase() === col ? "#1F6F43" : "transparent" }]}
            >
              <Swatch color={col} size={26} />
            </Pressable>
          ))}
        </View>
      </View>
      <Field
        label="Captain's shirt number"
        value={team.captain == null ? "" : String(team.captain)}
        keyboardType="number-pad"
        maxLength={3}
        onChangeText={(v) => update((d) => void (d.teams[side].captain = v === "" ? null : Number(v)))}
      />
      {ONLINE && (
        <View style={{ gap: space.xs }}>
          <T variant="label">Club team</T>
          {team.teamId ? (
            <Row style={{ justifyContent: "space-between" }}>
              <Badge label="Linked to a club team" tone="primary" icon="link-outline" />
              <Button small variant="ghost" title="Unlink" onPress={() => update((d) => void (d.teams[side].teamId = null))} />
            </Row>
          ) : (
            <TeamSearch
              onPick={(t) =>
                update((d) => {
                  d.teams[side].teamId = t.id;
                  d.teams[side].name = `${t.club.name} ${t.name}`;
                })
              }
            />
          )}
        </View>
      )}
    </Card>
  );
}

/** Alpha: umpire names, kept on the phone and printed on the match report. */
function LocalUmpires({ names, onChange }: { names: string[]; onChange: (names: string[]) => void }) {
  const set = (i: number, value: string) => {
    const next = [names[0] ?? "", names[1] ?? ""];
    next[i] = value;
    onChange(next);
  };
  return (
    <Card title="Umpires">
      <Field label="Umpire 1 (you)" value={names[0] ?? ""} maxLength={80} onChangeText={(v) => set(0, v)} autoCapitalize="words" />
      <Field label="Umpire 2" value={names[1] ?? ""} maxLength={80} onChangeText={(v) => set(1, v)} autoCapitalize="words" />
    </Card>
  );
}

/** Searches the club directory as you type (needs a connection). */
function TeamSearch({ onPick }: { onPick: (t: TeamWithClub) => void }) {
  const c = useColors();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TeamWithClub[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchTeams(q.trim());
        if (live) {
          setResults(res.items);
          setProblem(null);
        }
      } catch (err) {
        if (live) setProblem(errorMessage(err));
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
  return (
    <View style={{ gap: space.xs }}>
      <Field label="Link to a club team" value={q} onChangeText={setQ} placeholder="Search, e.g. Hawks M1" autoCorrect={false} hint="Linking puts the match on the club's pages." />
      {problem && <T variant="small" style={{ color: c.danger }}>{problem}</T>}
      {results.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => {
            onPick(t);
            setQ("");
            setResults([]);
          }}
          style={[styles.result, { borderColor: c.border }]}
        >
          <Text style={{ color: c.text }}>
            {t.club.name} {t.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function UmpiresCard({ id }: { id: string }) {
  const { row } = useMatch(id);
  const c = useColors();
  const umpires = row?.match.server?.umpires ?? [];
  const second = umpires.find((u) => u.slot === 2);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; displayName: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    let live = true;
    const timer = setTimeout(async () => {
      const res = await api.searchUmpires(q.trim()).catch(() => ({ items: [] }));
      if (live) setResults(res.items);
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  async function set(value: { userId: string } | { name: string } | null) {
    setBusy(true);
    try {
      await sync.setSecondUmpire(id, value);
      setQ("");
      setResults([]);
    } catch (err) {
      Alert.alert("Couldn't change umpire 2", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Umpires">
      <T variant="small">Changes here save straight away and need a connection.</T>
      <T>Umpire 1: {umpires.find((u) => u.slot === 1)?.name ?? "You"}</T>
      {second ? (
        <Row style={{ justifyContent: "space-between" }}>
          <T>
            Umpire 2: {second.name}
            {second.userId ? "" : " (not registered)"}
          </T>
          <Button small variant="ghost" title="Remove" onPress={() => set(null)} loading={busy} />
        </Row>
      ) : (
        <>
          <Field label="Add umpire 2" value={q} onChangeText={setQ} placeholder="Search registered umpires, or type a name" autoCorrect={false} />
          {results.map((u) => (
            <Pressable key={u.id} onPress={() => set({ userId: u.id })} style={[styles.result, { borderColor: c.border }]}>
              <Text style={{ color: c.text }}>{u.displayName}</Text>
            </Pressable>
          ))}
          {q.trim().length > 0 && <Button small variant="outline" title={`Add “${q.trim()}” (not registered)`} onPress={() => set({ name: q.trim() })} loading={busy} />}
        </>
      )}
    </Card>
  );
}

function EventsCard({ doc, saved, onChange }: { doc: MatchDocument; saved: MatchDocument; onChange: (d: MatchDocument) => void }) {
  const c = useColors();
  const savedSeqs = useMemo(() => new Set(saved.events.map((e) => e.seq)), [saved]);
  const voided = voidedSeqs(doc);
  // The card whose reason is being picked, if any.
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const shown = sortChronologically(doc.events.filter((e) => e.type !== "void" && e.type !== "period_start" && e.type !== "period_end"));

  return (
    <Card title="Events">
      <T variant="small">Cancelling keeps the event in the record, crossed out, so the watch&apos;s original is never lost.</T>
      {shown.map((e) => {
        const isVoided = voided.has(e.seq);
        const struck = isVoided ? { textDecorationLine: "line-through" as const, color: c.muted } : null;
        return (
          <View key={e.seq}>
            <View style={[styles.event, { borderTopColor: c.border }]}>
              <Text style={[{ width: 64, color: c.muted, fontVariant: ["tabular-nums"] }, struck]}>{eventTime(e, doc.settings)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: c.text }, struck]}>{describeEvent(e, doc.settings)}</Text>
                {"team" in e && (
                  <Text style={[{ color: c.muted, fontSize: 13 }, struck]}>
                    {doc.teams[e.team].name}
                    {"player" in e && e.player !== undefined ? ` · #${e.player}` : ""}
                  </Text>
                )}
              </View>
              {e.type === "card" && !isVoided && (
                <Button small variant="ghost" title="Reason" onPress={() => setReasonFor(reasonFor === e.seq ? null : e.seq)} />
              )}
              {isVoided ? (
                <Button small variant="ghost" title="Restore" onPress={() => onChange(restoreEvent(doc, e.seq))} />
              ) : (
                <Button small variant="ghost" title={savedSeqs.has(e.seq) ? "Cancel" : "Remove"} onPress={() => onChange(cancelEvent(doc, e.seq, savedSeqs))} />
              )}
            </View>
            {e.type === "card" && reasonFor === e.seq && (
              <View style={{ paddingVertical: space.sm }}>
                <ReasonChoice
                  value={e.reason}
                  onChange={(reason) => {
                    onChange(setCardReason(doc, e.seq, reason ?? null));
                    setReasonFor(null);
                  }}
                />
              </View>
            )}
          </View>
        );
      })}
      <AddEvent doc={doc} onAdd={(ev) => onChange(addEvent(doc, ev))} />
    </Card>
  );
}

/** Why a card was given, or "Not recorded". */
function ReasonChoice({ value, onChange }: { value: CardReason | undefined; onChange: (reason: CardReason | undefined) => void }) {
  return (
    <Choice
      label="Why"
      value={value ?? "none"}
      onChange={(v) => onChange(v === "none" ? undefined : v)}
      options={[
        { value: "none" as const, label: "Not recorded" },
        ...(Object.entries(CARD_REASONS) as [CardReason, string][]).map(([v, label]) => ({ value: v, label })),
      ]}
    />
  );
}

function AddEvent({ doc, onAdd }: { doc: MatchDocument; onAdd: Parameters<typeof addEvent>[1] extends infer E ? (e: E) => void : never }) {
  const { settings } = doc;
  const c = useColors();
  const [input, setInput] = useState<EventInput>({ type: "goal", team: "home", period: 1, clock: "", player: "", color: "green" });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<EventInput>) => setInput((i) => ({ ...i, ...patch }));

  function add() {
    const built = buildEvent(input, settings);
    if ("error" in built) return setError(built.error);
    onAdd(built.event);
    setError(null);
    set({ player: "", text: "", clock: "" });
  }

  return (
    <View style={[styles.add, { borderColor: c.border, backgroundColor: c.background }]}>
      <T variant="heading">Add an event</T>
      <Choice
        value={input.type}
        onChange={(type) => set({ type })}
        options={[
          { value: "goal", label: "Goal" },
          { value: "card", label: "Card" },
          { value: "note", label: "Note" },
        ]}
      />
      {input.type !== "note" && (
        <Choice
          label="Team"
          value={input.team}
          onChange={(team) => set({ team })}
          options={[
            { value: "home", label: doc.teams.home.name, swatch: doc.teams.home.color },
            { value: "away", label: doc.teams.away.name, swatch: doc.teams.away.color },
          ]}
        />
      )}
      <Choice
        label="Period"
        value={input.period}
        onChange={(period) => set({ period })}
        options={Array.from({ length: settings.periods }, (_, i) => ({ value: i + 1, label: periodLabel(settings.periods, i + 1) }))}
      />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label={input.type === "note" ? "Clock (optional)" : "Clock"} value={input.clock} onChangeText={(clock) => set({ clock })} placeholder="12:30" keyboardType="numbers-and-punctuation" />
        </View>
        {(input.type === "goal" || input.type === "card") && (
          <View style={{ flex: 1 }}>
            <Field label="Shirt number" value={input.player} onChangeText={(player) => set({ player })} keyboardType="number-pad" maxLength={3} />
          </View>
        )}
      </Row>
      {input.type === "goal" && (
        <Choice
          label="How"
          value={input.method ?? "none"}
          onChange={(m) => set({ method: m === "none" ? undefined : m })}
          options={[
            { value: "none", label: "Not recorded" },
            { value: "field", label: "Field" },
            { value: "pc", label: "Corner" },
            { value: "ps", label: "Stroke" },
          ]}
        />
      )}
      {input.type === "card" && (
        <>
          <Choice
            label="Card"
            value={input.color ?? "green"}
            onChange={(color) => set({ color })}
            options={[
              { value: "green", label: "Green", swatch: "#2E9E44" },
              { value: "yellow", label: "Yellow", swatch: "#F2C230" },
              { value: "red", label: "Red", swatch: "#D93A2B" },
            ]}
          />
          {input.color === "yellow" && (
            <Choice
              label="Suspension"
              value={input.yellowLong ? "long" : "short"}
              onChange={(v) => set({ yellowLong: v === "long" })}
              options={[
                { value: "short", label: `${settings.cardDurationsSec.yellowShort / 60} min` },
                { value: "long", label: `${settings.cardDurationsSec.yellowLong / 60} min` },
              ]}
            />
          )}
          <ReasonChoice value={input.reason} onChange={(reason) => set({ reason })} />
        </>
      )}
      {input.type === "note" && <Field label="Note" value={input.text ?? ""} onChangeText={(text) => set({ text })} multiline maxLength={1000} />}
      {error && <T variant="small" style={{ color: c.danger }}>{error}</T>}
      <Button title="Add event" variant="outline" icon="add" onPress={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  colour: { padding: 3, borderRadius: 8, borderWidth: 2 },
  result: { paddingVertical: 10, paddingHorizontal: space.md, borderWidth: 1, borderRadius: 8 },
  event: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  add: { gap: space.md, padding: space.md, borderRadius: 12, borderWidth: 1, marginTop: space.sm },
});
