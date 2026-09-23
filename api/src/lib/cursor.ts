import { badRequest } from "./errors.js";

/** Opaque keyset cursor: the sort key of the last row on the previous page. */
export function encodeCursor(sortValue: Date | string, id: string): string {
  const v = sortValue instanceof Date ? sortValue.toISOString() : sortValue;
  return Buffer.from(JSON.stringify([v, id])).toString("base64url");
}

export function decodeCursor(cursor: string): { sortValue: string; id: string } {
  try {
    const [sortValue, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown[];
    if (typeof sortValue === "string" && typeof id === "string") return { sortValue, id };
  } catch {
    // fall through
  }
  throw badRequest("invalid_cursor", "The cursor is not valid.");
}

/** Given up to limit + 1 rows, return the page and the cursor for the next one. */
export function page<T>(rows: T[], limit: number, key: (row: T) => [Date | string, string]) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = rows.length > limit && last ? encodeCursor(...key(last)) : null;
  return { items, nextCursor };
}
