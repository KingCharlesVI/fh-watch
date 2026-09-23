/**
 * Fixed-window counter held in memory. The API runs as one process, so this is
 * enough; it resets on restart.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => Date,
  ) {}

  /** Counts a hit and returns false if the key is over its limit. */
  hit(key: string): boolean {
    const t = this.now().getTime();
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, entry);
      if (this.hits.size > 10_000) this.sweep(t);
    }
    entry.count++;
    return entry.count <= this.max;
  }

  private sweep(t: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
  }
}
