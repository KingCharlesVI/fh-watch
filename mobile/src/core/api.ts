import type {
  Club,
  FullMatch,
  Items,
  Match,
  MatchDocument,
  Page,
  Problem,
  TeamWithClub,
  TokenPair,
  User,
  ValidationIssue,
} from "@fh/shared";

/** Plain TypeScript: no React Native imports, so it runs under tests too. */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  accessExpiresAt: number;
}

export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(tokens: Tokens | null): Promise<void>;
}

/** The API answered with a problem. */
export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.title);
  }
  get status() {
    return this.problem.status;
  }
}

/** The API couldn't be reached. Safe to retry later. */
export class NetworkError extends Error {}

type Query = Record<string, string | number | boolean | undefined>;

/** A new account. The club request, like the website's, asks an admin for a club or to run one. */
export interface Registration {
  email: string;
  password: string;
  displayName: string;
  clubRequest?: { clubId: string } | { clubName: string; wantsAdmin: boolean };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  /** Send the access token. Default true. */
  auth?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetch?: typeof fetch;
  now?: () => number;
  /** Called when the session can't be refreshed, so the app can show sign-in. */
  onSignedOut?: () => void;
}

/** Refresh this long before the access token expires. */
const REFRESH_AHEAD_MS = 30_000;

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  /**
   * One refresh at a time: the API treats a refresh token presented twice as
   * stolen, so parallel requests must share a single refresh.
   */
  private refreshing: Promise<Tokens | null> | null = null;

  constructor(private readonly opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchFn = opts.fetch ?? ((...args) => fetch(...args));
    this.now = opts.now ?? Date.now;
  }

  // ---- Session ----

  async login(email: string, password: string): Promise<User> {
    const pair = await this.request<TokenPair>("/v1/auth/login", { method: "POST", auth: false, body: { email, password } });
    await this.store(pair);
    return pair.user;
  }

  async logout(): Promise<void> {
    const tokens = await this.opts.tokens.get();
    await this.opts.tokens.set(null);
    if (tokens) {
      await this.request("/v1/auth/logout", { method: "POST", auth: false, body: { refreshToken: tokens.refreshToken } }).catch(() => {});
    }
  }

  /**
   * Creates an account. The API answers the same way whether or not the email was
   * already in use, so nothing here reveals that; it emails a link to confirm the
   * address, and sign-in only works once that's done.
   */
  register = (body: Registration) => this.request<{ message: string }>("/v1/auth/register", { method: "POST", auth: false, body });

  /** Another confirmation email, for one that never arrived. */
  resendVerification = (email: string) =>
    this.request<{ message: string }>("/v1/auth/resend-verification", { method: "POST", auth: false, body: { email } });

  async hasSession(): Promise<boolean> {
    return (await this.opts.tokens.get()) !== null;
  }

  me = () => this.request<User>("/v1/me");

  // ---- Matches ----

  listMatches = (query: Query) => this.request<Page<Match>>("/v1/matches", { query });
  getMatch = (id: string) => this.request<FullMatch>(`/v1/matches/${id}`);

  /** Creates or saves a revision. `ifMatch` is the revision the document was based on (omit for a new match). */
  putMatch(id: string, document: MatchDocument, source: "watch" | "mobile", ifMatch?: number) {
    return this.request<{ match: Match; warnings: ValidationIssue[] }>(`/v1/matches/${id}`, {
      method: "PUT",
      body: { source, document },
      headers: ifMatch === undefined ? {} : { "if-match": `"${ifMatch}"` },
    });
  }

  publish = (id: string) => this.request<{ match: Match }>(`/v1/matches/${id}/publish`, { method: "POST" });
  unpublish = (id: string) => this.request<{ match: Match }>(`/v1/matches/${id}/unpublish`, { method: "POST" });

  setSecondUmpire(id: string, value: { userId: string } | { name: string } | null) {
    return this.request<{ match: Match }>(`/v1/matches/${id}/umpires/2`, value ? { method: "PUT", body: value } : { method: "DELETE" });
  }

  searchTeams = (q: string) => this.request<Items<TeamWithClub>>("/v1/teams", { query: { q } });
  /** Public, so it works from the registration screen, before there's an account. */
  searchClubs = (q: string) => this.request<Items<Club>>("/v1/clubs", { query: { q }, auth: false });
  searchUmpires = (q: string) => this.request<Items<{ id: string; displayName: string }>>("/v1/umpires", { query: { q } });

  registerPushToken = (token: string, platform: "ios" | "android") =>
    this.request("/v1/me/push-tokens", { method: "POST", body: { token, platform } });
  removePushToken = (token: string) => this.request(`/v1/me/push-tokens/${encodeURIComponent(token)}`, { method: "DELETE" });

  // ---- Plumbing ----

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const auth = options.auth ?? true;
    let token = auth ? await this.validAccessToken() : undefined;
    let res = await this.send(path, options, token);

    if (res.status === 401 && auth && token) {
      // The token was rejected even though it looked fresh (e.g. server restart): refresh once and retry.
      const tokens = await this.refresh();
      token = tokens?.accessToken;
      if (!token) throw await this.signedOut(res);
      res = await this.send(path, options, token);
    }
    if (res.status === 401 && auth) throw await this.signedOut(res);
    if (!res.ok) throw new ApiError(await toProblem(res));
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async send(path: string, options: RequestOptions, token: string | undefined): Promise<Response> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    try {
      return await this.fetchFn(url.toString(), {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new NetworkError(err instanceof Error ? err.message : "Network request failed");
    }
  }

  /** The current access token, refreshed first if it's about to expire. Undefined when signed out. */
  private async validAccessToken(): Promise<string | undefined> {
    const tokens = await this.opts.tokens.get();
    if (!tokens) return undefined;
    if (tokens.accessExpiresAt - REFRESH_AHEAD_MS > this.now()) return tokens.accessToken;
    return (await this.refresh())?.accessToken;
  }

  /** Swaps the refresh token for a new pair. Null means the session is over; NetworkError means try later. */
  private refresh(): Promise<Tokens | null> {
    this.refreshing ??= (async () => {
      try {
        const tokens = await this.opts.tokens.get();
        if (!tokens) return null;
        const res = await this.send("/v1/auth/refresh", { method: "POST", body: { refreshToken: tokens.refreshToken } }, undefined);
        if (res.status === 401) {
          await this.opts.tokens.set(null);
          return null;
        }
        if (!res.ok) throw new NetworkError(`Refresh failed with ${res.status}`);
        return this.store((await res.json()) as TokenPair);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async store(pair: TokenPair): Promise<Tokens> {
    const tokens = {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      accessExpiresAt: this.now() + pair.accessTokenExpiresIn * 1000,
    };
    await this.opts.tokens.set(tokens);
    return tokens;
  }

  private async signedOut(res: Response): Promise<ApiError> {
    await this.opts.tokens.set(null);
    this.opts.onSignedOut?.();
    return new ApiError(await toProblem(res));
  }
}

async function toProblem(res: Response): Promise<Problem> {
  try {
    return (await res.json()) as Problem;
  } catch {
    return { type: "/problems/unknown", title: `The server answered ${res.status}.`, status: res.status };
  }
}

/** A short, human message for any error from the client. */
export function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return "Can't reach the server. Check your connection.";
  if (err instanceof ApiError) return err.problem.title;
  return err instanceof Error ? err.message : "Something went wrong.";
}
