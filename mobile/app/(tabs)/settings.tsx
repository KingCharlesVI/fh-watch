import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Share, View } from "react-native";
import { API_URL, ONLINE, WEB_URL } from "@/config";
import { errorMessage } from "@/core/api";
import { sync } from "@/services";
import { saveBackup, shareBackup } from "@/services/export";
import { importFromFile, sampleMatch } from "@/services/import";
import { useConnectedWatches, useWatchProblems, watchSyncAvailable } from "@/services/watch";
import { useAuth } from "@/state/auth";
import { useMatches } from "@/state/sync";
import { Badge, Banner, Button, Card, Row, Screen, T } from "@/ui/kit";

const ROLE_NAMES = { admin: "Admin", umpire: "Umpire", club_admin: "Club admin" } as const;

export default function SettingsScreen() {
  const { rows } = useMatches();
  const [importing, setImporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  async function doImport() {
    setImporting(true);
    try {
      const result = await importFromFile();
      if (!result) return;
      const { added, duplicate, invalid } = result;
      if (added) {
        const skipped = duplicate ? ` ${duplicate} ${duplicate === 1 ? "was" : "were"} already on this phone.` : "";
        Alert.alert(added === 1 ? "Match imported" : `${added} matches imported`, `They're in New.${skipped}`);
        router.navigate("/");
      } else if (duplicate) {
        Alert.alert("Already on this phone", duplicate === 1 ? "That match was imported before." : "Those matches were imported before.");
      }
      if (invalid.length) Alert.alert("Some of that file couldn't be read", invalid.slice(0, 3).join("\n"));
    } finally {
      setImporting(false);
    }
  }

  async function backup(how: "save" | "share") {
    setBackingUp(true);
    try {
      if (how === "share") {
        await shareBackup();
      } else {
        const count = await saveBackup();
        if (count !== null) {
          Alert.alert("Backup saved", `${count} match${count === 1 ? "" : "es"} in one file. Import it on any phone to restore them.`);
        }
      }
    } catch (err) {
      Alert.alert("Couldn't back up", errorMessage(err));
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <Screen>
      {ONLINE && <AccountCards notUploaded={rows.filter((r) => r.match.dirty).length} />}

      <Card title="Watch">
        <WatchStatus />
        {__DEV__ && (
          <Button
            title="Add a sample match (development)"
            variant="ghost"
            icon="flask-outline"
            onPress={async () => {
              await sync.importMatch(sampleMatch(), "watch");
              router.navigate("/");
            }}
          />
        )}
      </Card>

      <Card title="Your matches">
        <T variant="muted">
          {ONLINE
            ? "Everything is saved on this phone first. A backup keeps a copy of every match in one file."
            : "Matches are saved on this phone only. Back them up now and then, so they survive a lost phone or a reinstall."}
        </T>
        <Row>
          <View style={{ flex: 1 }}>
            <Button title="Save a backup" variant="outline" icon="download-outline" onPress={() => backup("save")} loading={backingUp} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Share a backup" variant="outline" icon="share-outline" onPress={() => backup("share")} disabled={backingUp} />
          </View>
        </Row>
        <Button title="Import from a file" variant="outline" icon="document-attach-outline" onPress={doImport} loading={importing} />
        <T variant="small">Reads a backup, or a match exported from this app or the website.</T>
      </Card>

      <Card title="About">
        <T variant="small">
          Version {Constants.expoConfig?.version} ({Constants.expoConfig?.android?.versionCode ?? "development"}) ·{" "}
          {ONLINE ? API_URL : "Alpha: watch and phone only"}
        </T>
      </Card>
    </Screen>
  );
}

/** Beta only: the account, notifications and signing out. */
function AccountCards({ notUploaded }: { notUploaded: number }) {
  const { user, signOut, push, enableNotifications } = useAuth();

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      notUploaded
        ? `${notUploaded} match${notUploaded === 1 ? " hasn't" : "es haven't"} been uploaded and will be deleted from this phone. Save a backup first to keep them.`
        : "Matches are removed from this phone; everything uploaded stays on the website.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() },
      ],
    );
  }

  return (
    <>
      <Card title="Account">
        <T variant="heading">{user?.displayName}</T>
        <T variant="muted">{user?.email}</T>
        <Row>
          {user?.roles.map((r) => (
            <Badge key={r} label={ROLE_NAMES[r]} tone="primary" />
          ))}
        </Row>
        <Button title="Manage on the website" variant="outline" icon="open-outline" onPress={() => Linking.openURL(`${WEB_URL}/account`)} />
        {notUploaded > 0 && <T variant="small">{notUploaded} not uploaded</T>}
        <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={confirmSignOut} />
      </Card>

      <Card title="Notifications">
        {push?.state === "on" ? (
          <T variant="muted">On. You'll hear when a match publishes itself and needs its teams linking.</T>
        ) : push?.state === "unavailable" ? (
          <Banner tone="warn" icon="notifications-off-outline" title="Not available">
            {push.reason}
          </Banner>
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
    </>
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
