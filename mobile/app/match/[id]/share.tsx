import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Share, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useMatch } from "@/state/sync";
import { Button, Card, Empty, Screen, T } from "@/ui/kit";
import { space } from "@/ui/theme";

/** A big QR code for people at the pitch to scan, plus the share sheet and copy link. Works offline once published. */
export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { row } = useMatch(id);
  const [copied, setCopied] = useState(false);
  const server = row?.match.server;
  const url = server?.status === "published" ? server.shareUrl : null;

  if (!server || !url) {
    return (
      <Screen>
        <Empty icon="lock-closed-outline" title="Not published yet">
          Publish the match first; then it has a link to share.
        </Empty>
      </Screen>
    );
  }

  const title = `${server.home.name} ${server.home.score}–${server.away.score} ${server.away.name}`;
  return (
    <Screen>
      <Card style={{ alignItems: "center", paddingVertical: space.xl }}>
        <T variant="heading" style={{ textAlign: "center" }}>
          {title}
        </T>
        <View style={{ padding: space.md, backgroundColor: "#FFFFFF", borderRadius: 12 }}>
          <QRCode value={url} size={240} backgroundColor="#FFFFFF" color="#000000" />
        </View>
        <T variant="muted" style={{ textAlign: "center" }}>
          {url}
        </T>
      </Card>
      <Button title="Share link" icon="share-outline" onPress={() => void Share.share({ message: `${title}: ${url}`, url })} />
      <Button
        title={copied ? "Copied" : "Copy link"}
        variant="outline"
        icon={copied ? "checkmark" : "copy-outline"}
        onPress={async () => {
          await Clipboard.setStringAsync(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      />
    </Screen>
  );
}
