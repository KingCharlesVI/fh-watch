import { cookies, headers } from "next/headers";
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
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send the user's access token if there is one. Default true. */
  auth?: boolean;
}

/** Headers to pass the visitor's IP on, so the API's per-IP rate limits apply per visitor, not to this server. */
export async function forwardedFor(): Promise<Record<string, string>> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return xff ? { "x-forwarded-for": xff } : {};
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
  return fetch(apiUrl(path, options.query), {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: {
      ...(await forwardedFor()),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

/** Like `api`, but a 404 becomes null. */
export async function apiOrNull<T>(path: string, options: ApiOptions = {}): Promise<T | null> {
  try {
    return await api<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
