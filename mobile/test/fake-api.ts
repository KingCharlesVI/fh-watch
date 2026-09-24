import { type Match, type MatchDocument, parseMatch, summarizeMatch } from "@fh/shared";

/**
 * An in-memory stand-in for the real API, faithful where the sync engine
 * relies on it: token rotation, If-Match revisions, 412/428, validation,
 * publishing. It can also go offline, fail, or lose a reply.
 */

interface StoredMatch {
  revisions: { document: MatchDocument; source: string }[];
  status: "draft" | "published";
  shareCode: string | null;
  umpireId: string;
  createdAt: string;
}

export const USER = { id: "u1", email: "sam@example.com", displayName: "Sam", roles: ["umpire"], clubId: null, emailVerified: true, deletionRequested: false, createdAt: "2026-01-01T00:00:00Z" };
const PASSWORD = "correct horse battery";

export class FakeApi {
  readonly matches = new Map<string, StoredMatch>();
  /** Every request, as "METHOD /path". */
  readonly calls: string[] = [];
  offline = false;
  /** Status codes to answer the next requests with, before normal handling. */
  readonly failNext: number[] = [];
  /** Process a PUT but throw away its reply, as if the connection dropped: 1 = the next PUT, 2 = the one after. */
  dropPutReply: number | null = null;
  /** Runs during the next PUT, before it's answered: for "edited while uploading". */
  duringNextPut: (() => Promise<void>) | null = null;
  /** Runs after the next match list is read but before it's answered: for "uploaded while listing". */
  duringNextList: (() => Promise<void>) | null = null;

  private accessTokens = new Set<string>();
  private refreshTokens = new Map<string, "live" | "spent">();
  private counter = 0;

  constructor(private readonly now: () => number) {}

  expireAccessTokens() {
    this.accessTokens.clear();
  }

  revokeSessions() {
    this.accessTokens.clear();
    for (const k of this.refreshTokens.keys()) this.refreshTokens.set(k, "spent");
  }

  /** A change made elsewhere, e.g. on the website. */
  editOnServer(id: string, change: (doc: MatchDocument) => void) {
    const m = this.matches.get(id)!;
    const doc = JSON.parse(JSON.stringify(m.revisions.at(-1)!.document)) as MatchDocument;
    change(doc);
    m.revisions.push({ document: doc, source: "web" });
  }

  current(id: string) {
    return this.matches.get(id)?.revisions.at(-1)?.document;
  }

  count(prefix: string) {
    return this.calls.filter((c) => c.startsWith(prefix)).length;
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const path = url.pathname;
    this.calls.push(`${method} ${path}`);
    if (this.offline) throw new TypeError("Network request failed");

    const failure = this.failNext.shift();
    if (failure) return problem(failure, `Failed with ${failure}`);

    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init.headers);

    if (path === "/v1/auth/login" && method === "POST") {
      if (body.email !== USER.email || body.password !== PASSWORD) return problem(401, "Email or password is wrong.");
      return json(200, this.issueTokens());
    }
    if (path === "/v1/auth/refresh" && method === "POST") {
      const state = this.refreshTokens.get(body.refreshToken);
      if (state !== "live") return problem(401, "Session ended.");
      this.refreshTokens.set(body.refreshToken, "spent");
      return json(200, this.issueTokens());
    }
    if (path === "/v1/auth/logout") return new Response(null, { status: 204 });

    const auth = headers.get("authorization")?.replace(/^Bearer /, "");
    if (!auth || !this.accessTokens.has(auth)) return problem(401, "Sign in required.");

    if (path === "/v1/me") return json(200, USER);

    if (path === "/v1/matches" && method === "GET") {
      const items = [...this.matches.entries()]
        .filter(([, m]) => m.umpireId === url.searchParams.get("umpireId"))
        .map(([id]) => this.dto(id));
      const during = this.duringNextList;
      this.duringNextList = null;
      await during?.();
      return json(200, { items, nextCursor: null });
    }

    const one = /^\/v1\/matches\/([^/]+)(?:\/(publish|unpublish))?$/.exec(path);
    if (one) {
      const id = one[1]!;
      if (one[2]) {
        const m = this.matches.get(id);
        if (!m) return problem(404, "Match not found.");
        m.status = one[2] === "publish" ? "published" : "draft";
        m.shareCode ??= "K7P2QX";
        return json(200, { match: this.dto(id) });
      }
      if (method === "GET") {
        const m = this.matches.get(id);
        if (!m) return problem(404, "Match not found.");
        return json(200, { match: this.dto(id), document: m.revisions.at(-1)!.document, summary: summarizeMatch(m.revisions.at(-1)!.document) });
      }
      if (method === "PUT") return this.put(id, body, headers.get("if-match"));
    }
    return problem(404, `No route for ${method} ${path}`);
  };

  private async put(id: string, body: { source: string; document: MatchDocument }, ifMatch: string | null): Promise<Response> {
    const parsed = parseMatch(body.document);
    if (!parsed.ok) return problem(422, "The match document has errors.");
    const existing = this.matches.get(id);
    let status = 200;
    if (!existing) {
      this.matches.set(id, {
        revisions: [{ document: parsed.match, source: body.source }],
        status: "draft",
        shareCode: null,
        umpireId: USER.id,
        createdAt: new Date(this.now()).toISOString(),
      });
      status = 201;
    } else {
      const current = existing.revisions.at(-1)!.document;
      if (JSON.stringify(current) !== JSON.stringify(parsed.match)) {
        if (!ifMatch) return problem(428, "Send If-Match.");
        if (Number(ifMatch.replaceAll('"', "")) !== existing.revisions.length) return problem(412, "The match changed.");
        existing.revisions.push({ document: parsed.match, source: body.source });
      }
    }
    const during = this.duringNextPut;
    this.duringNextPut = null;
    await during?.();
    if (this.dropPutReply !== null && --this.dropPutReply === 0) {
      this.dropPutReply = null;
      throw new TypeError("Network request failed");
    }
    return json(status, { match: this.dto(id), warnings: parsed.warnings });
  }

  private issueTokens() {
    const accessToken = `at-${++this.counter}`;
    const refreshToken = `rt-${this.counter}`;
    this.accessTokens.add(accessToken);
    this.refreshTokens.set(refreshToken, "live");
    return { accessToken, accessTokenExpiresIn: 900, refreshToken, user: USER };
  }

  private dto(id: string): Match {
    const m = this.matches.get(id)!;
    const doc = m.revisions.at(-1)!.document;
    const s = summarizeMatch(doc);
    return {
      id,
      status: m.status,
      playedAt: doc.startedAt,
      endedAt: doc.endedAt ?? null,
      home: { name: doc.teams.home.name, teamId: doc.teams.home.teamId, score: s.score.home, shootout: s.shootout?.home ?? null },
      away: { name: doc.teams.away.name, teamId: doc.teams.away.teamId, score: s.score.away, shootout: s.shootout?.away ?? null },
      venue: doc.venue ?? null,
      competition: doc.competition ?? null,
      umpires: [{ slot: 1, userId: m.umpireId, name: "Sam" }],
      currentRevision: m.revisions.length,
      shareCode: m.shareCode,
      shareUrl: m.shareCode ? `https://fhmatchcentre.com/m/${m.shareCode}` : null,
      publishedAt: null,
      autoPublishAt: null,
      createdAt: m.createdAt,
      updatedAt: m.createdAt,
    };
  }
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function problem(status: number, title: string) {
  return json(status, { type: `/problems/${status}`, title, status });
}

export { PASSWORD };
