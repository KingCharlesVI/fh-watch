"use server";

import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { type FormState, formError, optionalText, safeNext, text } from "@/lib/forms";
import { endSession, refreshToken, startSession } from "@/lib/session";
import type { TokenPair } from "@/lib/types";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const tokens = await api<TokenPair>("/v1/auth/login", {
      method: "POST",
      auth: false,
      body: { email: text(fd, "email"), password: String(fd.get("password") ?? "") },
    });
    await startSession(tokens);
  } catch (err) {
    if (err instanceof ApiError && err.problem.type === "/problems/email_not_verified") {
      return { error: "Confirm your email address first. Check your inbox, or ask for a new link below." };
    }
    return formError(err);
  }
  redirect(safeNext(optionalText(fd, "next")));
}

export async function logout(): Promise<void> {
  const token = await refreshToken();
  if (token) {
    await api("/v1/auth/logout", { method: "POST", auth: false, body: { refreshToken: token } }).catch(() => {});
  }
  await endSession();
  redirect("/");
}

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The passwords don't match." };

  const club = text(fd, "club");
  const clubRequest =
    club === "existing" && optionalText(fd, "clubId")
      ? { clubId: text(fd, "clubId") }
      : club === "new" && optionalText(fd, "clubName")
        ? { clubName: text(fd, "clubName"), wantsAdmin: fd.get("wantsAdmin") === "on" }
        : undefined;

  try {
    await api("/v1/auth/register", {
      method: "POST",
      auth: false,
      body: { email: text(fd, "email"), password, displayName: text(fd, "displayName"), clubRequest },
    });
  } catch (err) {
    return formError(err);
  }
  return { ok: "Nearly done. We've sent you an email: follow the link in it to confirm your address, then sign in." };
}

export async function resendVerification(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api("/v1/auth/resend-verification", { method: "POST", auth: false, body: { email: text(fd, "email") } });
  } catch (err) {
    return formError(err);
  }
  return { ok: "If that address needs confirming, a new link is on its way." };
}

export async function verifyEmail(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api("/v1/auth/verify-email", { method: "POST", auth: false, body: { token: text(fd, "token") } });
  } catch (err) {
    return formError(err);
  }
  redirect("/login?verified=1");
}

export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api("/v1/auth/forgot-password", { method: "POST", auth: false, body: { email: text(fd, "email") } });
  } catch (err) {
    return formError(err);
  }
  return { ok: "If there's an account for that address, we've emailed it a link to reset the password." };
}

export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The passwords don't match." };
  try {
    await api("/v1/auth/reset-password", { method: "POST", auth: false, body: { token: text(fd, "token"), password } });
  } catch (err) {
    return formError(err);
  }
  redirect("/login?reset=1");
}
