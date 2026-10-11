import { describe, expect, it } from "vitest";
import { PASSWORD, setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

/** A club with its admin, three umpires on its list, and a fixture next Saturday (the clock is 2026-09-19). */
async function setup(fixture: object = {}, clubName = "Oxford Hawks") {
  const { club } = await t.createClub(clubName, ["M1"]);
  const at = clubName === "Oxford Hawks" ? "hawks.test" : `${club.slug}.test`;
  const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id, email: `admin@${at}` });
  const [sam, alex, jo] = [
    await t.createUser({ name: "Sam", email: `sam@${at}` }),
    await t.createUser({ name: "Alex", email: `alex@${at}` }),
    await t.createUser({ name: "Jo", email: `jo@${at}` }),
  ];
  for (const u of [sam!, alex!, jo!]) await req("PUT", `/v1/clubs/${club.id}/umpires/${u.user.id}`, clubAdmin.headers, {});
  const f = (
    await req("POST", `/v1/clubs/${club.id}/fixtures`, clubAdmin.headers, {
      date: "2026-09-26",
      time: "14:00",
      home: { name: "M1" },
      away: { name: "Reading M1" },
      venue: "Banbury Road",
      ...fixture,
    })
  ).json();
  const base = `/v1/clubs/${club.id}/fixtures/${f.id}`;
  const appoint = (u: { user: { id: string } }, role: "watch" | "second", extra: object = {}) =>
    req("POST", `${base}/appointments`, clubAdmin.headers, { userId: u.user.id, role, ...extra });
  t.mailer.sent.length = 0;
  return { club, clubAdmin, sam: sam!, alex: alex!, jo: jo!, fixture: f, base, appoint };
}

const mailsTo = (to: string) => t.mailer.sent.filter((m) => m.to === to);

describe("appointing umpires", () => {
  it("asks an umpire, who's emailed and accepts; the fixture shows it", async () => {
    const { clubAdmin, sam, base, appoint } = await setup();
    const res = await appoint(sam, "watch");
    expect(res.statusCode).toBe(201);
    const appointment = res.json();
    expect(appointment).toMatchObject({ userId: sam.user.id, displayName: "Sam", role: "watch", status: "offered", mentoring: false, coverRequested: false });
    expect(mailsTo("sam@hawks.test")[0]!.subject).toBe("Can you umpire M1 v Reading M1?");
    expect(mailsTo("sam@hawks.test")[0]!.text).toContain("watch umpire for M1 v Reading M1, Sat 26 Sep 2026, 14:00 at Banbury Road");

    const mine = (await req("GET", "/v1/me/appointments", sam.headers)).json().items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: appointment.id, status: "offered", fixture: { date: "2026-09-26", time: "14:00" }, club: { name: "Oxford Hawks" }, colleague: null });

    expect((await req("POST", `/v1/me/appointments/${appointment.id}/accept`, sam.headers)).json().status).toBe("accepted");
    // The club's admins are told.
    const accepted = mailsTo("admin@hawks.test").at(-1)!;
    expect(accepted.subject).toBe("Sam will umpire M1 v Reading M1");
    expect(accepted.text).toContain("Sam has accepted being watch umpire for M1 v Reading M1, Sat 26 Sep 2026, 14:00.");
    expect(accepted.html).toContain("Appointment accepted");
    expect((await req("POST", `/v1/me/appointments/${appointment.id}/decline`, sam.headers)).statusCode).toBe(409);

    const fixture = (await req("GET", base, clubAdmin.headers)).json();
    expect(fixture.appointments).toEqual([expect.objectContaining({ displayName: "Sam", status: "accepted" })]);
  });

  it("has one watch umpire and one second, no more than the fixture needs, from the club's list", async () => {
    const { club, sam, alex, jo, appoint } = await setup();
    expect((await appoint(sam, "watch")).statusCode).toBe(201);
    expect((await appoint(alex, "watch")).statusCode).toBe(409);
    expect((await appoint(sam, "second")).statusCode).toBe(409);
    expect((await appoint(alex, "second", { mentoring: true })).json()).toMatchObject({ role: "second", mentoring: true });
    expect((await appoint(jo, "second")).statusCode).toBe(409);

    const outsider = await t.createUser();
    expect((await appoint(outsider, "second")).statusCode).toBe(400);

    // With one needed, the second place isn't there.
    const one = await setup({ umpiresNeeded: 1 }, "Reading");
    expect((await one.appoint(one.sam, "second")).statusCode).toBe(201);
    expect((await one.appoint(one.alex, "watch")).statusCode).toBe(409);
    expect(club.id).not.toBe(one.club.id);
  });

  it("lets a declined place be offered again, and tells the club's admins", async () => {
    const { sam, alex, appoint } = await setup();
    const offer = (await appoint(sam, "watch")).json();
    expect((await req("POST", `/v1/me/appointments/${offer.id}/decline`, sam.headers)).json().status).toBe("declined");
    expect(mailsTo("admin@hawks.test")[0]!.subject).toBe("Sam can't umpire M1 v Reading M1");
    expect((await appoint(alex, "watch")).statusCode).toBe(201);
  });

  it("shows each umpire who they're with", async () => {
    const { sam, alex, appoint } = await setup();
    await appoint(sam, "watch");
    await appoint(alex, "second");
    const [mine] = (await req("GET", "/v1/me/appointments", sam.headers)).json().items;
    expect(mine.colleague).toEqual({ displayName: "Alex", role: "second", status: "offered" });
  });

  it("is only for the club's admins, and umpires answer only their own", async () => {
    const { sam, alex, base, appoint } = await setup();
    expect((await req("POST", `${base}/appointments`, sam.headers, { userId: sam.user.id, role: "watch" })).statusCode).toBe(403);
    const offer = (await appoint(sam, "watch")).json();
    expect((await req("POST", `/v1/me/appointments/${offer.id}/accept`, alex.headers)).statusCode).toBe(404);
  });

  it("takes an umpire off, telling them", async () => {
    const { clubAdmin, sam, base, appoint } = await setup();
    const offer = (await appoint(sam, "watch")).json();
    t.mailer.sent.length = 0;
    expect((await req("DELETE", `${base}/appointments/${offer.id}`, clubAdmin.headers)).statusCode).toBe(204);
    expect(mailsTo("sam@hawks.test")[0]!.subject).toBe("You're no longer umpiring M1 v Reading M1");
    expect((await req("GET", "/v1/me/appointments", sam.headers)).json().items).toEqual([]);
  });

  it("tells appointed umpires when their fixture moves or is cancelled", async () => {
    const { clubAdmin, sam, base, appoint } = await setup();
    await appoint(sam, "watch");
    t.mailer.sent.length = 0;
    await req("PATCH", base, clubAdmin.headers, { notes: "Bring a whistle" });
    expect(mailsTo("sam@hawks.test")).toEqual([]);
    await req("PATCH", base, clubAdmin.headers, { time: "15:30" });
    expect(mailsTo("sam@hawks.test")[0]!.text).toContain("It's now Sat 26 Sep 2026, 15:30 at Banbury Road.");
    await req("DELETE", base, clubAdmin.headers);
    expect(mailsTo("sam@hawks.test")[1]!.subject).toBe("M1 v Reading M1 is off");
  });

  it("can't be changed once the fixture has been played", async () => {
    const { sam, base, appoint } = await setup();
    const offer = (await appoint(sam, "watch")).json();
    t.advance(8 * 24 * 60 * 60 * 1000);
    // Signed in again, as the old access token has expired by then.
    const login = async (email: string) => ({
      authorization: `Bearer ${(await req("POST", "/v1/auth/login", {}, { email, password: PASSWORD })).json().accessToken}`,
    });
    expect((await req("POST", `/v1/me/appointments/${offer.id}/accept`, await login("sam@hawks.test"))).statusCode).toBe(400);
    const res = await req("POST", `${base}/appointments`, await login("admin@hawks.test"), { userId: sam.user.id, role: "second" });
    expect(res.statusCode).toBe(400);
  });
});

describe("cover", () => {
  it("is asked for, offered to the club's other umpires, and taken over by one of them", async () => {
    const { clubAdmin, sam, alex, jo, base, appoint } = await setup();
    const offer = (await appoint(sam, "watch")).json();
    await req("POST", `/v1/me/appointments/${offer.id}/accept`, sam.headers);

    // Only accepted appointments can ask.
    t.mailer.sent.length = 0;
    expect((await req("POST", `/v1/me/appointments/${offer.id}/cover`, sam.headers, { requested: true })).json().coverRequested).toBe(true);
    expect(t.mailer.sent.map((m) => m.to).sort()).toEqual(["admin@hawks.test", "alex@hawks.test", "jo@hawks.test"]);
    expect(mailsTo("alex@hawks.test")[0]!.subject).toBe("Cover needed: M1 v Reading M1, Sat 26 Sep 2026, 14:00");

    // Alex and Jo see it; Sam doesn't see their own.
    expect((await req("GET", "/v1/me/cover-requests", sam.headers)).json().items).toEqual([]);
    const open = (await req("GET", "/v1/me/cover-requests", alex.headers)).json().items;
    expect(open).toEqual([expect.objectContaining({ id: offer.id, displayName: "Sam", fixture: expect.objectContaining({ date: "2026-09-26" }) })]);

    t.mailer.sent.length = 0;
    const taken = await req("POST", `/v1/me/cover-requests/${offer.id}/take`, alex.headers);
    expect(taken.statusCode).toBe(201);
    expect(taken.json()).toMatchObject({ userId: alex.user.id, role: "watch", status: "accepted" });
    expect(mailsTo("sam@hawks.test")[0]!.subject).toBe("Alex is covering M1 v Reading M1");
    expect(mailsTo("admin@hawks.test")[0]!.text).toContain("covering for Sam");

    // It's gone for everyone else, and from Sam's list.
    expect((await req("POST", `/v1/me/cover-requests/${offer.id}/take`, jo.headers)).statusCode).toBe(404);
    expect((await req("GET", "/v1/me/cover-requests", jo.headers)).json().items).toEqual([]);
    expect((await req("GET", "/v1/me/appointments", sam.headers)).json().items).toEqual([]);
    const fixture = (await req("GET", base, clubAdmin.headers)).json();
    expect(fixture.appointments.map((a: { displayName: string }) => a.displayName)).toEqual(["Alex"]);
  });

  it("can be called off, and isn't for umpires outside the club or already on the fixture", async () => {
    const { sam, alex, jo, appoint } = await setup();
    const watch = (await appoint(sam, "watch")).json();
    const second = (await appoint(alex, "second")).json();
    await req("POST", `/v1/me/appointments/${watch.id}/accept`, sam.headers);
    await req("POST", `/v1/me/appointments/${second.id}/accept`, alex.headers);
    expect((await req("POST", `/v1/me/appointments/${second.id}/cover`, alex.headers, { requested: true })).statusCode).toBe(200);

    // Sam is on the fixture already, so isn't offered Alex's place.
    expect((await req("GET", "/v1/me/cover-requests", sam.headers)).json().items).toEqual([]);
    const outsider = await t.createUser();
    expect((await req("POST", `/v1/me/cover-requests/${second.id}/take`, outsider.headers)).statusCode).toBe(403);

    await req("POST", `/v1/me/appointments/${second.id}/cover`, alex.headers, { requested: false });
    expect((await req("GET", "/v1/me/cover-requests", jo.headers)).json().items).toEqual([]);
  });
});
