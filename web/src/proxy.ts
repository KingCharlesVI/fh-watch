import { type NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookie,
  refreshCookie,
  secondsUntilExpiry,
} from "./lib/session-cookies";
import { clientIpHeaders } from "./lib/client-ip";
import type { TokenPair } from "./lib/types";

const API_URL = (process.env.API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
/** Refresh this long before the access token expires, so a page never renders with a dead token. */
const REFRESH_AHEAD_SEC = 60;

type RefreshResult = TokenPair | "signed_out" | "unavailable";

/** Parallel requests carrying the same refresh token share one refresh call. */
const inflight = new Map<string, Promise<RefreshResult>>();

async function refresh(token: string, forwarded: Record<string, string>): Promise<RefreshResult> {
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", ...forwarded },
      body: JSON.stringify({ refreshToken: token }),
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as TokenPair;
    return res.status === 401 ? "signed_out" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Keeps the session alive: when the access token is missing or about to
 * expire, swaps the refresh token for a new pair before the page renders.
 */
export async function proxy(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.next();

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const left = access ? secondsUntilExpiry(access) : null;
  if (left !== null && left > REFRESH_AHEAD_SEC) return NextResponse.next();

  let pending = inflight.get(refreshToken);
  if (!pending) {
    pending = refresh(refreshToken, clientIpHeaders(request.headers));
    inflight.set(refreshToken, pending);
    void pending.finally(() => setTimeout(() => inflight.delete(refreshToken), 10_000));
  }
  const result = await pending;

  // API down: leave the cookies alone and let the page cope.
  if (result === "unavailable") return NextResponse.next();

  if (result === "signed_out") {
    request.cookies.delete(ACCESS_COOKIE);
    request.cookies.delete(REFRESH_COOKIE);
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  // Pages rendered for this request read the new token; the browser stores it for the next.
  request.cookies.set(ACCESS_COOKIE, result.accessToken);
  request.cookies.set(REFRESH_COOKIE, result.refreshToken);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(accessCookie(result.accessToken, result.accessTokenExpiresIn));
  res.cookies.set(refreshCookie(result.refreshToken));
  return res;
}

export const config = {
  matcher: ["/((?!_next/|v1/|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|ico|webp|css|js)$).*)"],
};
