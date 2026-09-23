/** Revision numbers travel as strong ETags: `"3"`. */
export const revisionEtag = (revision: number) => `"${revision}"`;

/** Parses `"3"`, `W/"3"` or `3`. Returns null for anything else, including `*`. */
export function parseIfMatch(header: string | undefined): number | null {
  if (!header) return null;
  const m = /^\s*(?:W\/)?"?(\d+)"?\s*$/.exec(header);
  return m ? Number(m[1]) : null;
}
