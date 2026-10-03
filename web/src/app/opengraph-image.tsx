import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview card for links to the site's pages; a match's own link has its own (m/[code]). */
export default async function Image() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 36, background: "#10261a", color: "#fff", padding: 80, fontFamily: "sans-serif" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} width={120} height={120} style={{ borderRadius: 28 }} alt="" />
      <div style={{ fontSize: 76, fontWeight: 700, display: "flex" }}>{SITE_NAME}</div>
      <div style={{ fontSize: 38, color: "#9fd4b3", display: "flex" }}>{SITE_DESCRIPTION}</div>
    </div>,
    size,
  );
}
