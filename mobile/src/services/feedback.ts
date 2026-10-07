import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { type FeedbackContext, bugReportUrl, featureRequestUrl } from "@/core/feedback";
import { WatchSync } from "./watch";

const BUILD = Platform.OS === "ios" ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode;

/** What a bug report needs to know about this phone and its watches. Nothing private: models and versions. */
async function context(): Promise<FeedbackContext> {
  const [watches, versions] = await Promise.all([WatchSync.connectedWatches().catch(() => []), WatchSync.watchVersions().catch(() => [])]);
  const phone = Device.modelName ? `${Device.modelName} (${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""})`.replace(" )", ")") : null;
  return {
    platform: Platform.OS === "ios" ? "ios" : "android",
    appVersion: `${Constants.expoConfig?.version ?? "?"} (${__DEV__ ? "development" : (BUILD ?? "?")})`,
    phone,
    watches: watches.map((w) => {
      const v = versions.find((x) => x.watchId === w.id);
      return v ? `${w.name} (watch app ${v.version}, build ${v.build})` : w.name;
    }),
  };
}

/** Opens GitHub's bug report form, filled in for this phone and its watch. */
export async function reportBug() {
  await Linking.openURL(bugReportUrl(await context()));
}

export async function suggestFeature() {
  await Linking.openURL(featureRequestUrl());
}
