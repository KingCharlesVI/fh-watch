import { describe, expect, it } from "vitest";
import { PASSWORD, setupTestApp } from "./helpers.js";

const t = await setupTestApp({ authRateLimitMax: 10 });

describe("sign-in rate limit", () => {
  it("allows 10 attempts per email per 15 minutes, then 429", async () => {
    const attempt = (email: string) =>
      t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: "wrong password" } });

    for (let i = 0; i < 10; i++) expect((await attempt("sam@example.com")).statusCode).toBe(401);
    const blocked = await attempt("sam@example.com");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().type).toBe("/problems/rate_limited");

    t.advance(15 * 60 * 1000);
    expect((await attempt("sam@example.com")).statusCode).toBe(401);
  });
});

describe("join form rate limit", () => {
  const ask = (email: string) =>
    t.app.inject({
      method: "POST",
      url: "/v1/access-requests",
      payload: { kind: "google-play", name: "Sam", email, devices: "Pixel 8, Galaxy Watch 6" },
    });

  it("allows 10 requests per address and per IP in 15 minutes, then 429", async () => {
    for (let i = 0; i < 10; i++) expect((await ask(`umpire${i}@example.com`)).statusCode).toBe(202);
    const blocked = await ask("one-too-many@example.com");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().type).toBe("/problems/rate_limited");

    t.advance(15 * 60 * 1000);
    expect((await ask("one-too-many@example.com")).statusCode).toBe(202);
  });
});

describe("password change rate limit", () => {
  it("allows 10 attempts per account per 15 minutes, then 429", async () => {
    const { user, headers } = await t.createUser();
    const change = (h = headers) =>
      t.app.inject({
        method: "PATCH",
        url: "/v1/me",
        headers: h,
        payload: { currentPassword: "a wrong guess", newPassword: "another good password" },
      });

    for (let i = 0; i < 10; i++) expect((await change()).statusCode).toBe(403);
    expect((await change()).statusCode).toBe(429);

    // The access token has expired by then, so sign in again.
    t.advance(15 * 60 * 1000);
    const login = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: user.email, password: PASSWORD } });
    expect((await change({ authorization: `Bearer ${login.json().accessToken}` })).statusCode).toBe(403);
  });
});
