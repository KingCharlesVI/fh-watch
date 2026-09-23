import { describe, expect, it } from "vitest";
import { PASSWORD, setupTestApp, tokenFromMail } from "./helpers.js";

const t = await setupTestApp();

async function register(email = "sam@example.com", extra: Record<string, unknown> = {}) {
  return t.app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, password: PASSWORD, displayName: "Sam Umpire", ...extra },
  });
}

const login = (email: string, password = PASSWORD) =>
  t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });

describe("registration and email verification", () => {
  it("registers an umpire who must verify before signing in", async () => {
    const res = await register("  Sam@Example.com ");
    expect(res.statusCode).toBe(202);
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]!.text).toContain("https://hockey.test/verify-email?token=");

    const early = await login("sam@example.com");
    expect(early.statusCode).toBe(403);
    expect(early.json()).toMatchObject({ type: "/problems/email_not_verified", status: 403 });
    expect(early.headers["content-type"]).toContain("application/problem+json");

    const token = tokenFromMail(t.mailer.sent, "sam@example.com");
    const verify = await t.app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
    expect(verify.statusCode).toBe(204);

    const again = await t.app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
    expect(again.statusCode).toBe(400);

    const ok = await login("SAM@example.com");
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      accessTokenExpiresIn: 900,
      user: { email: "sam@example.com", displayName: "Sam Umpire", roles: ["umpire"], emailVerified: true },
    });
  });

  it("answers the same for an email that's already registered, and tells its owner", async () => {
    await register();
    t.mailer.sent.length = 0;
    const res = await register();
    expect(res.statusCode).toBe(202);
    expect(t.mailer.sent[0]).toMatchObject({ to: "sam@example.com", subject: "You already have an account" });
  });

  it("files a club request at sign-up", async () => {
    await register("sam@example.com", { clubRequest: { clubName: "Oxford Hawks", wantsAdmin: true } });
    const [row] = await t.db.query.clubRequests.findMany();
    expect(row).toMatchObject({ clubName: "Oxford Hawks", wantsAdmin: true, status: "pending" });
  });

  it("rejects a weak password with a validation problem", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "sam@example.com", password: "short", displayName: "Sam" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ type: "/problems/validation", errors: [{ path: "/password" }] });
  });

  it("expires verification links after 24 hours", async () => {
    await register();
    const token = tokenFromMail(t.mailer.sent, "sam@example.com");
    t.advance(24 * 60 * 60 * 1000 + 1);
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
    expect(res.statusCode).toBe(400);
  });
});

describe("sign-in and sessions", () => {
  it("refuses a wrong password or unknown email the same way", async () => {
    await t.createUser({ email: "sam@example.com" });
    const wrong = await login("sam@example.com", "not the password");
    const unknown = await login("nobody@example.com");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().type).toBe(unknown.json().type);
  });

  it("rotates refresh tokens and ends the session if a spent one is reused", async () => {
    await t.createUser({ email: "sam@example.com" });
    const first = (await login("sam@example.com")).json();

    const second = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: first.refreshToken } });
    expect(second.statusCode).toBe(200);
    const { refreshToken: next, accessToken } = second.json();
    expect(next).not.toBe(first.refreshToken);

    const me = await t.app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${accessToken}` } });
    expect(me.json().email).toBe("sam@example.com");

    t.advance(31 * 1000);
    const reuse = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: first.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().type).toBe("/problems/refresh_token_reused");

    // The whole family is revoked, including the token issued after the stolen one.
    const after = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: next } });
    expect(after.statusCode).toBe(401);
  });

  it("lets a just-spent refresh token work again for 30 seconds, for parallel requests", async () => {
    await t.createUser({ email: "sam@example.com" });
    const { refreshToken } = (await login("sam@example.com")).json();
    const refresh = () => t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken } });
    const [a, b] = [await refresh(), await refresh()];
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    // Both descendants stay valid.
    for (const next of [a.json().refreshToken, b.json().refreshToken]) {
      const res = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: next } });
      expect(res.statusCode).toBe(200);
    }
  });

  it("logs out by revoking the session, with no reuse grace", async () => {
    await t.createUser({ email: "sam@example.com" });
    const { refreshToken } = (await login("sam@example.com")).json();
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/logout", payload: { refreshToken } })).statusCode).toBe(204);
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken } });
    expect(res.statusCode).toBe(401);
  });

  it("expires access tokens after 15 minutes", async () => {
    const { headers } = await t.createUser();
    t.advance(15 * 60 * 1000 + 1000);
    const res = await t.app.inject({ method: "GET", url: "/v1/me", headers });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a forged token, even on a public route", async () => {
    const res = await t.app.inject({ method: "GET", url: "/v1/clubs", headers: { authorization: "Bearer not.a.jwt" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("password reset", () => {
  it("resets the password and signs out every device", async () => {
    await t.createUser({ email: "sam@example.com" });
    const { refreshToken } = (await login("sam@example.com")).json();

    const forgot = await t.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "sam@example.com" } });
    expect(forgot.statusCode).toBe(202);
    const token = tokenFromMail(t.mailer.sent, "sam@example.com");

    const reset = await t.app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token, password: "a brand new password" },
    });
    expect(reset.statusCode).toBe(204);

    expect((await login("sam@example.com")).statusCode).toBe(401);
    expect((await login("sam@example.com", "a brand new password")).statusCode).toBe(200);
    const refresh = await t.app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken } });
    expect(refresh.statusCode).toBe(401);
  });

  it("expires reset links after an hour", async () => {
    await t.createUser({ email: "sam@example.com" });
    await t.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "sam@example.com" } });
    const token = tokenFromMail(t.mailer.sent, "sam@example.com");
    t.advance(60 * 60 * 1000 + 1);
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token, password: "a brand new password" } });
    expect(res.statusCode).toBe(400);
  });

  it("sends nothing for an unknown email but answers the same", async () => {
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "nobody@example.com" } });
    expect(res.statusCode).toBe(202);
    expect(t.mailer.sent).toHaveLength(0);
  });
});
