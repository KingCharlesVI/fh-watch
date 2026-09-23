/** `%q%` for ILIKE with the user's own % and _ taken literally. */
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

export const Limit = { min: 1, max: 100, default: 50 } as const;
