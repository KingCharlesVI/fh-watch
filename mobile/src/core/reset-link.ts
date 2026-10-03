/** Plain TypeScript: no React Native imports, so it runs under tests too. */

/**
 * The password-reset token out of whatever the umpire pasted. The email holds a
 * website address (`…/reset-password?token=abc`), so they may paste the whole
 * link, the query on its own, or just the token. Tokens are base64url, which
 * never contains `&`, a space or a `%`, so there's nothing to decode.
 */
export function resetTokenFrom(pasted: string): string {
  const text = pasted.trim();
  return /(?:^|[?&#])token=([^&\s]+)/.exec(text)?.[1] ?? text;
}
