// Finding the Android tools, shared by the dev and release scripts.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const WIN = process.platform === "win32";

export const exe = (name) => (WIN ? `${name}.exe` : name);

/** The Android SDK: ANDROID_HOME, or where Android Studio puts it. */
export function androidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    WIN && process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    join(homedir(), "Library", "Android", "sdk"),
    join(homedir(), "Android", "Sdk"),
  ];
  return candidates.find((p) => p && existsSync(p));
}

/** The JDK that comes with Android Studio, unless JAVA_HOME says otherwise. */
export function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const candidates = [
    WIN && "C:\\Program Files\\Android\\Android Studio\\jbr",
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    "/opt/android-studio/jbr",
  ];
  return candidates.find((p) => p && existsSync(p));
}
