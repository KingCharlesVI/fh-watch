import { componentName } from "@/lib/components";
import type { Incident } from "@/lib/incidents";
import { showDateTime, showDuration } from "@/lib/site";
import { INCIDENT_STATE_LABEL, LEVEL_LOOK, LEVEL_TEXT } from "@/lib/status";
import { Badge, Dot, Panel } from "./ui";

/** How long it went on, or how long it's been going. */
export function lasted(incident: Incident): string {
  const end = incident.resolvedAt ?? new Date();
  return showDuration(end.getTime() - incident.startedAt.getTime());
}

/**
 * One incident: what it is, what it affects, and every update in order, newest
 * first — the shape Cachet's incident timeline takes.
 */
export function IncidentItem({ incident, heading = "h3", link = true }: { incident: Incident; heading?: "h2" | "h3"; link?: boolean }) {
  const Heading = heading;
  const open = !incident.resolvedAt;
  const maintenance = incident.kind === "maintenance";
  const planned = maintenance && incident.startedAt.getTime() > Date.now();

  return (
    <Panel className={`p-5 ${open ? LEVEL_LOOK[incident.level].band : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Dot level={incident.level} />
        <Heading className="font-semibold">
          {link ? (
            <a href={`/incidents/${incident.id}`} className="no-underline hover:underline">
              {incident.title}
            </a>
          ) : (
            incident.title
          )}
        </Heading>
        <Badge tone={incident.level}>{maintenance ? "Maintenance" : LEVEL_TEXT[incident.level].label}</Badge>
        {!maintenance && <Badge>{INCIDENT_STATE_LABEL[incident.state]}</Badge>}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {planned ? "Planned for " : "Started "}
        {showDateTime(incident.startedAt)}
        {planned && incident.endsAt && ` until ${showDateTime(incident.endsAt)}`}
        {!planned && ` · ${open ? `going on for ${lasted(incident)}` : `lasted ${lasted(incident)}`}`}
        {" · "}
        {incident.components.map(componentName).join(", ") || "no components"}
      </p>

      {incident.updates.length > 0 && (
        <ol className="mt-4 space-y-3 border-t pt-4">
          {incident.updates.map((update) => (
            <li key={update.at.toISOString()} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{INCIDENT_STATE_LABEL[update.state]}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{showDateTime(update.at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{update.body}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
