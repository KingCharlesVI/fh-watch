import { hasRole } from "@fh/shared";
import type { User } from "./types";

export interface NavItem {
  href: string;
  label: string;
}

/** One of the header's menus: a role's pages. */
export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** The header's menus for a signed-in user, by role: their own umpiring, their club's, and the site's for admins. */
export function navGroups(user: User | null): NavGroup[] {
  if (!user) return [];
  const groups: NavGroup[] = [];
  if (hasRole(user, "umpire")) {
    groups.push({
      title: "Umpiring",
      items: [
        { href: "/dashboard?view=mine", label: "My matches" },
        { href: "/upcoming", label: "Upcoming" },
        { href: "/appointments", label: "Appointments" },
        { href: "/availability", label: "Availability" },
        { href: "/season", label: "My season" },
      ],
    });
  }
  if (hasRole(user, "club_admin") && user.clubId) {
    groups.push({
      title: "Club",
      items: [
        { href: "/dashboard?view=club", label: "Club matches" },
        { href: "/dashboard/fixtures", label: "Fixtures" },
        { href: "/dashboard/umpires", label: "Umpires" },
        { href: `/admin/clubs/${user.clubId}`, label: "Teams" },
        { href: "/dashboard/webhooks", label: "Webhooks" },
      ],
    });
  }
  if (hasRole(user, "admin")) {
    groups.push({
      title: "Admin",
      items: [
        { href: "/admin", label: "Overview" },
        { href: "/dashboard?view=all", label: "All matches" },
        { href: "/admin/requests", label: "Club requests" },
        { href: "/admin/access-requests", label: "Testing requests" },
        { href: "/admin/users", label: "Users" },
        { href: "/admin/clubs", label: "Clubs and teams" },
        { href: "/admin/venues", label: "Venues" },
        { href: "/admin/competitions", label: "Competitions" },
        { href: "/admin/import", label: "Import" },
        { href: "/admin/blog", label: "Blog" },
        { href: "/admin/webhooks", label: "Webhooks" },
        { href: "/admin/audit", label: "Audit log" },
      ],
    });
  }
  return groups;
}

/** The dashboard's view when none is picked: the same order as its own (app/dashboard/page.tsx). */
export function defaultView(user: User | null): string | undefined {
  if (hasRole(user, "umpire")) return "mine";
  if (hasRole(user, "club_admin") && user?.clubId) return "club";
  if (hasRole(user, "admin")) return "all";
  return undefined;
}
