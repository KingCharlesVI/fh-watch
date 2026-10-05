import { requireOptionalNativeModule } from "expo";

export type InstallStatus = "confirming" | "installed" | "cancelled" | "failed";

interface AppUpdaterNative {
  canInstallApps(): boolean;
  openInstallSettings(): void;
  download(url: string, fileName: string): Promise<string>;
  apkInfo(path: string): Promise<{ packageName: string; versionCode: number } | null>;
  installUpdate(path: string): Promise<void>;
  addListener(event: "onDownloadProgress", listener: (e: { url: string; received: number; total: number }) => void): { remove(): void };
  addListener(event: "onInstallStatus", listener: (e: { status: InstallStatus; message: string | null }) => void): { remove(): void };
}

/**
 * Downloads and installs updates from GitHub releases (Android). Null on iOS and in tests;
 * GitHub builds are the only ones that use it (see CHANNEL in src/config.ts).
 */
export const AppUpdater = requireOptionalNativeModule<AppUpdaterNative>("AppUpdater");
