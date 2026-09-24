import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Share } from "react-native";
import { API_URL, WEB_URL } from "@/config";
import { sync } from "@/services";
import { importFromFile, sampleMatch } from "@/services/import";
import { useConnectedWatches, useWatchProblems, watchSyncAvailable } from "@/services/watch";
import { useAuth } from "@/state/auth";
import { useMatches } from "@/state/sync";
import { Badge, Banner, Button, Card, Row, Screen, T } from "@/ui/kit";

const ROLE_NAMES = { admin: "Admin", umpire: "Umpire", club_admin: "Club admin" } as const;

export default function SettingsScreen() {
  const { user, signOut, push, enableNotifications } = useAuth();
  const { rows } = useMatches();
  const [importing, setImporting] = useState(false);
  const waiting = rows.filter((r) => r.match.dirty).length;

  async function doImport() {
    setImporting(true);
    try {
      const result = await importFromFile();
      if (!result) return;
      if (result.status === "added") {
        Alert.alert("Match imported", "It's in New, and uploads as soon as there's a connection.");
        router.navigate("/");
      } else if (result.status === "duplicate") {
        Alert.alert("Already on this phone", "That match was imported before.");
      } else {
        Alert.alert("Couldn't import that file", result.errors?.slice(0, 3).join("\n"));
      }
    } finally {
      setImporting(false);
    }
  }

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      waiting
        ? `${waiting} match${waiting === 1 ? " hasn't" : "es haven't"} uploaded yet and will be deleted from this phone.`
        : "Matches are removed from this phone; everything uploaded stays on the website.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() },
      ],
    );
  }

  return (
    <Screen>
      <Card title="Account">
        <T variant="heading">{user?.displayName}</T>
        <T variant="muted">{user?.email}</T>
        <Row>
          {user?.roles.map((r) => (
            <Badge key={r} label={ROLE_NAMES[r]} tone="primary" />
          ))}
        </Row>
        <Button title="Manage on the website" variant="outline" icon="open-outline" onPress={() => Linking.openURL(`${WEB_URL}/account`)} />
      </Card>

      <Card title="Notifications">
        {push?.state === "on" ? (
          <T variant="muted">On. You'll hear when a match publishes itself and needs its teams linking.</T>
        ) : push?.state === "unavailable" ? (
          <Banner tone="warn" icon="notifications-off-outline" title="Not available">{push.reason}</Banner>
        ) : (
          <>
            <T variant="muted">Get told when a match publishes itself and needs its teams linking.</T>
            {push?.state === "denied" && <T variant="small">Notifications are turned off for this app in your phone's settings.</T>}
            <Button
              title="Turn on notifications"
              variant="outline"
              icon="notifications-outline"
              onPress={async () => {
                const res = await enableNotifications();
                if (res.state === "denied") void Linking.openSettings();
              }}
            />
          </>
        )}
      </Card>

      <Card title="Watch">
        <WatchStatus />
        <Button title="Import a match from a file" variant="outline" icon="document-attach-outline" onPress={doImport} loading={importing} />
        {__DEV__ && (
          <Button
            title="Add a sample match (development)"
            variant="ghost"
            icon="flask-outline"
            onPress={async () => {
              await sync.importMatch(sampleMatch(), "watch");
              void sync.uploadPending().catch(() => {});
              router.navigate("/");
            }}
          />
        )}
      </Card>

      <Card title="About">
        <T variant="small">
          Version {Constants.expoConfig?.version} · {API_URL}
        </T>
        {waiting > 0 && <T variant="small">{waiting} waiting to upload</T>}
      </Card>

      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={confirmSignOut} />
    </Screen>
  );
}

/** Whether a watch is in reach, and any matches from it that couldn't be stored. */
function WatchStatus() {
  const watches = useConnectedWatches();
  const problems = useWatchProblems();
  if (!watchSyncAvailable) {
    return <T variant="muted">Syncing from an Apple Watch arrives with the watchOS app. Until then, import matches exported from the watch.</T>;
  }
  return (
    <>
      <T variant="muted">
        {watches === null
          ? "Looking for your watch…"
          : watches.length
            ? `Connected to ${watches.map((w) => w.name).join(", ")}. Finished matches arrive by themselves.`
            : "No watch connected. Matches wait on the watch and arrive when it's next in reach."}
      </T>
      {problems.map((p) => (
        <Banner
          key={p.id}
          tone="warn"
          icon="alert-circle-outline"
          title={p.kind === "needs_update" ? "Update the app for this match" : "A match from the watch couldn't be read"}
          action={<Button title="Export" variant="outline" icon="share-outline" onPress={() => void Share.share({ title: `Match ${p.id}`, message: p.json })} />}
        >
          {p.details.slice(0, 3).join("\n")}
        </Banner>
      ))}
    </>
  );
}
