import * as Linking from "expo-linking";
import { View } from "react-native";
import type { Update } from "@/core/updates";
import { dismissUpdate } from "@/state/updates";
import { Banner, Button, Row } from "@/ui/kit";

/**
 * A newer phone or watch app on GitHub. The phone's APK downloads and installs from here;
 * the watch's goes on from a computer, so that links to the release page.
 */
export function UpdateNotice({ update, later }: { update: Update; later?: boolean }) {
  const { release, phone, watch } = update;
  const body =
    phone && watch
      ? "New phone and watch apps. Install the watch app from a computer, as before."
      : phone
        ? "A new phone app."
        : "A new watch app. Install it from a computer, as before.";
  return (
    <Banner
      tone="primary"
      icon="arrow-up-circle-outline"
      title={`Update: ${release.name}`}
      action={
        <Row>
          {phone && (
            <View style={{ flex: 1 }}>
              <Button small title="Phone app" icon="download-outline" onPress={() => void Linking.openURL(phone.url)} />
            </View>
          )}
          {watch && (
            <View style={{ flex: 1 }}>
              <Button small title="Watch app" variant="outline" icon="open-outline" onPress={() => void Linking.openURL(release.pageUrl)} />
            </View>
          )}
          {later && <Button small title="Later" variant="ghost" onPress={() => void dismissUpdate()} />}
        </Row>
      }
    >
      {body}
    </Banner>
  );
}
