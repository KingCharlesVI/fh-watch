import { describe, expect, it } from "vitest";
import { emailUmpiringGaps } from "../src/services/umpiring-gaps.js";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

/** A club with fixtures: Saturday's short of one umpire, Sunday's fully staffed, and one in a fortnight short of both. */
async function setup() {
  const { club } = await t.createClub("Oxford Hawks", ["M1"]);
  const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id, email: "admin@hawks.test" });
  const sam = await t.createUser({ name: "Sam" });
  const alex = await t.createUser({ name: "Alex" });
  for (const u of [sam, alex]) await req("PUT", `/v1/clubs/${club.id}/umpires/${u.user.id}`, clubAdmin.headers, {});
  const url = `/v1/clubs/${club.id}/fixtures`;
  const add = async (body: object) => (await req("POST", url, clubAdmin.headers, body)).json();
  const appoint = async (f: { id: string }, u: typeof sam, role: string, accept: boolean) => {
    const a = (await req("POST", `${url}/${f.id}/appointments`, clubAdmin.headers, { userId: u.user.id, role })).json();
    if (accept) await req("POST", `/v1/me/appointments/${a.id}/accept`, u.headers);
  };
  const saturday = await add({ date: "2026-09-26", time: "14:00", home: { name: "M1" }, away: { name: "Reading M1" } });
  await appoint(saturday, sam, "watch", true);
  await appoint(saturday, alex, "second", false);
  const sunday = await add({ date: "2026-09-27", time: "11:00", home: { name: "M1" }, away: { name: "Bath" }, umpiresNeeded: 1 });
  await appoint(sunday, sam, "watch", true);
  await add({ date: "2026-10-03", home: { name: "M1" }, away: { name: "Bristol" } });
  t.mailer.sent.length = 0;
  return { clubAdmin, url };
}

const at = (iso: string) => {
  t.clock.now = new Date(iso);
};

describe("fixtures needing umpires", () => {
  it("are the ones with fewer accepted umpires than they need", async () => {
    const { clubAdmin, url } = await setup();
    const short = (await req("GET", `${url}?needsUmpires=true`, clubAdmin.headers)).json().items;
    expect(short.map((f: { away: { name: string } }) => f.away.name)).toEqual(["Reading M1", "Bristol"]);
    expect((await req("GET", url, clubAdmin.headers)).json().items).toHaveLength(3);
  });
});

describe("emails about gaps", () => {
  it("go to the club's admins on Monday, listing the next week's, once a day", async () => {
    await setup();
    at("2026-09-21T09:00:00Z"); // Monday, 10am in the UK
    expect(await emailUmpiringGaps(t.deps)).toEqual({ clubs: 1 });
    expect(t.mailer.sent).toHaveLength(1);
    const [mail] = t.mailer.sent;
    expect(mail).toMatchObject({ to: "admin@hawks.test", subject: "A fixture needs umpires" });
    expect(mail!.text).toContain("- Sat 26 Sep 2026, 14:00: M1 v Reading M1. Needs 1 more (Alex asked, no answer yet).");
    expect(mail!.text).not.toContain("Bristol");
    expect(mail!.text).toContain("https://hockey.test/dashboard/fixtures");

    at("2026-09-21T15:00:00Z");
    expect(await emailUmpiringGaps(t.deps)).toEqual({ clubs: 0 });
  });

  it("go two days before a gap on other days, but not before 8am", async () => {
    await setup();
    at("2026-09-23T09:00:00Z"); // Wednesday: nothing two days away
    expect(await emailUmpiringGaps(t.deps)).toEqual({ clubs: 0 });
    at("2026-09-24T06:00:00Z"); // Thursday, 7am in the UK
    expect(await emailUmpiringGaps(t.deps)).toEqual({ clubs: 0 });
    at("2026-09-24T07:30:00Z"); // 8:30am
    expect(await emailUmpiringGaps(t.deps)).toEqual({ clubs: 1 });
  });
});
