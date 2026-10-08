import { fixtureWhen, hasRole } from "@fh/shared";
import { CalendarDays } from "lucide-react";
import { answerAppointment, askForCover, resetCalendarLink, takeCover } from "@/app/actions/umpiring";
import { ActionForm } from "@/components/ActionForm";
import { AppointmentBadge, roleLabel } from "@/components/AppointmentBadge";
import { CopyButton } from "@/components/CopyButton";
import { PageHeader } from "@/components/PageHeader";
import { UmpiringNav } from "@/components/UmpiringNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/session";
import type { Club, Items, MyAppointment } from "@/lib/types";

export const metadata = { title: "Appointments" };

/** Your appointments from clubs: answer them, ask for cover, take others' over, and subscribe to them in a calendar. */
export default async function AppointmentsPage() {
  const user = await requireUser("/appointments");
  const [mine, cover, clubs, calendar] = await Promise.all([
    api<Items<MyAppointment>>("/v1/me/appointments"),
    api<Items<MyAppointment>>("/v1/me/cover-requests"),
    api<Items<Club>>("/v1/me/umpiring-clubs"),
    api<{ url: string }>("/v1/me/calendar"),
  ]);
  const asked = mine.items.filter((a) => a.status === "offered");
  const accepted = mine.items.filter((a) => a.status === "accepted");
  const declined = mine.items.filter((a) => a.status === "declined");
  const clubAdmin = hasRole(user, "club_admin") && !!user.clubId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description={
          clubs.items.length
            ? `Matches ${clubs.items.map((c) => c.name).join(" and ")} ${clubs.items.length === 1 ? "has" : "have"} asked you to umpire.`
            : "Matches a club has asked you to umpire."
        }
      />
      <UmpiringNav umpire clubAdmin={clubAdmin} />

      {clubs.items.length === 0 && mine.items.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground">
            Clubs appoint umpires from their own list. To be on one, ask the club&apos;s admin to add you. You can still set up and umpire any match
            yourself, as always.
          </CardContent>
        </Card>
      )}

      {asked.length > 0 && (
        <Section title="Waiting for your answer">
          {asked.map((a) => (
            <AppointmentCard key={a.id} a={a}>
              <ActionForm action={answerAppointment} submitLabel="Accept" inline>
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="answer" value="accept" />
              </ActionForm>
              <ActionForm action={answerAppointment} submitLabel="Decline" variant="outline" inline>
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="answer" value="decline" />
              </ActionForm>
            </AppointmentCard>
          ))}
        </Section>
      )}

      <Section title="Coming up" empty={accepted.length === 0 ? "Nothing you've accepted yet." : undefined}>
        {accepted.map((a) => (
          <AppointmentCard key={a.id} a={a}>
            {a.coverRequested ? (
              <ActionForm action={askForCover} submitLabel="I can make it after all" variant="outline" inline>
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="requested" value="false" />
              </ActionForm>
            ) : (
              <ActionForm
                action={askForCover}
                submitLabel="Ask for cover"
                variant="outline"
                inline
                confirm={{
                  title: "Ask for cover?",
                  description: "The club's other umpires and its admins are emailed, and anyone on its list can take it over. Until then, it's still yours.",
                  action: "Ask for cover",
                }}
              >
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="requested" value="true" />
              </ActionForm>
            )}
          </AppointmentCard>
        ))}
      </Section>

      {cover.items.length > 0 && (
        <Section title="Cover wanted" description="Others in your clubs who can't make a match they accepted. Take one over and it's yours.">
          {cover.items.map((a) => (
            <AppointmentCard key={a.id} a={a} whose={`${a.displayName}'s`}>
              <ActionForm
                action={takeCover}
                submitLabel="Take it over"
                inline
                confirm={{ title: "Take this one over?", description: `You become its ${roleLabel(a.role).toLowerCase()}, and ${a.displayName} and the club are told.`, action: "Take it over" }}
              >
                <input type="hidden" name="appointmentId" value={a.id} />
              </ActionForm>
            </AppointmentCard>
          ))}
        </Section>
      )}

      {declined.length > 0 && (
        <Section title="Declined">
          {declined.map((a) => (
            <AppointmentCard key={a.id} a={a} />
          ))}
        </Section>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-muted-foreground" /> In your calendar
          </CardTitle>
          <CardDescription>
            Subscribe to this address in Google, Apple or Outlook Calendar (&ldquo;add calendar from URL&rdquo;), and appointments you accept appear
            there. It&apos;s private: anyone with it can see them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={calendar.url} aria-label="Calendar address" className="max-w-xl font-mono text-xs" />
            <CopyButton value={calendar.url} label="Copy address" />
          </div>
          <ActionForm
            action={resetCalendarLink}
            submitLabel="Make a new address"
            variant="outline"
            inline
            confirm={{ title: "Make a new address?", description: "The old one stops working, so calendars subscribed to it need the new one.", action: "Make a new address" }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, description, empty, children }: { title: string; description?: string; empty?: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {empty ? <p className="text-muted-foreground">{empty}</p> : <div className="space-y-2">{children}</div>}
    </section>
  );
}

/** One appointment: the match, the club and role, who else is on it, and what can be done. */
function AppointmentCard({ a, whose, children }: { a: MyAppointment; whose?: string; children?: React.ReactNode }) {
  const f = a.fixture;
  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">
            {f.home.name} v {f.away.name}
          </div>
          <div className="text-sm text-muted-foreground">{[fixtureWhen(f.date, f.time), f.venue, f.competition].filter(Boolean).join(" · ")}</div>
        </div>
        <AppointmentBadge appointment={a} />
      </div>
      <div className="text-sm">
        {whose ? `${whose} place: ` : ""}
        {roleLabel(a.role)}
        {a.mentoring && " (mentoring)"} for {a.club.name}
        {a.colleague && (
          <span className="text-muted-foreground">
            {" "}
            · with {a.colleague.displayName}
            {a.colleague.status === "offered" ? " (asked)" : ""}
          </span>
        )}
      </div>
      {f.notes && <p className="text-sm text-muted-foreground">{f.notes}</p>}
      {children && <div className="flex flex-wrap gap-2 pt-1">{children}</div>}
    </Card>
  );
}
