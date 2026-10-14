import { createHmac } from "node:crypto";
import type { Match, MatchDocument, WebhookPayload } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { chatMessage } from "../src/services/chat-messages.js";
import { RETRY_DELAYS_MS, deliverDue, httpsWebhookSender, isPublicAddress, purgeOldDeliveries } from "../src/services/webhooks.js";
import { matchDoc, setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string> = {}, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

const deliver = () => deliverDue(t.deps);
const sentPayloads = () => t.webhooks.sent.map((s) => JSON.parse(s.body) as WebhookPayload);

/** A club with a team and its admin, an umpire, and a webhook on the club. */
async function setup() {
  const { club, teams } = await t.createClub("Oxford Hawks", ["M1"]);
  const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
  const umpire = await t.createUser({ name: "Sam" });
  const created = await req("POST", "/v1/webhooks", clubAdmin.headers, { clubId: club.id, url: "https://hooks.example.com/fh", description: "League site" });
  expect(created.statusCode).toBe(201);
  const { webhook, secret } = created.json();
  return { club, team: teams[0]!, clubAdmin, umpire, webhook, secret };
}

/** The day a match was played, as a chat message gives it. */
const dayOf = (doc: MatchDocument) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date(doc.startedAt));

async function upload(doc: MatchDocument, headers: Record<string, string>, publish = true) {
  expect((await req("PUT", `/v1/matches/${doc.id}`, headers, { source: "watch", document: doc })).statusCode).toBe(201);
  if (publish) await req("POST", `/v1/matches/${doc.id}/publish`, headers);
}

describe("managing webhooks", () => {
  it("are for a club's admins, and a competition's for admins only", async () => {
    const { club, umpire, clubAdmin, webhook, secret } = await setup();
    expect(secret).toMatch(/^whsec_/);
    expect(webhook).toMatchObject({ clubId: club.id, competitionId: null, url: "https://hooks.example.com/fh", enabled: true, failures: 0 });
    expect(webhook).not.toHaveProperty("secret");

    const other = await t.createClub("Reading");
    const comp = (await req("POST", "/v1/competitions", (await t.createUser({ roles: ["admin"] })).headers, { name: "South League" })).json();
    const url = "https://hooks.example.com/x";
    expect((await req("POST", "/v1/webhooks", umpire.headers, { clubId: club.id, url })).statusCode).toBe(403);
    expect((await req("POST", "/v1/webhooks", clubAdmin.headers, { clubId: other.club.id, url })).statusCode).toBe(403);
    expect((await req("POST", "/v1/webhooks", clubAdmin.headers, { competitionId: comp.id, url })).statusCode).toBe(403);
    expect((await req("GET", `/v1/webhooks/${webhook.id}/deliveries`, umpire.headers)).statusCode).toBe(404);

    const list = await req("GET", "/v1/webhooks", clubAdmin.headers);
    expect(list.json().items.map((w: { id: string }) => w.id)).toEqual([webhook.id]);
  });

  it("must point at an https address on the public internet", async () => {
    const { club, clubAdmin } = await setup();
    for (const url of ["http://hooks.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://192.168.1.10/x", "https://[::1]/x", "https://printer.local/", "https://user:pw@hooks.example.com", "nope"]) {
      const res = await req("POST", "/v1/webhooks", clubAdmin.headers, { clubId: club.id, url });
      expect(res.statusCode, url).toBe(400);
      expect(res.json().type).toBe("/problems/invalid_url");
    }
  });

  it("are at most 5 for a club", async () => {
    const { club, clubAdmin } = await setup();
    for (let i = 0; i < 4; i++) await req("POST", "/v1/webhooks", clubAdmin.headers, { clubId: club.id, url: `https://hooks.example.com/${i}` });
    const sixth = await req("POST", "/v1/webhooks", clubAdmin.headers, { clubId: club.id, url: "https://hooks.example.com/6" });
    expect(sixth.json().type).toBe("/problems/too_many_webhooks");
  });

  it("get a new secret, and are recorded in the audit log without it", async () => {
    const { clubAdmin, webhook, secret } = await setup();
    const renewed = await req("POST", `/v1/webhooks/${webhook.id}/secret`, clubAdmin.headers);
    expect(renewed.json().secret).not.toBe(secret);
    const admin = await t.createUser({ roles: ["admin"] });
    const log = (await req("GET", `/v1/audit?entity=webhook&entityId=${webhook.id}`, admin.headers)).json().items;
    expect(log.map((e: { action: string }) => e.action)).toEqual(["new_secret", "create"]);
    expect(JSON.stringify(log)).not.toContain("whsec_");
  });
});

describe("delivering", () => {
  it("sends a club's published matches, signed, and not its drafts", async () => {
    const { team, umpire, webhook, secret } = await setup();
    await upload(matchDoc({ homeTeamId: team.id }), umpire.headers, false);
    await upload(matchDoc({ awayTeamId: null }), umpire.headers); // not the club's
    expect(await deliver()).toEqual({ delivered: 0, failed: 0, retrying: 0 });

    const doc = matchDoc({ homeTeamId: team.id });
    await upload(doc, umpire.headers);
    expect(await deliver()).toEqual({ delivered: 1, failed: 0, retrying: 0 });

    const [sent] = t.webhooks.sent;
    expect(sent!.url).toBe("https://hooks.example.com/fh");
    expect(sent!.headers).toMatchObject({ "content-type": "application/json", "x-fh-event": "match.published" });
    const [, ts, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sent!.headers["x-fh-signature"]!)!;
    expect(createHmac("sha256", secret).update(`${ts}.${sent!.body}`).digest("hex")).toBe(v1);

    const payload = sentPayloads()[0]!;
    expect(payload).toMatchObject({ event: "match.published", id: sent!.headers["x-fh-delivery"] });
    expect(payload.data.match).toMatchObject({ id: doc.id, status: "published", home: { name: "Oxford Hawks M1", score: 2 } });
    expect(payload.data.summary?.score).toEqual({ home: 2, away: 1 });

    const deliveries = (await req("GET", `/v1/webhooks/${webhook.id}/deliveries`, (await t.createUser({ roles: ["admin"] })).headers)).json().items;
    expect(deliveries).toMatchObject([{ event: "match.published", matchId: doc.id, status: "delivered", attempts: 1, responseStatus: 200 }]);
  });

  it("sends changes to a published match, and only its id when it's unpublished", async () => {
    const { team, umpire } = await setup();
    const doc = matchDoc({ homeTeamId: team.id });
    await upload(doc, umpire.headers);
    const edited = { ...structuredClone(doc), venue: "Pitch 2" };
    await req("PUT", `/v1/matches/${doc.id}`, { ...umpire.headers, "if-match": '"1"' }, { source: "mobile", document: edited });
    await req("PUT", `/v1/matches/${doc.id}/umpires/2`, umpire.headers, { name: "Pat" });
    await req("POST", `/v1/matches/${doc.id}/unpublish`, umpire.headers);
    await req("POST", `/v1/matches/${doc.id}/unpublish`, umpire.headers); // already a draft: nothing
    await deliver();
    const payloads = sentPayloads();
    expect(payloads.map((p) => p.event)).toEqual(["match.published", "match.updated", "match.updated", "match.unpublished"]);
    expect(payloads[1]!.data.match?.venue).toBe("Pitch 2");
    expect(payloads[2]!.data.match?.umpires.map((u) => u.name)).toEqual(["Sam", "Pat"]);
    expect(payloads[3]!.data).toEqual({ matchId: doc.id });
  });

  it("sends a competition's matches, whatever the capitals", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const comp = (await req("POST", "/v1/competitions", admin.headers, { name: "South League Premier" })).json();
    expect((await req("POST", "/v1/webhooks", admin.headers, { competitionId: comp.id, url: "https://league.example.org/in" })).statusCode).toBe(201);
    const umpire = await t.createUser();
    await upload({ ...matchDoc(), competition: "south league premier" }, umpire.headers);
    await upload({ ...matchDoc(), competition: "Hampshire Cup" }, umpire.headers);
    await deliver();
    expect(t.webhooks.sent.map((s) => s.url)).toEqual(["https://league.example.org/in"]);
  });

  it("tries again later, gives up after 6 attempts, and turns off a webhook that keeps failing", async () => {
    const { team, umpire, webhook } = await setup();
    t.webhooks.respond = () => 500;
    await upload(matchDoc({ homeTeamId: team.id }), umpire.headers);
    expect(await deliver()).toEqual({ delivered: 0, failed: 0, retrying: 1 });
    expect(await deliver()).toEqual({ delivered: 0, failed: 0, retrying: 0 }); // not due yet
    for (const wait of RETRY_DELAYS_MS) {
      t.advance(wait);
      await deliver();
    }
    expect(t.webhooks.sent).toHaveLength(6);
    // Access tokens don't last the hours this takes: sign in afresh each time.
    const admin = async () => (await t.createUser({ roles: ["admin"] })).headers;
    const [d] = (await req("GET", `/v1/webhooks/${webhook.id}/deliveries`, await admin())).json().items;
    expect(d).toMatchObject({ status: "failed", attempts: 6, responseStatus: 500, error: "The receiver answered 500.", nextAttemptAt: null });

    // Four more that fail for good turn it off.
    t.webhooks.respond = () => new Error("connect ECONNREFUSED");
    for (let i = 0; i < 4; i++) {
      await upload(matchDoc({ homeTeamId: team.id }), (await t.createUser()).headers);
      for (let a = 0; a <= RETRY_DELAYS_MS.length; a++) {
        await deliver();
        t.advance(RETRY_DELAYS_MS.at(-1)!);
      }
    }
    const [off] = (await req("GET", "/v1/webhooks", await admin())).json().items;
    expect(off).toMatchObject({ enabled: false, failures: 5 });

    t.webhooks.sent.length = 0;
    await upload(matchDoc({ homeTeamId: team.id }), (await t.createUser()).headers);
    await deliver();
    expect(t.webhooks.sent).toHaveLength(0);
    expect((await req("POST", `/v1/webhooks/${webhook.id}/ping`, await admin())).statusCode).toBe(400);

    const on = await req("PATCH", `/v1/webhooks/${webhook.id}`, await admin(), { enabled: true });
    expect(on.json()).toMatchObject({ enabled: true, failures: 0 });
  });

  it("sends a test ping when asked", async () => {
    const { clubAdmin, webhook } = await setup();
    const ping = await req("POST", `/v1/webhooks/${webhook.id}/ping`, clubAdmin.headers);
    expect(ping.statusCode).toBe(202);
    expect(ping.json()).toMatchObject({ event: "ping", status: "pending" });
    await deliver();
    expect(sentPayloads()).toMatchObject([{ event: "ping", data: {} }]);
  });

  it("are deleted 30 days later", async () => {
    const { clubAdmin, webhook } = await setup();
    await req("POST", `/v1/webhooks/${webhook.id}/ping`, clubAdmin.headers);
    await deliver();
    t.advance(29 * 24 * 3600_000);
    expect(await purgeOldDeliveries(t.deps)).toEqual({ deliveries: 0 });
    t.advance(2 * 24 * 3600_000);
    expect(await purgeOldDeliveries(t.deps)).toEqual({ deliveries: 1 });
  });
});

describe("chat channels", () => {
  const add = (headers: Record<string, string>, clubId: string, format: string, url: string) => req("POST", "/v1/webhooks", headers, { clubId, format, url });

  it("get a message instead of the signed payload, in each platform's shape", async () => {
    const { club, team, clubAdmin, umpire } = await setup();
    expect((await add(clubAdmin.headers, club.id, "slack", "https://hooks.slack.com/services/T0/B0/x")).json().webhook.format).toBe("slack");
    await add(clubAdmin.headers, club.id, "discord", "https://discord.com/api/webhooks/1/x");
    await add(clubAdmin.headers, club.id, "teams", "https://prod-01.uksouth.logic.azure.com:443/workflows/x/triggers/manual/paths/invoke");
    const doc = { ...matchDoc({ homeTeamId: team.id }), competition: "South League", venue: "Pitch 2" };
    await upload(doc, umpire.headers);
    await deliver();
    const bodies = Object.fromEntries(t.webhooks.sent.map((s) => [new URL(s.url).hostname, JSON.parse(s.body)]));
    const { shareUrl, away } = bodies["hooks.example.com"].data.match;
    const result = `Result: Oxford Hawks M1 2–1 ${away.name}`;

    expect(bodies["hooks.slack.com"].text).toBe(`*${result}*\nSouth League · ${dayOf(doc)} · Pitch 2\n<${shareUrl}|Match report>`);
    expect(bodies["discord.com"]).toMatchObject({ allowed_mentions: { parse: [] }, embeds: [{ title: result, url: shareUrl, color: 0x2e7d32 }] });
    const card = bodies["prod-01.uksouth.logic.azure.com"].attachments[0];
    expect(card.contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(card.content.body[0].text).toBe(result);
    expect(card.content.actions).toEqual([{ type: "Action.OpenUrl", title: "Match report", url: shareUrl }]);
    // The umpires aren't named in a channel anyone might read.
    expect(JSON.stringify(bodies["hooks.slack.com"])).not.toContain("Sam");
  });

  it("still name a match that's withdrawn, without its link", async () => {
    const { club, team, clubAdmin, umpire } = await setup();
    await add(clubAdmin.headers, club.id, "slack", "https://hooks.slack.com/services/T0/B0/x");
    const doc = matchDoc({ homeTeamId: team.id });
    await upload(doc, umpire.headers);
    await req("POST", `/v1/matches/${doc.id}/unpublish`, umpire.headers);
    await deliver();
    const slack = t.webhooks.sent.filter((s) => s.url.startsWith("https://hooks.slack.com")).map((s) => JSON.parse(s.body).text as string);
    expect(slack[1]).toMatch(/^\*Result withdrawn: Oxford Hawks M1 2–1 /);
    expect(slack[1]).not.toContain("Match report");
  });

  it("send a test message when asked", async () => {
    const { club, clubAdmin } = await setup();
    const { webhook } = (await add(clubAdmin.headers, club.id, "discord", "https://discord.com/api/webhooks/1/x")).json();
    await req("POST", `/v1/webhooks/${webhook.id}/ping`, clubAdmin.headers);
    await deliver();
    expect(JSON.parse(t.webhooks.sent.at(-1)!.body).embeds[0].title).toBe("Test from FH Match Centre");
  });

  it("catch an address pasted under the wrong platform", async () => {
    const { club, clubAdmin, webhook } = await setup();
    for (const [format, url] of [
      ["slack", "https://discord.com/api/webhooks/1/x"],
      ["discord", "https://hooks.slack.com/services/x"],
      ["json", "https://hooks.slack.com/services/x"],
    ] as const) {
      const res = await add(clubAdmin.headers, club.id, format, url);
      expect(res.statusCode, `${format} ${url}`).toBe(400);
      expect(res.json().type).toBe("/problems/invalid_url");
    }
    expect((await req("PATCH", `/v1/webhooks/${webhook.id}`, clubAdmin.headers, { url: "https://discord.com/api/webhooks/1/x" })).statusCode).toBe(400);
  });

  it("escape what the platform would read as formatting", () => {
    const match = {
      home: { name: "<Stars> & *Co*", score: 1, shootout: 3, teamId: null },
      away: { name: "@everyone", score: 1, shootout: 2, teamId: null },
      competition: null,
      venue: null,
      playedAt: "2026-10-10T13:00:00.000Z",
      shareUrl: "https://app.example.com/m/X",
    } as unknown as Match;
    expect((chatMessage("slack", "match.published", match) as { text: string }).text).toBe(
      "*Result: &lt;Stars&gt; &amp; *Co* 1–1 @everyone (3–2 in the shootout)*\nSat 10 Oct\n<https://app.example.com/m/X|Match report>",
    );
    expect((chatMessage("discord", "match.published", match) as { embeds: { title: string }[] }).embeds[0]!.title).toBe(
      "Result: <Stars\\> & \\*Co\\* 1–1 @everyone (3–2 in the shootout)",
    );
  });
});

describe("isPublicAddress", () => {
  it.each([
    ["93.184.216.34", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.1", false],
    ["192.168.1.87", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["::", false],
    ["fd12::1", false],
    ["fe80::1", false],
    ["::ffff:192.168.1.1", false],
    ["::ffff:93.184.216.34", true],
    ["::ffff:c0a8:101", false],
    ["::ffff:5db8:d822", true],
    ["not an ip", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

describe("the https sender", () => {
  const send = (url: string) => httpsWebhookSender().send({ url, body: "{}", headers: {} });

  it("won't connect to a name that leads to this machine or an address on its network", async () => {
    await expect(send("https://localhost:9/")).rejects.toThrow("leads to a private address");
    await expect(send("https://127.0.0.1:9/")).rejects.toThrow("is a private address");
    await expect(send("https://[::1]:9/")).rejects.toThrow("is a private address");
  });

  it("only speaks https", async () => {
    await expect(send("http://example.com/")).rejects.toThrow("Only https");
  });
});
