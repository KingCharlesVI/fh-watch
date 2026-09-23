/** An error rendered as RFC 9457 problem+json. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    /** Short slug; becomes the problem `type` `/problems/<slug>`. */
    readonly slug: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const badRequest = (slug: string, message: string, extra?: Record<string, unknown>) =>
  new HttpError(400, slug, message, extra);
export const unauthorized = (message = "Sign in required.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do that.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (slug: string, message: string, extra?: Record<string, unknown>) =>
  new HttpError(409, slug, message, extra);

/** Postgres unique_violation, whether raw or wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
