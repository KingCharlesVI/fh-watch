import { hasRole, localDay } from "@fh/shared";
import { markHours, setUnavailableWeekdays } from "@/app/actions/umpiring";
import { ActionForm } from "@/components/ActionForm";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { PageHeader } from "@/components/PageHeader";
import { UmpiringNav } from "@/components/UmpiringNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/session";
import type { Availability } from "@/lib/types";

export const metadata = { title: "Availability" };

const WEEKDAYS = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 0, label: "Sunday" },
];

/** When you can umpire, for your clubs' admins to see when they appoint. */
export default async function AvailabilityPage() {
  const user = await requireUser("/availability");
  const availability = await api<Availability>("/v1/me/availability");
  const today = localDay(new Date());

  return (
    <div className="space-y-6">
      <PageHeader title="Availability" description="When you can umpire. Your clubs' admins see it when they choose who to ask." />
      <UmpiringNav umpire clubAdmin={hasRole(user, "club_admin") && !!user.clubId} />

      <Card>
        <CardHeader>
          <CardTitle>The next 12 weeks</CardTitle>
          <CardDescription>Tap a day once if you&apos;re free, twice if you&apos;re not, and again to unmark it.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Keyed by what's saved, so it starts again from the server's after any change (e.g. hours set below). */}
          <AvailabilityCalendar key={JSON.stringify(availability)} today={today} availability={availability} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Free for only some of a day</CardTitle>
            <CardDescription>Matches kicking off outside these hours count you as not free.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={markHours} submitLabel="Save hours">
              <Field>
                <FieldLabel htmlFor="hours-date">Day</FieldLabel>
                <Input id="hours-date" name="date" type="date" required min={today} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="hours-from">From</FieldLabel>
                  <Input id="hours-from" name="from" type="time" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="hours-to">Until</FieldLabel>
                  <Input id="hours-to" name="to" type="time" />
                </Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Never free on</CardTitle>
            <CardDescription>A day you mark in the calendar overrides this.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={setUnavailableWeekdays} submitLabel="Save">
              <div className="grid grid-cols-2 gap-2">
                {WEEKDAYS.map((w) => (
                  <label key={w.day} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`weekday_${w.day}`} defaultChecked={availability.unavailableWeekdays.includes(w.day)} className="size-4" />
                    {w.label}
                  </label>
                ))}
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
