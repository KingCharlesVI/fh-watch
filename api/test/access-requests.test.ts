import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp({ env: { LANDING_URL: "https://fhmatchcentre.test" } });

const LANDING = "https://fhmatchcentre.test";

const request = (over: Record<string, unknown> = {}) => ({
  kind: "google-play",
  name: "Sam Umpire",
  email: "sam@example.com",
  devices: "Pixel 8, Galaxy Watch 6",
  ...over,
});

const post = (payload: Record<string, unknown>, origin: string | null = LANDING) =>
  t.app.inject({
    method: "POST",
    url: "/v1/access-requests",
    ...(origin ? { headers: { origin } } : {}),
    payload,
  });

describe("access requests", () => {
  it("takes a request from the landing page's form and shows it to an admin", async () => {
    const res = await post(request({ notes: "I umpire in the Oxfordshire league." }));
    expect(res.statusCode).toBe(202);
    expect(res.json().message).toMatch(/email/i);
    // The browser needs this to read the reply at all.
    expect(res.headers["access-control-allow-origin"]).toBe(LANDING);

    const admin = await t.createUser({ roles: ["admin"] });
    const list = await t.app.inject({ method: "GET", url: "/v1/access-requests", headers: admin.headers });
    expect(list.json().items).toMatchObject([
      { kind: "google-play", name: "Sam Umpire", email: "sam@example.com", status: "pending", notes: "I umpire in the Oxfordshire league." },
    ]);
  });

  it("emails the umpire to say we have it, saying what they sent and that there's nothing to do", async () => {
    await post(request({ notes: "Oxfordshire league." }));
    expect(t.mailer.sent).toHaveLength(1);
    const mail = t.mailer.sent[0]!;
    expect(mail.to).toBe("sam@example.com");
    expect(mail.subject).toBe("Your request to join the Google Play test");
    expect(mail.text).toContain("Pixel 8, Galaxy Watch 6");
    expect(mail.text).toContain("Oxfordshire league.");
    expect(mail.text).toContain("nothing to do for now");
    expect(mail.text).not.toContain("replaces");

    // Asking again says so, so it's clear which one we have.
    await post(request({ devices: "Pixel 9, Galaxy Watch 8" }));
    expect(t.mailer.sent).toHaveLength(2);
    expect(t.mailer.sent[1]!.text).toContain("replaces the request we already had");
    expect(t.mailer.sent[1]!.text).toContain("Pixel 9, Galaxy Watch 8");
  });

  it("says nothing about the request to anyone else, and sends nothing when the form is refused", async () => {
    await post(request(), "https://not-us.example");
    expect((await post(request({ email: "not-an-email" }))).statusCode).toBe(400);
    expect(t.mailer.sent).toHaveLength(0);
  });

  it("updates the one that's waiting when the same umpire asks again, and keeps the two tests apart", async () => {
    await post(request());
    await post(request({ devices: "Pixel 9, Galaxy Watch 8", notes: "New watch." }));
    await post(request({ kind: "testflight", devices: "iPhone 14, Apple Watch SE" }));

    const admin = await t.createUser({ roles: ["admin"] });
    const list = await t.app.inject({ method: "GET", url: "/v1/access-requests?status=pending", headers: admin.headers });
    const items = list.json().items as { kind: string; devices: string; notes: string | null }[];
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.kind === "google-play")).toMatchObject({ devices: "Pixel 9, Galaxy Watch 8", notes: "New watch." });
    expect(items.find((i) => i.kind === "testflight")?.devices).toBe("iPhone 14, Apple Watch SE");
  });

  it("only lets admins see them", async () => {
    await post(request());
    const umpire = await t.createUser();
    expect((await t.app.inject({ method: "GET", url: "/v1/access-requests", headers: umpire.headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: "/v1/access-requests" })).statusCode).toBe(401);
  });

  it("approves a request once, and refuses to decide it twice", async () => {
    await post(request());
    const admin = await t.createUser({ roles: ["admin"] });
    const [waiting] = (await t.app.inject({ method: "GET", url: "/v1/access-requests", headers: admin.headers })).json().items;

    const approved = await t.app.inject({
      method: "POST",
      url: `/v1/access-requests/${waiting.id}/approve`,
      headers: admin.headers,
      payload: { note: "You're in the next build." },
    });
    expect(approved.json()).toMatchObject({ status: "approved", decisionNote: "You're in the next build." });
    expect(approved.json().reviewedAt).not.toBeNull();

    const again = await t.app.inject({ method: "POST", url: `/v1/access-requests/${waiting.id}/deny`, headers: admin.headers });
    expect(again.statusCode).toBe(409);
    // Approved, so it's no longer in the way of a new request from the same address.
    expect((await post(request())).statusCode).toBe(202);
  });

  it("denies a request, with a reason", async () => {
    await post(request());
    const admin = await t.createUser({ roles: ["admin"] });
    const [waiting] = (await t.app.inject({ method: "GET", url: "/v1/access-requests", headers: admin.headers })).json().items;
    const denied = await t.app.inject({
      method: "POST",
      url: `/v1/access-requests/${waiting.id}/deny`,
      headers: admin.headers,
      payload: { note: "The Wear OS test is full for now." },
    });
    expect(denied.json()).toMatchObject({ status: "denied", decisionNote: "The Wear OS test is full for now." });

    const list = await t.app.inject({ method: "GET", url: "/v1/access-requests?status=denied", headers: admin.headers });
    expect(list.json().items).toHaveLength(1);
  });

  it("answers the browser's preflight for the landing page, and nobody else's", async () => {
    const allowed = await t.app.inject({ method: "OPTIONS", url: "/v1/access-requests", headers: { origin: LANDING } });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(LANDING);
    expect(allowed.headers["access-control-allow-methods"]).toContain("POST");
    expect(allowed.headers.vary).toBe("origin");

    const elsewhere = await t.app.inject({ method: "OPTIONS", url: "/v1/access-requests", headers: { origin: "https://not-us.example" } });
    expect(elsewhere.statusCode).toBe(403);
    expect(elsewhere.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses a form posted from another site, but not one with no origin at all", async () => {
    const other = await post(request(), "https://not-us.example");
    expect(other.statusCode).toBe(403);
    // The phone app or a script has no Origin, and nothing here is cross-site anyway.
    expect((await post(request(), null)).statusCode).toBe(202);
  });

  it("rejects an address that isn't one, and a request with nothing in it", async () => {
    expect((await post(request({ email: "not-an-email" }))).statusCode).toBe(400);
    expect((await post(request({ devices: "" }))).statusCode).toBe(400);
    expect((await post({ kind: "windows-phone", name: "A", email: "a@example.com", devices: "x" })).statusCode).toBe(400);
  });
});
