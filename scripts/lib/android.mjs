// Finding the Android tools, shared by the dev and release scripts.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize } from "node:path";

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

const PROGRAM_FILES = process.env.ProgramFiles ?? "C:/Program Files";

/** Where JDKs are usually installed. */
const JDK_DIRS = [
  WIN && join(PROGRAM_FILES, "Eclipse Adoptium"),
  WIN && join(PROGRAM_FILES, "Java"),
  WIN && join(PROGRAM_FILES, "Microsoft"),
  WIN && join(PROGRAM_FILES, "Amazon Corretto"),
  "/Library/Java/JavaVirtualMachines",
  "/usr/lib/jvm",
];

/** The version in a JDK's folder name, e.g. jdk-17.0.17.10-hotspot or temurin-21.jdk. */
const major = (name) => Number(/(?:^|\D)(\d+)/.exec(name)?.[1] ?? 0);

/**
 * The JDK to build with: JAVA_HOME, Android Studio's, or one that's installed.
 * Gradle needs 17 for the phone app, so that's preferred; the Wear OS app asks
 * for a Java 21 toolchain, which Gradle finds for itself.
 */
export function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const studio = [
    WIN && join(PROGRAM_FILES, "Android", "Android Studio", "jbr"),
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    "/opt/android-studio/jbr",
  ].find((p) => p && existsSync(p));
  if (studio) return studio;

  const found = [];
  for (const dir of JDK_DIRS) {
    if (!dir || !existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      // macOS keeps the JDK a level down. A JRE has no compiler, so it's no use here.
      const home = [join(dir, name), join(dir, name, "Contents", "Home")].find((p) => existsSync(join(p, "bin", exe("javac"))));
      if (home) found.push({ home: normalize(home), version: major(name) });
    }
  }
  // 17 first, then the newest of the rest: a later one may still work when 17 isn't installed.
  found.sort((a, b) => (a.version === 17 ? -1 : b.version === 17 ? 1 : b.version - a.version));
  return found[0]?.home;
}
