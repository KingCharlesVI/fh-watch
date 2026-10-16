import type { NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";

const ALLOWED = ["clubId", "teamId", "umpireId", "from", "to", "competition", "venue", "status"];

/** Bulk CSV of the dashboard's current filters, fetched with the user's session. */
export async function GET(request: NextRequest) {
  const query = Object.fromEntries(ALLOWED.map((k) => [k, request.nextUrl.searchParams.get(k) ?? undefined]));
  const res = await apiFetch("/v1/matches/export.csv", { query });
  if (!res.ok) {
    return new Response(res.status === 401 ? "Sign in to download matches." : "Download failed.", {
      status: res.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(res.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="matches.csv"',
      "cache-control": "private, no-store",
    },
  });
}
