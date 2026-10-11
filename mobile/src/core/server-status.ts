/** Whether the server answers, as shown in Settings. */
export type ServerStatus =
  | { state: "online"; ms: number }
  /** It answered, but with an error: the server itself is having trouble. */
  | { state: "problem"; status: number }
  /** Nothing came back in time: the server is down, or this phone is offline. */
  | { state: "unreachable" };

/**
 * Asks the API's health check, giving up after `timeoutMs`. Never throws. A 429 still means
 * the server is up, just busy with this phone.
 */
export async function checkServer(
  apiUrl: string,
  opts: { fetch?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
): Promise<ServerStatus> {
  const fetchFn = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const started = now();
  // Not AbortSignal.timeout, which React Native may not have.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetchFn(`${apiUrl}/v1/health`, { signal: abort.signal });
    if (res.ok || res.status === 429) return { state: "online", ms: Math.max(0, Math.round(now() - started)) };
    return { state: "problem", status: res.status };
  } catch {
    return { state: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
