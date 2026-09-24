/** Headers that say who the visitor is: X-Forwarded-For, and CF-Connecting-IP behind a Cloudflare Tunnel. */
const CLIENT_IP_HEADERS = ["x-forwarded-for", "cf-connecting-ip"];

/**
 * The visitor's IP headers from an incoming request, to pass on to the API so
 * its per-IP rate limits apply per visitor, not to this server.
 */
export function clientIpHeaders(incoming: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of CLIENT_IP_HEADERS) {
    const value = incoming.get(name);
    if (value) out[name] = value;
  }
  return out;
}
