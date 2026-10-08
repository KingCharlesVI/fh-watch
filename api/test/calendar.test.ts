import { describe, expect, it } from "vitest";
import { escapeText, fold } from "../src/lib/ical.js";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

/** Unfolded lines of an iCalendar file. */
const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("an umpire's calendar", () => {
  it("has the appointments they've accepted, at local times, by a private address", async () => {
    const { club } = await t.createClub("Oxford Hawks", ["M1"]);
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    const sam = await t.createUser({ name: "Sam" });
    const alex = await t.createUser({ name: "Alex" });
    for (const u of [sam, alex]) await req("PUT", `/v1/clubs/${club.id}/umpires/${u.user.id}`, clubAdmin.headers, {});
    const fixtures = `/v1/clubs/${club.id}/fixtures`;
    const add = async (body: object) => (await req("POST", fixtures, clubAdmin.headers, body)).json();
    const kickOff = await add({ date: "2026-09-26", time: "14:00", home: { name: "M1" }, away: { name: "Reading, M1" }, venue: "Banbury Road", competition: "Hampshire Cup" });
    const allDay = await add({ date: "2026-10-03", home: { name: "M1" }, away: { name: "Bath" } });
    const offered = await add({ date: "2026-10-10", home: { name: "M1" }, away: { name: "Bristol" } });
    const appoint = async (f: { id: string }, u: typeof sam, role: string, accept = true) => {
      const a = (await req("POST", `${fixtures}/${f.id}/appointments`, clubAdmin.headers, { userId: u.user.id, role })).json();
      if (accept) await req("POST", `/v1/me/appointments/${a.id}/accept`, u.headers);
      return a;
    };
    const watch = await appoint(kickOff, sam, "watch");
    await appoint(kickOff, alex, "second");
    await appoint(allDay, sam, "second");
    await appoint(offered, sam, "watch", false);

    const { url } = (await req("GET", "/v1/me/calendar", sam.headers)).json();
    expect(url).toMatch(/^https:\/\/hockey\.test\/v1\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
    // The same address each time.
    expect((await req("GET", "/v1/me/calendar", sam.headers)).json().url).toBe(url);

    const res = await req("GET", new URL(url).pathname, {});
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/calendar; charset=utf-8");
    const ics = lines(res.body);
    expect(ics).toContain("X-WR-CALNAME:Umpiring: Sam");
    expect(ics.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(ics).toContain(`UID:${watch.id}@fhmatchcentre`);
    expect(ics).toContain("DTSTART;TZID=Europe/London:20260926T140000");
    expect(ics).toContain("DTEND;TZID=Europe/London:20260926T160000");
    expect(ics).toContain("SUMMARY:Umpiring M1 v Reading\\, M1");
    expect(ics).toContain("LOCATION:Banbury Road");
    expect(ics).toContain("DESCRIPTION:Watch umpire for Oxford Hawks.\\nWith Alex.\\nHampshire Cup");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261003");
    expect(ics).toContain("DTEND;VALUE=DATE:20261004");
    expect(res.body).not.toContain("Bristol");

    // A new address stops the old one working.
    const reset = (await req("POST", "/v1/me/calendar/reset", sam.headers)).json();
    expect(reset.url).not.toBe(url);
    expect((await req("GET", new URL(url).pathname, {})).statusCode).toBe(404);
    expect((await req("GET", new URL(reset.url).pathname, {})).statusCode).toBe(200);
  });

  it("needs signing in to get the address, and a real one to read", async () => {
    expect((await req("GET", "/v1/me/calendar", {})).statusCode).toBe(401);
    expect((await req("GET", `/v1/calendar/${"x".repeat(43)}.ics`, {})).statusCode).toBe(404);
    expect((await req("GET", "/v1/calendar/short.ics", {})).statusCode).toBe(400);
  });
});

describe("iCalendar text", () => {
  it("escapes the characters the format treats specially", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const folded = fold(line);
    for (const part of folded.split("\r\n")) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(fold("SHORT:line")).toBe("SHORT:line");
  });
});
