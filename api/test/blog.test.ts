import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp({ env: { LANDING_URL: "https://fhmatchcentre.test" } });

const LANDING = "https://fhmatchcentre.test";

const file = (front: string, body = "The post itself, with a [link](/changelog).") => `---\n${front}\n---\n\n${body}\n`;
const WELCOME = file("title: Welcome to the blog\ndate: 2026-10-23\nsummary: News goes here.\nauthor: The team");

async function upload(slug: string, markdown: string, headers?: Record<string, string>) {
  const admin = headers ?? (await t.createUser({ roles: ["admin"] })).headers;
  return t.app.inject({ method: "PUT", url: `/v1/blog/posts/${slug}`, headers: admin, payload: { markdown } });
}

describe("blog", () => {
  it("publishes an uploaded Markdown file for anyone, the landing page included, to read", async () => {
    const res = await upload("welcome", WELCOME);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ slug: "welcome", title: "Welcome to the blog", date: "2026-10-23", summary: "News goes here.", author: "The team", draft: false });

    const list = await t.app.inject({ method: "GET", url: "/v1/blog/posts", headers: { origin: LANDING } });
    expect(list.headers["access-control-allow-origin"]).toBe(LANDING);
    expect(list.headers["cache-control"]).toBe("public, max-age=60");
    expect(list.json().items).toMatchObject([{ slug: "welcome", title: "Welcome to the blog" }]);
    expect(list.json().items[0].body).toBeUndefined();

    const one = await t.app.inject({ method: "GET", url: "/v1/blog/posts/welcome", headers: { origin: LANDING } });
    expect(one.headers["access-control-allow-origin"]).toBe(LANDING);
    // Without the front matter.
    expect(one.json().body).toBe("The post itself, with a [link](/changelog).");
  });

  it("replaces the post when the same slug is uploaded again", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    await upload("welcome", WELCOME, admin.headers);
    const res = await upload("welcome", file("title: Welcome, again\ndate: 2026-10-24", "Changed."), admin.headers);
    expect(res.statusCode).toBe(200);
    const list = await t.app.inject({ method: "GET", url: "/v1/blog/posts" });
    expect(list.json().items).toMatchObject([{ slug: "welcome", title: "Welcome, again", summary: null, author: null }]);
  });

  it("lists posts newest first", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    await upload("older", file("title: Older\ndate: 2026-09-01"), admin.headers);
    await upload("newer", file("title: Newer\ndate: 2026-10-01"), admin.headers);
    const list = await t.app.inject({ method: "GET", url: "/v1/blog/posts" });
    expect(list.json().items.map((p: { slug: string }) => p.slug)).toEqual(["newer", "older"]);
  });

  it("keeps drafts to admins", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    await upload("soon", file("title: Coming soon\ndate: 2026-11-01\ndraft: true"), admin.headers);

    expect((await t.app.inject({ method: "GET", url: "/v1/blog/posts" })).json().items).toEqual([]);
    expect((await t.app.inject({ method: "GET", url: "/v1/blog/posts/soon" })).statusCode).toBe(404);

    const mine = await t.app.inject({ method: "GET", url: "/v1/blog/posts?drafts=true", headers: admin.headers });
    expect(mine.json().items).toMatchObject([{ slug: "soon", draft: true }]);
    expect(mine.headers["cache-control"]).toBe("no-store");
    expect((await t.app.inject({ method: "GET", url: "/v1/blog/posts/soon", headers: admin.headers })).json().draft).toBe(true);

    const umpire = await t.createUser({ roles: ["umpire"] });
    expect((await t.app.inject({ method: "GET", url: "/v1/blog/posts?drafts=true", headers: umpire.headers })).statusCode).toBe(403);
  });

  it("says what's wrong with a file that isn't a post", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const problem = async (markdown: string) => (await upload("bad", markdown, admin.headers)).json();
    expect(await problem("Just some text.")).toMatchObject({ status: 400, type: "/problems/no_front_matter" });
    expect(await problem(file("date: 2026-10-23"))).toMatchObject({ type: "/problems/no_title" });
    expect(await problem(file("title: A post\ndate: 23/10/2026"))).toMatchObject({ type: "/problems/bad_date" });
    expect(await problem(file("title: A post\ndate: 2026-10-23", ""))).toMatchObject({ type: "/problems/no_body" });
    // Saved with Windows line endings, and a byte-order mark, it's still a post.
    expect((await upload("windows", `﻿${WELCOME.replaceAll("\n", "\r\n")}`, admin.headers)).statusCode).toBe(201);
    expect((await upload("Not A Slug", WELCOME, admin.headers)).statusCode).toBe(400);
  });

  it("lets only admins upload and delete", async () => {
    const umpire = await t.createUser({ roles: ["umpire"] });
    expect((await upload("welcome", WELCOME, umpire.headers)).statusCode).toBe(403);
    expect((await t.app.inject({ method: "PUT", url: "/v1/blog/posts/welcome", payload: { markdown: WELCOME } })).statusCode).toBe(401);

    const admin = await t.createUser({ roles: ["admin"] });
    await upload("welcome", WELCOME, admin.headers);
    expect((await t.app.inject({ method: "DELETE", url: "/v1/blog/posts/welcome", headers: umpire.headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "DELETE", url: "/v1/blog/posts/welcome", headers: admin.headers })).statusCode).toBe(204);
    expect((await t.app.inject({ method: "GET", url: "/v1/blog/posts/welcome" })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "DELETE", url: "/v1/blog/posts/welcome", headers: admin.headers })).statusCode).toBe(404);
  });
});
