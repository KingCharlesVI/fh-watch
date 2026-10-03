import { componentLevel, overall } from "@/lib/board";
import { COMPONENTS } from "@/lib/components";
import { loadBoard } from "@/lib/incidents";
import { probeAll } from "@/lib/probe";

/**
 * The whole board as JSON, for anything that wants to show it elsewhere: a banner
 * in the phone app, a dashboard, a bot. Open to anyone, from anywhere.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [checks, board] = await Promise.all([probeAll(), loadBoard()]);

  const components = COMPONENTS.map((component) => {
    const { level, detail, ms } = componentLevel(component, checks.find((c) => c.id === component.id), board.notes, board.open);
    return { id: component.id, name: component.name, status: level, ...(detail ? { detail } : {}), ...(ms === null ? {} : { ms }) };
  });

  const body = {
    status: overall(components.map((c) => c.status)),
    checkedAt: new Date().toISOString(),
    /** False when this page couldn't read its own records, so incidents are missing. */
    recordsAvailable: board.ok,
    components,
    incidents: [...board.open, ...board.upcoming].map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      status: i.level,
      state: i.state,
      components: i.components,
      startedAt: i.startedAt.toISOString(),
      endsAt: i.endsAt?.toISOString() ?? null,
      url: `/incidents/${i.id}`,
      latest: i.updates[0]?.body ?? null,
    })),
  };

  return Response.json(body, {
    headers: {
      "cache-control": "no-store",
      // Anyone may read it: it's the same answer for everyone.
      "access-control-allow-origin": "*",
    },
  });
}
