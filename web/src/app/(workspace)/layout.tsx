import { hasRole } from "@fh/shared";
import { type ReactNode, Suspense } from "react";
import { type NavGroup, WorkspaceNav } from "@/components/WorkspaceNav";
import { getCurrentUser } from "@/lib/session";

/**
 * The pages a signed-in user works in: their own umpiring, their club's, and the site's for
 * admins, with one list of them beside each. The pages themselves send visitors to sign in.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return children;

  const umpire = hasRole(user, "umpire");
  const clubAdmin = hasRole(user, "club_admin") && user.clubId !== null;
  const admin = hasRole(user, "admin");
  const groups: NavGroup[] = [
    ...(umpire
      ? [
          {
            title: "Umpiring",
            items: [
              { href: "/dashboard?view=mine", label: "My matches" },
              { href: "/upcoming", label: "Upcoming" },
              { href: "/appointments", label: "Appointments" },
              { href: "/availability", label: "Availability" },
              { href: "/season", label: "My season" },
            ],
          },
        ]
      : []),
    ...(clubAdmin
      ? [
          {
            title: "Club",
            items: [
              { href: "/dashboard?view=club", label: "Club matches" },
              { href: "/dashboard/fixtures", label: "Fixtures" },
              { href: "/dashboard/umpires", label: "Umpires" },
              { href: `/admin/clubs/${user.clubId}`, label: "Teams" },
              { href: "/dashboard/webhooks", label: "Webhooks" },
            ],
          },
        ]
      : []),
    ...(admin
      ? [
          {
            title: "Admin",
            items: [
              { href: "/dashboard?view=all", label: "All matches" },
              { href: "/admin", label: "Site admin" },
            ],
          },
        ]
      : []),
    { title: "Account", items: [{ href: "/account", label: "Your account" }] },
  ];
  // The dashboard's view when none is picked: the same order as its own (dashboard/page.tsx).
  const defaultView = umpire ? "mine" : clubAdmin ? "club" : admin ? "all" : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      <Suspense>
        <WorkspaceNav groups={groups} defaultView={defaultView} />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
