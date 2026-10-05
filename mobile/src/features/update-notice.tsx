import { View } from "react-native";
import type { Update } from "@/core/updates";
import { type Installing, dismissUpdate, installPhoneUpdate, sendWatchUpdate, useUpdates } from "@/state/updates";
import { Banner, Button, Row, T } from "@/ui/kit";

/**
 * A newer phone or watch app on GitHub. The phone's downloads and installs from here; the
 * watch's downloads here and goes to the watch, to install there.
 */
export function UpdateNotice({ update, later }: { update: Update; later?: boolean }) {
  const { installing } = useUpdates();
  const { release, phone, watch } = update;
  const busy = installing?.step === "downloading" || installing?.step === "confirming";
  const body = phone && watch ? "New phone and watch apps. Send the watch's first: the phone app closes while it updates." : phone ? "A new phone app." : "A new watch app.";
  return (
    <Banner
      tone="primary"
      icon="arrow-up-circle-outline"
      title={`Update: ${release.name}`}
      action={
        <Row>
          {phone && (
            <View style={{ flex: 1 }}>
              <Button small title="Install phone app" icon="download-outline" loading={installing?.app === "phone" && busy} disabled={busy} onPress={() => void installPhoneUpdate()} />
            </View>
          )}
          {watch && (
            <View style={{ flex: 1 }}>
              <Button
                small
                title="Send to watch"
                variant={phone ? "outline" : "primary"}
                icon="watch-outline"
                loading={installing?.app === "watch" && busy}
                disabled={busy}
                onPress={() => void sendWatchUpdate()}
              />
            </View>
          )}
          {later && <Button small title="Later" variant="ghost" onPress={() => void dismissUpdate()} />}
        </Row>
      }
    >
      <View style={{ gap: 4 }}>
        <T>{body}</T>
        {installing && <T variant="small">{installingText(installing)}</T>}
      </View>
    </Banner>
  );
}

function installingText(i: Installing): string {
  const app = i.app === "phone" ? "phone app" : "watch app";
  switch (i.step) {
    case "downloading":
      return i.percent === null ? `Downloading the ${app}…` : `Downloading the ${app}: ${i.percent}%`;
    case "allow":
      return "Allow FH Match Centre to install apps, then come back and tap Install again.";
    case "confirming":
      return "Confirm the update when Android asks. The app closes and opens on the new version.";
    case "sent":
      return `Sent to your watch${i.watches > 1 ? "es" : ""}. On the watch, open FH Match Centre and tap Install update.`;
    case "failed":
      return i.message;
  }
}
