// Cookie names and options, shared by server code and the proxy (which can't import next/headers helpers).

export const ACCESS_COOKIE = "fh_at";
export const REFRESH_COOKIE = "fh_rt";

const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;

const base = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export const accessCookie = (token: string, expiresInSec: number) => ({
  name: ACCESS_COOKIE,
  value: token,
  ...base,
  maxAge: expiresInSec,
});

export const refreshCookie = (token: string) => ({
  name: REFRESH_COOKIE,
  value: token,
  ...base,
  maxAge: REFRESH_MAX_AGE_SEC,
});

/** Seconds until a JWT's `exp`, without verifying it (the API does that). Null if unreadable. */
export function secondsUntilExpiry(jwt: string, nowMs = Date.now()): number | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp - nowMs / 1000 : null;
  } catch {
    return null;
  }
}
