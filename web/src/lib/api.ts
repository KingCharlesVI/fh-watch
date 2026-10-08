import { unstable_cache } from "next/cache";
import { cookies, headers } from "next/headers";
import { clientIpHeaders } from "./client-ip";
import { ACCESS_COOKIE } from "./session-cookies";
import type { Problem } from "./types";

// Server-side only: talks to the API with the signed-in user's access token from the cookie.

export const API_URL = (process.env.API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.title);
  }
  get status() {
    return this.problem.status;
  }
}

export interface ApiOptions {
  method?: string;
  /** Sent as JSON, or a Blob as-is with its own type (e.g. a club logo). */
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send the user's access token if there is one. Default true. */
  auth?: boolean;
}

/** Passes the visitor's IP on, so the API's per-IP rate limits apply per visitor, not to this server. */
export async function forwardedFor(): Promise<Record<string, string>> {
  return clientIpHeaders(await headers());
}

export function apiUrl(path: string, query?: ApiOptions["query"]): string {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Raw fetch to the API with auth and forwarding headers; the caller handles the response. */
export async function apiFetch(path: string, options: ApiOptions = {}): Promise<Response> {
  const token = options.auth === false ? undefined : (await cookies()).get(ACCESS_COOKIE)?.value;
  const { body } = options;
  return fetch(apiUrl(path, options.query), {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: {
      ...(await forwardedFor()),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body instanceof Blob ? { "content-type": body.type } : body !== undefined ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    body: body instanceof Blob ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Calls the API and returns its JSON, throwing ApiError for any problem response. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) throw new ApiError(await toProblem(res));
  if (res.status === 204 || res.status === 202) {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return (await res.json()) as T;
}

async function toProblem(res: Response): Promise<Problem> {
  try {
    return (await res.json()) as Problem;
  } catch {
    return { type: "/problems/unknown", title: `The server answered ${res.status}.`, status: res.status };
  }
}

/** On the cached public lists: website changes to clubs, teams, logos, venues or competitions clear it with `updateTag`. */
export const LISTS_TAG = "lists";

/**
 * A public list that rarely changes (clubs, a club and its teams, competitions, venues), shared by every
 * visitor for up to a minute, so a page of filters doesn't ask the API for them each time. A 404 is null.
 * Changes made outside the website, such as a venue added on a phone, show within the minute. It's
 * fetched as nobody in particular: a cached function can't read the visitor's cookies or IP.
 */
export const cachedPublic = unstable_cache(
  async <T>(path: string): Promise<T | null> => {
    const res = await fetch(apiUrl(path), { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(await toProblem(res));
    return (await res.json()) as T;
  },
  ["public-api"],
  { revalidate: 60, tags: [LISTS_TAG] },
);

/** Like `api`, but a 404 becomes null. */
export async function apiOrNull<T>(path: string, options: ApiOptions = {}): Promise<T | null> {
  try {
    return await api<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
