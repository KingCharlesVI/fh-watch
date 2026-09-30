import { requireOptionalNativeModule } from "expo";

interface FileShareNative {
  shareFile(fileUri: string, mimeType: string, subject: string, text: string, title: string): Promise<void>;
}

/** Null on iOS and in tests: callers fall back to expo-sharing, without the subject and message. */
export const FileShare = requireOptionalNativeModule<FileShareNative>("FileShare");
