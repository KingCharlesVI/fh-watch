import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Getting in to /admin. One password, in STATUS_ADMIN_PASSWORD, and a cookie signed
 * with it — no user accounts, because there's one person posting incidents and the
 * page must not depend on the API's sign-in to say the API is down.
 */

const COOKIE = "fh_status_admin";
const DAYS = 7;

const password = () => process.env.STATUS_ADMIN_PASSWORD;

/** False when no password is set: the admin page then explains itself and does nothing. */
export const adminEnabled = () => Boolean(password());

const sign = (value: string, key: string) => createHmac("sha256", key).update(value).digest("base64url");

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checks the password without leaking how much of it was right. */
export function passwordMatches(given: string): boolean {
  const expected = password();
  return Boolean(expected) && same(sign(given, "compare"), sign(expected!, "compare"));
}

/** The cookie: when it runs out, and a signature over that, keyed by the password. */
export async function startSession() {
  const key = password();
  if (!key) return;
  const expires = Date.now() + DAYS * 24 * 60 * 60 * 1000;
  const value = `${expires}.${sign(String(expires), key)}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function signedIn(): Promise<boolean> {
  const key = password();
  if (!key) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  const [expires, signature] = value?.split(".") ?? [];
  if (!expires || !signature) return false;
  // Changing the password signs everyone out, which is what you'd want.
  if (!same(signature, sign(expires, key))) return false;
  return Number(expires) > Date.now();
}

/** For the actions: nothing happens unless the session is good. */
export async function requireAdmin(): Promise<void> {
  if (!(await signedIn())) throw new Error("Not signed in.");
}
