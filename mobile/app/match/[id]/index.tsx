import { summarizeMatch } from "@fh/shared";
import * as Linking from "expo-linking";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { ONLINE, WEB_URL } from "@/config";
import { errorMessage } from "@/core/api";
import type { LocalMatch } from "@/core/store";
import { FitnessCard, PeriodTable, ScoreCard, StatsCard, StatusBadges, Timeline, formatDateTime } from "@/features/match-view";
import { sync } from "@/services";
import { type ExportKind, saveMatch, shareMatch, shareReport } from "@/services/export";
import { saveToHealthConnect, useHealthConnect } from "@/services/health";
import { useMatch } from "@/state/sync";
import { Banner, Button, Card, Empty, Row, Screen, T } from "@/ui/kit";
import { space, useColors } from "@/ui/theme";

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { row, error, reload } = useMatch(id);
  const [busy, setBusy] = useState<string | null>(null);
  const c = useColors();

  useFocusEffect(
    useCallback(() => {
      void sync.markSeen(id);
    }, [id]),
  );

  if (!row?.match.document) {
    return (
      <Screen>
        {error ? (
          <Empty icon="cloud-offline-outline" title="Couldn't load this match">
            {errorMessage(error)}
          </Empty>
        ) : (
          <ActivityIndicator color={c.primary} style={{ marginTop: space.xl }} />
        )}
        {error ? <Button title="Try again" variant="outline" onPress={reload} /> : null}
      </Screen>
    );
  }

  const { match: m, state } = row;
  const doc = m.document!;
  const summary = summarizeMatch(doc);
  const server = m.server;

  async function act(label: string, run: () => Promise<unknown>) {
    setBusy(label);
    try {
      await run();
    } catch (err) {
      Alert.alert(`Couldn't ${label.toLowerCase()}`, errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete() {
    const onlyHere = !ONLINE || m.baseRevision === null;
    Alert.alert(
      "Delete this match from the phone?",
      onlyHere
        ? "It's only on this phone, so it will be gone for good unless it's in a backup."
        : m.dirty
          ? "Changes you haven't uploaded will be lost. The uploaded version stays on the website."
          : "It stays on the website, and comes back here next time you pull to refresh.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void act("Delete", async () => {
              await sync.deleteLocal(m.id);
              router.back();
            }),
        },
      ],
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `${doc.teams.home.name} v ${doc.teams.away.name}` }} />
      <StatusBadges match={m} state={state} />

      {ONLINE && <ServerBanners match={m} state={state} act={act} busy={busy} />}
      {m.warnings.length > 0 && (
        <Banner tone="warn" icon="warning-outline" title="Worth checking">
          {m.warnings.map((w) => `• ${w.message}`).join("\n")}
        </Banner>
      )}

      <View style={{ gap: space.sm }}>
        <Button title="Edit match" icon="create-outline" onPress={() => router.push(`/match/${m.id}/edit`)} disabled={state === "conflict"} />
        {ONLINE && <PublishButtons match={m} act={act} busy={busy} />}
      </View>

      <ScoreCard doc={doc} summary={summary} />
      <Timeline doc={doc} summary={summary} />
      <PeriodTable doc={doc} summary={summary} />
      <StatsCard summary={summary} />
      {m.fitness && <FitnessCard fitness={m.fitness} footer={<HealthConnectSave match={m} act={act} busy={busy} />} />}
      <Card title="Umpires">
        <T>
          {server?.umpires.length
            ? server.umpires.map((u) => u.name).join(" and ")
            : m.umpireNames?.length
              ? m.umpireNames.join(" and ")
              : "Not recorded. Add them in Edit match."}
        </T>
      </Card>

      <ExportCard match={m} />

      {ONLINE && server && (
        <Button title="Open on the website" variant="ghost" icon="open-outline" onPress={() => Linking.openURL(server.shareUrl ?? `${WEB_URL}/matches/${m.id}`)} />
      )}
      <Button title="Delete from this phone" variant="ghost" icon="trash-outline" onPress={confirmDelete} />
    </Screen>
  );
}

type Act = (label: string, run: () => Promise<unknown>) => Promise<void>;

/** Beta: where the match stands with the server, and what to do about it. */
function ServerBanners({ match: m, state, act, busy }: { match: LocalMatch; state: string; act: Act; busy: string | null }) {
  const server = m.server;
  return (
    <>
      {state === "conflict" && m.conflict && (
        <Banner
          tone="danger"
          icon="git-compare-outline"
          title="Changed elsewhere since your edit"
          action={
            <Row>
              <Button small title="Keep mine" onPress={() => act("Keep your version", async () => { await sync.resolveConflict(m.id, "mine"); await sync.uploadPending(); })} />
              <Button small variant="outline" title="Use theirs" onPress={() => act("Use their version", () => sync.resolveConflict(m.id, "theirs"))} />
            </Row>
          }
        >
          Someone saved a newer version (revision {m.conflict.revision}), probably on the website. Keep yours to replace it, or use theirs and lose your changes.
        </Banner>
      )}
      {state === "error" && (
        <Banner tone="danger" icon="alert-circle-outline" title="The server refused this upload" action={<Button small variant="outline" title="Try again" onPress={() => act("Retry", () => sync.retry(m.id))} />}>
          {m.lastError ?? ""}
        </Banner>
      )}
      {state === "local" && (
        <Banner
          icon="phone-portrait-outline"
          title={m.baseRevision === null ? "Only on this phone" : "Your changes are only on this phone"}
          action={<Button small title={m.baseRevision === null ? "Upload" : "Upload changes"} icon="cloud-upload-outline" loading={busy === "Upload"} onPress={() => act("Upload", () => sync.requestUpload(m.id))} />}
        >
          {m.baseRevision === null
            ? "Upload it when you're ready: it then shows on the website as a draft."
            : "Upload them when you're ready, so the website has the latest version."}
        </Banner>
      )}
      {state === "pending" && (
        <Banner icon="cloud-upload-outline" title="Waiting to upload">
          It goes as soon as there&apos;s a connection.
        </Banner>
      )}
      {server?.status === "draft" && server.autoPublishAt && (
        <T variant="small">Publishes itself {formatDateTime(server.autoPublishAt)} unless you publish or unpublish it first.</T>
      )}
    </>
  );
}

/** Sends the workout to Health Connect, or says it's there. */
function HealthConnectSave({ match: m, act, busy }: { match: LocalMatch; act: Act; busy: string | null }) {
  const { status } = useHealthConnect();
  if (status !== "available" || !m.fitness?.endedAt) return null;
  if (m.healthSavedAt) return <T variant="small">Saved to Health Connect {formatDateTime(m.healthSavedAt)}.</T>;
  return (
    <Button
      title="Save to Health Connect"
      variant="outline"
      icon="fitness-outline"
      loading={busy === "Save to Health Connect"}
      onPress={() =>
        act("Save to Health Connect", async () => {
          if (!(await saveToHealthConnect(m))) Alert.alert("Not saved", "Health Connect needs your permission to save workouts from FH Match Centre.");
        })
      }
    />
  );
}

/** Beta: publishing puts the match on the website; sharing sends its link. */
function PublishButtons({ match: m, act, busy }: { match: LocalMatch; act: Act; busy: string | null }) {
  if (m.baseRevision === null) return null;
  return (
    <Row>
      {m.server?.status === "published" ? (
        <>
          <View style={{ flex: 1 }}>
            <Button title="Share link" variant="outline" icon="share-social-outline" onPress={() => router.push(`/match/${m.id}/share`)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Unpublish"
              variant="outline"
              loading={busy === "Unpublish"}
              onPress={() =>
                Alert.alert("Unpublish this match?", "The share link will show nothing, and it won't publish itself again.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Unpublish", style: "destructive", onPress: () => void act("Unpublish", () => sync.publish(m.id, false)) },
                ])
              }
            />
          </View>
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <Button title="Publish" variant="outline" icon="globe-outline" loading={busy === "Publish"} onPress={() => act("Publish", () => sync.publish(m.id, true))} />
        </View>
      )}
    </Row>
  );
}

const EXPORTS: { kind: ExportKind; title: string; detail: string; icon: "document-text-outline" | "grid-outline" | "code-slash-outline" }[] = [
  { kind: "pdf", title: "Match report (PDF)", detail: "One page: score, goals, cards and stats.", icon: "document-text-outline" },
  { kind: "csv", title: "Events (CSV)", detail: "Every event, for a spreadsheet.", icon: "grid-outline" },
  { kind: "json", title: "Match data (JSON)", detail: "Everything, for importing on another phone.", icon: "code-slash-outline" },
];

/** Getting the match off the phone: the report shared in one tap, or any file saved or shared. */
function ExportCard({ match }: { match: LocalMatch }) {
  const [busy, setBusy] = useState<ExportKind | "report" | null>(null);

  async function sendReport() {
    setBusy("report");
    try {
      await shareReport(match);
    } catch (err) {
      Alert.alert("Couldn't share the report", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function run(kind: ExportKind, how: "save" | "share") {
    setBusy(kind);
    try {
      if (how === "share") await shareMatch(match, kind);
      else if (await saveMatch(match, kind)) Alert.alert("Saved", "The file is in the folder you chose.");
    } catch (err) {
      Alert.alert("Couldn't export the match", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function choose(kind: ExportKind, title: string) {
    Alert.alert(title, undefined, [
      { text: "Save to phone", onPress: () => void run(kind, "save") },
      { text: "Share", onPress: () => void run(kind, "share") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <Card title="Save or share">
      <View style={{ gap: 2 }}>
        <Button title="Share report" icon="share-social-outline" loading={busy === "report"} onPress={() => void sendReport()} />
        <T variant="small">The PDF, by WhatsApp, email, Quick Share or any app.</T>
      </View>
      {EXPORTS.map((e) => (
        <View key={e.kind} style={{ gap: 2 }}>
          <Button title={e.title} variant="outline" icon={e.icon} loading={busy === e.kind} onPress={() => choose(e.kind, e.title)} />
          <T variant="small">{e.detail}</T>
        </View>
      ))}
    </Card>
  );
}
