import { ApiError } from "./api";

/** What a server action tells its form: an error to show, or a success message. */
export type FormState = { error?: string; details?: string[]; ok?: string } | undefined;

/** Turns an API problem into form feedback. Anything else (including redirects) is rethrown. */
export function formError(err: unknown): FormState {
  if (!(err instanceof ApiError)) throw err;
  const details = (err.problem.errors ?? []).map((e) => {
    const path = Array.isArray(e.path) ? e.path.join(".") : e.path.replace(/^\//, "").replaceAll("/", ".");
    return path ? `${path}: ${e.message}` : e.message;
  });
  return { error: err.problem.title, details: details.length ? details : undefined };
}

export const text = (fd: FormData, name: string): string => String(fd.get(name) ?? "").trim();
export const optionalText = (fd: FormData, name: string): string | undefined => text(fd, name) || undefined;

/** Only same-site paths, so `?next=` can't send people to another site. */
export function safeNext(value: string | undefined | null, fallback = "/dashboard"): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
