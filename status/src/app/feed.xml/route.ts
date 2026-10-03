import { componentName } from "@/lib/components";
import { recentIncidents } from "@/lib/incidents";
import { SITE } from "@/lib/site";
import { INCIDENT_STATE_LABEL, LEVEL_TEXT } from "@/lib/status";

/** Incidents as RSS, so people can follow without an account or an email from us. */
export const dynamic = "force-dynamic";

const escape = (text: string) => text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET() {
  const { data: incidents } = await recentIncidents(365);

  const items = incidents.map((incident) => {
    const latest = incident.updates[0];
    const body = [
      `${LEVEL_TEXT[incident.level].label}${incident.kind === "maintenance" ? " (planned maintenance)" : ""}.`,
      `Affects: ${incident.components.map(componentName).join(", ") || "nothing listed"}.`,
      latest ? `${INCIDENT_STATE_LABEL[latest.state]}: ${latest.body}` : null,
      incident.resolvedAt ? "This one is over." : "Still going.",
    ]
      .filter(Boolean)
      .join("\n\n");
    return `    <item>
      <title>${escape(incident.title)}</title>
      <link>${SITE.url}/incidents/${incident.id}</link>
      <guid isPermaLink="false">${escape(incident.id)}-${(latest?.at ?? incident.startedAt).getTime()}</guid>
      <pubDate>${(latest?.at ?? incident.startedAt).toUTCString()}</pubDate>
      <description>${escape(body)}</description>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SITE.name} status</title>
    <link>${SITE.url}</link>
    <description>Incidents and maintenance for ${SITE.name}.</description>
    <language>en-GB</language>
${items.join("\n")}
  </channel>
</rss>
`;

  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "no-store" } });
}
