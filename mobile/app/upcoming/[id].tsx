import { randomUUID } from "expo-crypto";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { LAST_SETUP_KEY, type WatchSetup, readSavedSetup, setupErrors, setupMessage } from "@/core/setup";
import type { UpcomingMatch } from "@/core/upcoming";
import { SetupForm } from "@/features/setup-form";
import { WhenFields } from "@/features/when-fields";
import { WatchSync, useConnectedWatches, watchSyncAvailable } from "@/services/watch";
import { upcoming, useUpcoming } from "@/state/upcoming";
import { Banner, Button, Card, Empty, Screen } from "@/ui/kit";
import { space } from "@/ui/theme";

/**
 * An upcoming match: the same setup as "Set up a match", filled in as far as it's known
 * and saved for later, with a day and kick-off to put the list in order. Send to watch
 * when it's time, as from the setup screen.
 */
export default function UpcomingMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const list = useUpcoming();
  const watches = useConnectedWatches();
  const [draft, setDraft] = useState<UpcomingMatch | null>(null);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [result, setResult] = useState<"sent" | "noWatch" | "failed" | null>(null);

  // A new match starts from the last setup sent: often the same format and home team.
  useEffect(() => {
    if (draft || !list) return;
    if (isNew) {
      Storage.getItem(LAST_SETUP_KEY)
        .catch(() => null)
        .then((saved) => setDraft({ id: randomUUID(), setup: readSavedSetup(saved), date: null, time: null, createdAt: new Date().toISOString(), sentAt: null }));
    } else {
      const found = list.find((u) => u.id === id);
      if (found) setDraft(found);
    }
  }, [draft, list, id, isNew]);

  const title = isNew ? "New match" : "Upcoming match";
  if (!list) return <Screen>{null}</Screen>;
  if (!draft) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        {!isNew && <Empty icon="calendar-outline" title="This match isn't here any more" />}
      </Screen>
    );
  }

  const update = (change: Partial<WatchSetup>) => {
    setDraft({ ...draft, setup: { ...draft.setup, ...change } });
    setResult(null);
  };

  async function save() {
    setBusy("save");
    try {
      await upcoming.save(draft!);
      router.back();
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    try {
      const got = await WatchSync.sendSetup(setupMessage(draft!.setup));
      if (got > 0) {
        const sent = { ...draft!, sentAt: new Date().toISOString() };
        setDraft(sent);
        await upcoming.save(sent);
        await Storage.setItem(LAST_SETUP_KEY, JSON.stringify(sent.setup)).catch(() => {});
      }
      setResult(got > 0 ? "sent" : "noWatch");
    } catch {
      setResult("failed");
    } finally {
      setBusy(null);
    }
  }

  function remove() {
    Alert.alert("Delete this match?", "It's only on this phone, so it can't be got back.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await upcoming.remove(draft!.id);
          router.back();
        },
      },
    ]);
  }

  const ready = Object.keys(setupErrors(draft.setup)).length === 0;

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <Card title="When">
        <WhenFields when={draft} onChange={(change) => setDraft({ ...draft, ...change })} />
      </Card>

      <SetupForm key={draft.id} setup={draft.setup} onChange={update} />

      {result === "sent" && (
        <Banner tone="primary" icon="checkmark-circle-outline" title="Sent to your watch">
          Check it there and tap Ready to start.
        </Banner>
      )}
      {result === "noWatch" && (
        <Banner tone="warn" icon="watch-outline" title="No watch got it">
          {watches !== null && watches.length === 0
            ? "No watch is in reach. Keep it near the phone with Bluetooth on, then send again."
            : "Keep your watch near the phone with Bluetooth on and its app open, then send again."}
        </Banner>
      )}
      {result === "failed" && <Banner tone="danger" icon="alert-circle-outline" title="Couldn't send to the watch" />}

      <View style={{ gap: space.sm }}>
        <Button title="Send to watch" icon="watch-outline" onPress={send} loading={busy === "send"} disabled={!ready || !watchSyncAvailable || busy !== null} />
        <Button title="Save" variant="outline" icon="save-outline" onPress={save} loading={busy === "save"} disabled={busy !== null} />
        {!isNew && <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} disabled={busy !== null} />}
      </View>
    </Screen>
  );
}
