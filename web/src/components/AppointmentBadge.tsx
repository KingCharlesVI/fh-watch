import { Badge } from "@/components/ui/badge";
import type { Appointment } from "@/lib/types";

const LABELS = { offered: "Asked", accepted: "Accepted", declined: "Declined", released: "Covered" } as const;

/** Where an appointment stands: asked, accepted (or wanting cover), declined. */
export function AppointmentBadge({ appointment: a }: { appointment: Pick<Appointment, "status" | "coverRequested"> }) {
  if (a.status === "accepted" && a.coverRequested) return <Badge variant="destructive">Needs cover</Badge>;
  return <Badge variant={a.status === "accepted" ? "default" : a.status === "declined" ? "outline" : "secondary"}>{LABELS[a.status]}</Badge>;
}

export const roleLabel = (role: Appointment["role"]) => (role === "watch" ? "Watch umpire" : "Second umpire");
