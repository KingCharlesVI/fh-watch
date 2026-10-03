import { COMPONENTS, type ComponentId, type StatusComponent } from "./components";
import type { Level } from "./status";

/**
 * Checking whether something answers, from the server rather than the browser:
 * no cross-origin trouble, and the answer is the same for everyone.
 */

/** Long enough for a cold start on a home server, short enough that the page isn't held up. */
const TIMEOUT_MS = 8000;

export interface Check {
  id: ComponentId;
  /** Null for a component nothing outside can see. */
  level: Level | null;
  ms: number | null;
  /** Shown only when something is wrong: "502", "timed out", "unreachable". */
  detail?: string;
  at: string;
}

async function check(component: StatusComponent): Promise<Check> {
  const at = new Date().toISOString();
  if (!component.url) return { id: component.id, level: null, ms: null, at };

  const started = Date.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await fetch(component.url, {
      signal,
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": "FH Match Centre status page" },
    });
    const ms = Date.now() - started;
    if (res.status >= 500) return { id: component.id, level: "major", ms, detail: String(res.status), at };
    // A 4xx from a health check means it answered, but not with what we asked for.
    if (!res.ok) return { id: component.id, level: "degraded", ms, detail: String(res.status), at };
    const slow = component.slowMs ?? 2000;
    return { id: component.id, level: ms > slow ? "degraded" : "operational", ms, detail: ms > slow ? "slow" : undefined, at };
  } catch (err) {
    const ms = Date.now() - started;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { id: component.id, level: "major", ms, detail: timedOut ? "timed out" : "unreachable", at };
  }
}

/** Checks everything with a URL, all at once. Never throws: a failed check is a result. */
export async function probeAll(): Promise<Check[]> {
  return Promise.all(COMPONENTS.map(check));
}

export const checksById = (checks: Check[]): Map<string, Check> => new Map(checks.map((c) => [c.id, c]));
