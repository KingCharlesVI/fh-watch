import { hasRole } from "@fh/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError, api } from "./api";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookie, refreshCookie } from "./session-cookies";
import type { TokenPair, User } from "./types";

/** The signed-in user, fetched once per request. Null for visitors or an expired session. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!(await cookies()).get(ACCESS_COOKIE)) return null;
  try {
    return await api<User>("/v1/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
});

/** For pages that need a signed-in user: sends visitors to the sign-in page and back again. */
export async function requireUser(returnTo: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(returnTo: string): Promise<User> {
  const user = await requireUser(returnTo);
  if (!hasRole(user, "admin")) redirect("/dashboard");
  return user;
}

/** Only in server actions and route handlers, where cookies can be written. */
export async function startSession(tokens: TokenPair) {
  const jar = await cookies();
  jar.set(accessCookie(tokens.accessToken, tokens.accessTokenExpiresIn));
  jar.set(refreshCookie(tokens.refreshToken));
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export async function refreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}
