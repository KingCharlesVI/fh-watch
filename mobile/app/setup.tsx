import Storage from "expo-sqlite/kv-store";
import { useEffect, useState } from "react";
import { LAST_SETUP_KEY, type WatchSetup, readSavedSetup, setupErrors, setupMessage } from "@/core/setup";
import { SetupForm } from "@/features/setup-form";
import { WatchSync, useConnectedWatches, watchSyncAvailable } from "@/services/watch";
import { Banner, Button, Screen } from "@/ui/kit";

/**
 * Setup on phone: type the teams and format here instead of on the watch, then send
 * them to the watch, which opens its setup screen with them to check and start.
 * The watch opens this screen (fhmatchcentre://setup); Settings has a way in too.
 */
export default function SetupScreen() {
  const watches = useConnectedWatches();
  const [setup, setSetup] = useState<WatchSetup | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"sent" | "noWatch" | "failed" | null>(null);

  // Starts from the last setup sent: often the same teams and format.
  useEffect(() => {
    Storage.getItem(LAST_SETUP_KEY)
      .catch(() => null)
      .then((saved) => setSetup(readSavedSetup(saved)));
  }, []);

  if (!setup) return <Screen>{null}</Screen>;

  const update = (change: Partial<WatchSetup>) => {
    setSetup({ ...setup, ...change });
    setResult(null);
  };

  async function send() {
    if (!setup) return;
    setSending(true);
    try {
      const got = await WatchSync.sendSetup(setupMessage(setup));
      if (got > 0) await Storage.setItem(LAST_SETUP_KEY, JSON.stringify(setup)).catch(() => {});
      setResult(got > 0 ? "sent" : "noWatch");
    } catch {
      setResult("failed");
    } finally {
      setSending(false);
    }
  }

  const ready = Object.keys(setupErrors(setup)).length === 0;

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

      <SetupForm setup={setup} onChange={update} />

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
