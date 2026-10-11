import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp({ apiRateLimitMax: 20, exportRateLimitMax: 3, env: { CLIENT_IP_HEADER: "CF-Connecting-IP" } });

const get = (url: string, ip: string) => t.app.inject({ method: "GET", url, headers: { "cf-connecting-ip": ip } });

describe("general rate limit", () => {
  it("allows the limit per IP per minute, then 429 with Retry-After", async () => {
    for (let i = 0; i < 20; i++) expect((await get("/v1/clubs", "203.0.113.7")).statusCode).toBe(200);
    const blocked = await get("/v1/clubs", "203.0.113.7");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().type).toBe("/problems/rate_limited");
    expect(blocked.headers["retry-after"]).toBe("60");

    // Someone else isn't affected, and the first visitor can carry on after a minute.
    expect((await get("/v1/clubs", "198.51.100.9")).statusCode).toBe(200);
    t.advance(60 * 1000);
    expect((await get("/v1/clubs", "203.0.113.7")).statusCode).toBe(200);
  });

  it("leaves out health checks", async () => {
    for (let i = 0; i < 30; i++) expect((await get("/v1/health", "203.0.113.8")).statusCode).toBe(200);
    expect((await get("/v1/clubs", "203.0.113.8")).statusCode).toBe(200);
  });
});

describe("export rate limit", () => {
  it("allows fewer CSV and PDF downloads than other requests", async () => {
    const pdf = `/v1/matches/${crypto.randomUUID()}/export.pdf`;
    for (let i = 0; i < 3; i++) expect((await get(pdf, "203.0.113.9")).statusCode).toBe(404);
    expect((await get(pdf, "203.0.113.9")).statusCode).toBe(429);
    expect((await get("/v1/matches/export.csv", "203.0.113.9")).statusCode).toBe(429);
    // Everything else still works.
    expect((await get("/v1/clubs", "203.0.113.9")).statusCode).toBe(200);
  });
});
