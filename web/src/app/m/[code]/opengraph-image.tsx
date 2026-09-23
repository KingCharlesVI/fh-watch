import { ImageResponse } from "next/og";
import { apiOrNull } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";
import type { FullMatch } from "@/lib/types";

export const alt = "Match result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview card chat apps show for a shared match link. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const data = await apiOrNull<FullMatch>(`/v1/m/${encodeURIComponent((await params).code)}`, { auth: false });
  const m = data?.match;
  const doc = data?.document;

  return new ImageResponse(
    m && doc ? (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#10261a", color: "#fff", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 30, color: "#9fd4b3" }}>
          {[formatDate(m.playedAt), m.competition].filter(Boolean).join(" · ")}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
          <Team name={m.home.name} color={doc.teams.home.color} />
          <div style={{ fontSize: 150, fontWeight: 800, display: "flex" }}>
            {m.home.score}–{m.away.score}
          </div>
          <Team name={m.away.name} color={doc.teams.away.color} alignRight />
        </div>
        {m.home.shootout !== null && (
          <div style={{ fontSize: 34, textAlign: "center", justifyContent: "center", display: "flex", color: "#cfe9d9" }}>
            Shootout {m.home.shootout}–{m.away.shootout}
          </div>
        )}
      </div>
    ) : (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#10261a", color: "#fff", fontSize: 60 }}>
        {SITE_NAME}
      </div>
    ),
    size,
  );
}

function Team({ name, color, alignRight }: { name: string; color: string; alignRight?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: alignRight ? "flex-end" : "flex-start", width: 380, gap: 20 }}>
      <div style={{ width: 64, height: 16, background: color, borderRadius: 8 }} />
      <div style={{ fontSize: 52, fontWeight: 700, textAlign: alignRight ? "right" : "left", display: "flex" }}>{name}</div>
    </div>
  );
}
