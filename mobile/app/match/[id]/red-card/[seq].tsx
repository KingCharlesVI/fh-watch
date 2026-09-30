import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/api";
import {
  AREAS,
  type RedCardReport,
  RED_CARD_FORM_URL,
  type ReporterDetails,
  draftReport,
  missingAnswers,
  offenceSummary,
  redCards,
  reportAnswers,
  reportText,
} from "@/core/red-card";
import { formatDateTime } from "@/features/match-view";
import { sync } from "@/services";
import { loadReporter, saveReporter, shareRedCardReport } from "@/services/red-card";
import { useMatch } from "@/state/sync";
import { Banner, Button, Card, Choice, Field, Ionicons, Screen, T, Text } from "@/ui/kit";
import { space, useColors } from "@/ui/theme";

/**
 * The report for one red card, for England Hockey's online form: filled in from the
 * match where it can be, saved as it's typed, then copied into the form answer by
 * answer, or shared as a PDF.
 */
export default function RedCardReportScreen() {
  const { id, seq } = useLocalSearchParams<{ id: string; seq: string }>();
  const { row } = useMatch(id);
  const m = row?.match;
  const card = m?.document ? redCards(m.document).find((c) => c.seq === Number(seq)) : undefined;
  const [me, setMe] = useState<ReporterDetails | null>(null);
  const [report, setReport] = useState<RedCardReport | null>(null);
  const [sharing, setSharing] = useState(false);
  const c = useColors();

  useEffect(() => {
    void loadReporter().then(setMe);
  }, []);
  useEffect(() => {
    if (report || !m || !card || !me) return;
    setReport(m.redCardReports?.find((r) => r.cardSeq === card.seq) ?? draftReport(m, card, me, new Date()));
  }, [report, m, card, me]);

  // Saved a moment after typing stops, so nothing is lost if the umpire leaves.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ report: RedCardReport; me: ReporterDetails } | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pending = latest.current;
    latest.current = null;
    if (pending) {
      void sync.saveRedCardReport(id, pending.report);
      void saveReporter(pending.me);
    }
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m?.document || !card) {
    return (
      <Screen>
        {m?.document ? <T>This red card isn&apos;t in the match any more.</T> : <ActivityIndicator color={c.primary} style={{ marginTop: space.xl }} />}
      </Screen>
    );
  }
  if (!report || !me) return <Screen>{null}</Screen>;

  const doc = m.document;
  const answers = reportAnswers(doc, card, report, me);
  const missing = missingAnswers(answers);

  function change(next: { report?: Partial<RedCardReport>; me?: Partial<ReporterDetails> }) {
    const r = { ...report!, ...next.report, updatedAt: new Date().toISOString() };
    const details = { ...me!, ...next.me };
    setReport(r);
    setMe(details);
    latest.current = { report: r, me: details };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }

  async function copy(text: string) {
    await Clipboard.setStringAsync(text);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "Red card report" }} />
      <Card>
        <T>
          {doc.teams[card.team].name}
          {card.player !== undefined ? ` #${card.player}` : ""} · {offenceSummary(doc, card)}
        </T>
        <T variant="small">Everything here stays on this phone. Fill it in, then copy each answer into England Hockey&apos;s form.</T>
      </Card>

      {report.submittedAt && (
        <Banner tone="primary" icon="checkmark-circle-outline" title="Submitted">
          Marked as sent to England Hockey {formatDateTime(report.submittedAt)}.
        </Banner>
      )}

      <Card title="You">
        <Field label="Name" value={me.name} onChangeText={(name) => change({ me: { name } })} autoComplete="name" />
        <Field label="Umpiring qualification" value={me.qualification} onChangeText={(qualification) => change({ me: { qualification } })} placeholder="e.g. England Hockey Level 1" />
        <Field label="Contact details" value={me.contact} onChangeText={(contact) => change({ me: { contact } })} placeholder="Email and phone" />
        <T variant="small">Remembered for your next report.</T>
      </Card>

      <Card title="Your colleague">
        <Field label="Name" value={report.colleague} onChangeText={(colleague) => change({ report: { colleague } })} autoComplete="name" />
      </Card>

      <Card title="Offender and club">
        <Field label="Name of offender" value={report.offenderName} onChangeText={(offenderName) => change({ report: { offenderName } })} />
        <Field label="Shirt number" value={report.shirtNumber} onChangeText={(shirtNumber) => change({ report: { shirtNumber } })} keyboardType="number-pad" />
        <Choice
          label="Age"
          value={report.under18 === null ? "unknown" : report.under18 ? "under" : "over"}
          options={[
            { value: "over", label: "Over 18" },
            { value: "under", label: "Under 18" },
          ]}
          onChange={(v) => change({ report: { under18: v === "under" } })}
        />
        <Field
          label="Club"
          value={report.club}
          onChangeText={(club) => change({ report: { club } })}
          hint="The offender's club must give you their details. For a schools or representative match, the form's club list has Other."
        />
        <Field label="Team" value={report.team} onChangeText={(team) => change({ report: { team } })} placeholder="e.g. Men's 1s" />
      </Card>

      <Card title="Competition and match">
        <T>Date: {answers.find((a) => a.label === "Date of match")!.value}</T>
        <Choice label="Area" value={report.area} options={AREAS.map((a) => ({ value: a as string, label: a }))} onChange={(area) => change({ report: { area } })} />
        <Field label="League and division" value={report.league} onChangeText={(league) => change({ report: { league } })} />
        <Field label="Fixture" value={report.fixture} onChangeText={(fixture) => change({ report: { fixture } })} hint="e.g. ABC Men's 1s vs. XYZ Men's 2s" />
      </Card>

      <Card title="Details of offence">
        <T variant="small">The time and reason from the match go in first: {offenceSummary(doc, card)}.</T>
        <Field
          label="What happened"
          value={report.details}
          onChangeText={(details) => change({ report: { details } })}
          multiline
          placeholder="What you saw, in order, and what was said"
        />
      </Card>

      <Card title="Send it">
        {missing.length > 0 && (
          <Banner tone="warn" icon="list-outline" title={`${missing.length} still to fill in`}>
            {missing.map((a) => a.label).join(", ")}
          </Banner>
        )}
        <Button title="Open England Hockey's form" icon="open-outline" onPress={() => void Linking.openURL(RED_CARD_FORM_URL)} />
        <T variant="small">Tap an answer to copy it, then paste it into the form.</T>
        {answers.map((a, i) => (
          <Pressable
            key={`${a.section}-${a.label}`}
            onPress={() => void copy(a.value)}
            disabled={!a.value}
            accessibilityLabel={`Copy ${a.label}`}
            style={[styles.answer, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <View style={{ flex: 1 }}>
              <T variant="small">{a.label}</T>
              <Text style={{ color: a.value ? c.text : c.muted }} numberOfLines={3}>
                {a.value || "Not filled in"}
              </Text>
            </View>
            {a.value ? <Ionicons name="copy-outline" size={18} color={c.muted} /> : null}
          </Pressable>
        ))}
        <Button
          title="Share as PDF"
          variant="outline"
          icon="share-outline"
          loading={sharing}
          onPress={async () => {
            flush();
            setSharing(true);
            try {
              await shareRedCardReport(doc, answers);
            } catch (err) {
              Alert.alert("Couldn't share the report", errorMessage(err));
            } finally {
              setSharing(false);
            }
          }}
        />
        <Button title="Copy it all as text" variant="outline" icon="copy-outline" onPress={() => void copy(reportText(answers))} />
        <Button
          title={report.submittedAt ? "Mark as not submitted" : "Mark as submitted"}
          variant="ghost"
          icon={report.submittedAt ? "arrow-undo-outline" : "checkmark-done-outline"}
          onPress={() => {
            change({ report: { submittedAt: report.submittedAt ? null : new Date().toISOString() } });
            flush();
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  answer: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 8 },
});
