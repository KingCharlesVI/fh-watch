import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp({ authRateLimitMax: 3, env: { CLIENT_IP_HEADER: "CF-Connecting-IP" } });

const login = (headers: Record<string, string>, email: string) =>
  t.app.inject({ method: "POST", url: "/v1/auth/login", headers, payload: { email, password: "wrong password" } });

describe("behind a Cloudflare Tunnel", () => {
  it("rate-limits by CF-Connecting-IP, not by the proxy's address", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await login({ "cf-connecting-ip": "203.0.113.7" }, `a${i}@example.com`)).statusCode).toBe(401);
    }
    expect((await login({ "cf-connecting-ip": "203.0.113.7" }, "a3@example.com")).statusCode).toBe(429);
    expect((await login({ "cf-connecting-ip": "198.51.100.9" }, "b@example.com")).statusCode).toBe(401);
  });

  it("ignores a spoofed X-Forwarded-For when CF-Connecting-IP is present", async () => {
    for (let i = 0; i < 3; i++) {
      const headers = { "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": `10.0.0.${i}` };
      expect((await login(headers, `c${i}@example.com`)).statusCode).toBe(401);
    }
    const blocked = await login({ "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "10.0.0.99" }, "c3@example.com");
    expect(blocked.statusCode).toBe(429);
  });

  it("ignores the header from a peer that isn't on this machine", async () => {
    const remote = (ip: string, email: string) =>
      t.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        remoteAddress: "192.0.2.50",
        headers: { "cf-connecting-ip": ip },
        payload: { email, password: "wrong password" },
      });
    for (let i = 0; i < 3; i++) expect((await remote(`203.0.113.${20 + i}`, `d${i}@example.com`)).statusCode).toBe(401);
    expect((await remote("203.0.113.30", "d3@example.com")).statusCode).toBe(429);
  });
});

describe("response headers", () => {
  it("are not cacheable by default and carry the security headers", async () => {
    const res = await t.app.inject({ method: "GET", url: "/v1/health" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
  });
});
