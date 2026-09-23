import { summarizeMatch } from "@fh/shared";
import * as Linking from "expo-linking";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { WEB_URL } from "@/config";
import { errorMessage } from "@/core/api";
import { PeriodTable, ScoreCard, StatsCard, StatusBadges, Timeline, formatDateTime } from "@/features/match-view";
import { sync } from "@/services";
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

  return (
    <Screen>
      <Stack.Screen options={{ title: `${doc.teams.home.name} v ${doc.teams.away.name}` }} />
      <StatusBadges match={m} state={state} />

      {state === "conflict" && m.conflict && (
        <Banner
          tone="danger"
          icon="git-compare-outline"
          title="Changed elsewhere since your edit"
          action={
            <Row>
              <Button small title="Keep mine" onPress={() => act("Keep your version", async () => { await sync.resolveConflict(m.id, "mine"); await sync.uploadPending({ force: true }); })} />
              <Button small variant="outline" title="Use theirs" onPress={() => act("Use their version", () => sync.resolveConflict(m.id, "theirs"))} />
            </Row>
          }
        >
          Someone saved a newer version (revision {m.conflict.revision}), probably on the website. Keep yours to replace it, or use theirs and lose your changes.
        </Banner>
      )}
      {state === "error" && (
        <Banner tone="danger" icon="alert-circle-outline" title="The server refused this upload" action={<Button small variant="outline" title="Try again" onPress={() => act("Retry", async () => { await sync.retry(m.id); await sync.uploadPending({ force: true }); })} />}>
          {m.lastError ?? ""}
        </Banner>
      )}
      {state === "pending" && (
        <Banner icon="cloud-upload-outline" title="Saved on this phone">
          It uploads as soon as there&apos;s a connection.
        </Banner>
      )}
      {m.warnings.length > 0 && (
        <Banner tone="warn" icon="warning-outline" title="Worth checking">
          {m.warnings.map((w) => `• ${w.message}`).join("\n")}
        </Banner>
      )}
      {server?.status === "draft" && server.autoPublishAt && (
        <T variant="small">Publishes itself {formatDateTime(server.autoPublishAt)} unless you publish or unpublish it first.</T>
      )}

      <View style={{ gap: space.sm }}>
        <Button title="Edit match" icon="create-outline" onPress={() => router.push(`/match/${m.id}/edit`)} disabled={state === "conflict"} />
        <Row>
          {server?.status === "published" ? (
            <>
              <View style={{ flex: 1 }}>
                <Button title="Share" variant="outline" icon="share-social-outline" onPress={() => router.push(`/match/${m.id}/share`)} />
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
      </View>

      <ScoreCard doc={doc} summary={summary} />
      <Timeline doc={doc} summary={summary} />
      <PeriodTable doc={doc} summary={summary} />
      <StatsCard summary={summary} />
      <Card title="Umpires">
        <T>{server?.umpires.length ? server.umpires.map((u) => u.name).join(" and ") : "You (not uploaded yet)"}</T>
      </Card>
      {server && <Button title="Open on the website" variant="ghost" icon="open-outline" onPress={() => Linking.openURL(server.shareUrl ?? `${WEB_URL}/matches/${m.id}`)} />}
    </Screen>
  );
}
