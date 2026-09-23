import { apiFetch } from "@/lib/api";

const FORMATS = new Set(["pdf", "csv", "json"]);

/**
 * Downloads go through the website so signed-in users can download drafts:
 * the browser has the session cookie, and this passes it to the API as a token.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params;
  if (!FORMATS.has(format) || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const res = await apiFetch(`/v1/matches/${id}/export.${format}`);
  if (!res.ok) {
    const message = res.status === 404 ? "Match not found." : res.status === 503 ? "The PDF couldn't be generated. Try again shortly." : "Download failed.";
    return new Response(message, { status: res.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": res.headers.get("content-disposition") ?? "attachment",
      "cache-control": "private, no-store",
    },
  });
}
