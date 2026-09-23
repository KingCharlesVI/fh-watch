"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { type FormState, formError, optionalText, text } from "@/lib/forms";
import { getCurrentUser, startSession } from "@/lib/session";
import type { TokenPair, User } from "@/lib/types";

export async function updateProfile(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api<User>("/v1/me", { method: "PATCH", body: { displayName: text(fd, "displayName") } });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const newPassword = String(fd.get("newPassword") ?? "");
  if (newPassword !== String(fd.get("confirm") ?? "")) return { error: "The new passwords don't match." };
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in again first." };
  try {
    await api("/v1/me", { method: "PATCH", body: { currentPassword: String(fd.get("currentPassword") ?? ""), newPassword } });
    // Changing the password signs out every device, including this one; sign straight back in.
    await startSession(
      await api<TokenPair>("/v1/auth/login", { method: "POST", auth: false, body: { email: user.email, password: newPassword } }),
    );
  } catch (err) {
    return formError(err);
  }
  return { ok: "Password changed. Your other devices have been signed out." };
}

export async function requestClub(_: FormState, fd: FormData): Promise<FormState> {
  const kind = text(fd, "kind");
  const body =
    kind === "existing"
      ? { clubId: text(fd, "clubId") }
      : { clubName: text(fd, "clubName"), wantsAdmin: fd.get("wantsAdmin") === "on" };
  if (kind === "existing" && !optionalText(fd, "clubId")) return { error: "Pick a club." };
  try {
    await api("/v1/club-requests", { method: "POST", body });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/account");
  return { ok: "Request sent. An admin will review it." };
}

export async function requestDeletion(_: FormState): Promise<FormState> {
  try {
    await api("/v1/me", { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/account");
  return { ok: "Request sent. An admin will delete your account; your published matches stay, without your name." };
}
