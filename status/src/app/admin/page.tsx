import type { Metadata } from "next";
import { IncidentItem, lasted } from "@/components/IncidentItem";
import { FIELD, Form, Label } from "@/components/admin/Form";
import { Badge, Container, Dot, Heading, Panel } from "@/components/ui";
import { COMPONENTS, GROUPS } from "@/lib/components";
import { adminEnabled, signedIn } from "@/lib/admin-auth";
import { componentStateNotes, openIncidents, recentIncidents, upcomingMaintenance } from "@/lib/incidents";
import { showDateTime } from "@/lib/site";
import { INCIDENT_STATES, INCIDENT_STATE_LABEL, LEVEL_TEXT, type Level } from "@/lib/status";
import { addUpdate, createIncident, deleteIncident, resolveIncident, setComponentNote, signIn, signOut } from "./actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Levels an incident can be filed at. Maintenance has its own kind, so it isn't here. */
const INCIDENT_LEVELS: Level[] = ["degraded", "partial", "major"];

export default async function AdminPage() {
  if (!adminEnabled()) {
    return (
      <Container className="py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <Panel className="mt-4 p-5 text-sm text-muted-foreground">
          <code className="font-mono">STATUS_ADMIN_PASSWORD</code> isn&apos;t set, so there&apos;s nothing to sign in to. Set it in this project&apos;s
          environment variables and deploy again.
        </Panel>
      </Container>
    );
  }

  if (!(await signedIn())) {
    return (
      <Container className="max-w-sm py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <Panel className="mt-4 p-5">
          <Form action={signIn} submit="Sign in" className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <input id="password" name="password" type="password" autoComplete="current-password" required className={FIELD} />
            </div>
          </Form>
        </Panel>
      </Container>
    );
  }

  const [open, upcoming, history, notes] = await Promise.all([
    openIncidents(),
    upcomingMaintenance(),
    recentIncidents(30),
    componentStateNotes(),
  ]);
  const live = [...open.data, ...upcoming.data];
  const closed = history.data.filter((i) => i.resolvedAt);

  return (
    <Container className="space-y-10 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>

      {/* ---- Going on now ---- */}
      <section className="space-y-4">
        <Heading>Going on now</Heading>
        {live.length === 0 && <Panel className="p-5 text-sm text-muted-foreground">Nothing open.</Panel>}
        {live.map((incident) => (
          <Panel key={incident.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Dot level={incident.level} />
              <h3 className="font-semibold">{incident.title}</h3>
              <Badge tone={incident.level}>{LEVEL_TEXT[incident.level].label}</Badge>
              <Badge>{INCIDENT_STATE_LABEL[incident.state]}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {incident.startedAt.getTime() > Date.now() ? `planned for ${showDateTime(incident.startedAt)}` : `going on for ${lasted(incident)}`}
              </span>
            </div>

            <Form action={addUpdate} submit="Post update" className="grid gap-3">
              <input type="hidden" name="id" value={incident.id} />
              <div className="grid gap-1.5">
                <Label htmlFor={`body-${incident.id}`}>What&apos;s happened</Label>
                <textarea id={`body-${incident.id}`} name="body" rows={3} required className={FIELD} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <select name="state" defaultValue={incident.state} className={`${FIELD} w-auto`} aria-label="Stage">
                  {INCIDENT_STATES.map((s) => (
                    <option key={s} value={s}>
                      {INCIDENT_STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="resolve" /> and it&apos;s over
                </label>
              </div>
            </Form>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Form action={resolveIncident} submit="Mark over, no update" variant="quiet">
                <input type="hidden" name="id" value={incident.id} />
              </Form>
              <Form action={deleteIncident} submit="Delete" variant="quiet">
                <input type="hidden" name="id" value={incident.id} />
              </Form>
            </div>

            {incident.updates.length > 0 && (
              <ol className="space-y-2 border-t pt-4 text-sm">
                {incident.updates.map((u) => (
                  <li key={u.at.toISOString()}>
                    <span className="font-medium">{INCIDENT_STATE_LABEL[u.state]}</span>{" "}
                    <span className="text-xs text-muted-foreground tabular-nums">{showDateTime(u.at)}</span>
                    <p className="whitespace-pre-line text-muted-foreground">{u.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        ))}
      </section>

      {/* ---- Post something new ---- */}
      <section className="space-y-4">
        <Heading>Post something new</Heading>
        <Panel className="p-5">
          <Form action={createIncident} submit="Post" className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="title">Title</Label>
              <input id="title" name="title" required maxLength={120} className={FIELD} placeholder="Uploads timing out" />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="kind">What it is</Label>
                <select id="kind" name="kind" className={FIELD} defaultValue="incident">
                  <option value="incident">An incident</option>
                  <option value="maintenance">Planned maintenance</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="level">How bad</Label>
                <select id="level" name="level" className={FIELD} defaultValue="partial">
                  {INCIDENT_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_TEXT[l].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="state">Stage</Label>
                <select id="state" name="state" className={FIELD} defaultValue="investigating">
                  {INCIDENT_STATES.map((s) => (
                    <option key={s} value={s}>
                      {INCIDENT_STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">What it affects</legend>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {COMPONENTS.map((component) => (
                  <label key={component.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="components" value={component.id} /> {component.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="startedAt" hint="UTC. Empty means now.">
                  Started / starts
                </Label>
                <input id="startedAt" name="startedAt" type="datetime-local" className={FIELD} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="endsAt" hint="UTC. Maintenance only.">
                  Expected to end
                </Label>
                <input id="endsAt" name="endsAt" type="datetime-local" className={FIELD} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="newBody" hint="The first thing people read. Say what they'll notice, and what still works.">
                First update
              </Label>
              <textarea id="newBody" name="body" rows={3} className={FIELD} placeholder="Uploads from the phone are timing out. Matches stay on the phone until an upload is confirmed, so nothing is lost." />
            </div>
          </Form>
        </Panel>
      </section>

      {/* ---- Components set by hand ---- */}
      <section className="space-y-4">
        <Heading>Components set by hand</Heading>
        <p className="text-sm text-muted-foreground">
          For the ones nothing outside can check, and to override a check that&apos;s lying. Whichever is worse wins, so this can&apos;t hide a real
          outage. Operational with no note clears it.
        </p>
        <Panel className="divide-y">
          {GROUPS.flatMap((g) => g.components).map((component) => {
            const note = notes.data.find((n) => n.id === component.id);
            return (
              <div key={component.id} className="p-4">
                <Form action={setComponentNote} submit="Save" variant="quiet" className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input type="hidden" name="id" value={component.id} />
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {component.name}
                      {!component.url && <Badge>set by hand only</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select name="level" defaultValue={note?.level ?? "operational"} className={`${FIELD} w-auto`} aria-label={`${component.name} state`}>
                        {(["operational", "degraded", "partial", "major", "maintenance"] as Level[]).map((l) => (
                          <option key={l} value={l}>
                            {LEVEL_TEXT[l].label}
                          </option>
                        ))}
                      </select>
                      <input
                        name="note"
                        defaultValue={note?.note ?? ""}
                        maxLength={120}
                        placeholder="A few words shown beside it (optional)"
                        className={`${FIELD} flex-1`}
                        aria-label={`${component.name} note`}
                      />
                    </div>
                  </div>
                </Form>
              </div>
            );
          })}
        </Panel>
      </section>

      {/* ---- Lately ---- */}
      <section className="space-y-3">
        <Heading>Finished, last 30 days</Heading>
        {closed.length === 0 && <Panel className="p-5 text-sm text-muted-foreground">Nothing.</Panel>}
        {closed.map((incident) => (
          <div key={incident.id} className="space-y-2">
            <IncidentItem incident={incident} />
            <Form action={deleteIncident} submit="Delete" variant="quiet">
              <input type="hidden" name="id" value={incident.id} />
            </Form>
          </div>
        ))}
      </section>
    </Container>
  );
}
