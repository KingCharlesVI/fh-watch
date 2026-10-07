import { describe, expect, it } from "vitest";
import { accessRequests } from "../src/db/schema.js";
import { purgeAnsweredRequests } from "../src/services/retention.js";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();
const DAY = 24 * 60 * 60 * 1000;

describe("keeping requests", () => {
  it("deletes requests answered over 12 months ago, and keeps waiting ones", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const user = await t.createUser();
    const ask = (clubName: string) =>
      t.app.inject({ method: "POST", url: "/v1/club-requests", headers: user.headers, payload: { clubName, wantsAdmin: false } });
    const answered = await ask("Witney");
    await t.app.inject({ method: "POST", url: `/v1/club-requests/${answered.json().id}/reject`, headers: admin.headers });
    await ask("Banbury");
    await t.db.insert(accessRequests).values([
      { kind: "google-play", name: "Sam", email: "sam@example.com", devices: "Galaxy Watch7", status: "denied", reviewedAt: t.deps.now() },
      { kind: "google-play", name: "Alex", email: "alex@example.com", devices: "Pixel Watch", status: "pending" },
    ]);

    t.advance(360 * DAY);
    expect(await purgeAnsweredRequests(t.deps)).toEqual({ accessRequests: 0, clubRequests: 0 });

    t.advance(10 * DAY);
    expect(await purgeAnsweredRequests(t.deps)).toEqual({ accessRequests: 1, clubRequests: 1 });
    expect((await t.db.query.clubRequests.findMany()).map((r) => r.clubName)).toEqual(["Banbury"]);
    expect((await t.db.query.accessRequests.findMany()).map((r) => r.name)).toEqual(["Alex"]);
  });
});
