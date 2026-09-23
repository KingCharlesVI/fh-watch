import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

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
