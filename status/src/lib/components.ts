/**
 * What this page reports on. Everything else follows from here: the groups on the
 * page, the live checks, the uptime sums and what an incident can be filed against.
 *
 * A component with a `url` is checked from the server every time the page is built
 * or the live route is called. One without is set by hand, through an incident or a
 * status note in the admin page, because nothing outside the server can see it.
 */

export type ComponentId =
  | "api"
  | "website"
  | "landing"
  | "docs"
  | "database"
  | "email"
  | "watch-sync"
  | "distribution";

export interface StatusComponent {
  id: ComponentId;
  name: string;
  description: string;
  /** Checked from the server. Null: its state comes from incidents and admin notes. */
  url: string | null;
  /** Slower than this (milliseconds) counts as degraded rather than operational. */
  slowMs?: number;
}

export interface ComponentGroup {
  name: string;
  description?: string;
  components: StatusComponent[];
}

/** The API's own health route, which answers `{"ok":true}` without touching the database. */
const API_HEALTH = "https://app.fhmatchcentre.com/v1/health";

export const GROUPS: ComponentGroup[] = [
  {
    name: "Recording a match",
    description: "What an umpire needs on the pitch. The watch and phone apps keep working with none of this.",
    components: [
      {
        id: "watch-sync",
        name: "Watch to phone",
        description: "Finished matches moving from the watch to the phone. Uses the watch's own connection, not this server.",
        url: null,
      },
      {
        id: "distribution",
        name: "App downloads",
        description: "Google Play and TestFlight handing out the apps to testers.",
        url: null,
      },
    ],
  },
  {
    name: "Website and API",
    components: [
      { id: "api", name: "API", description: "Sign-in, uploads, publishing and sharing.", url: API_HEALTH, slowMs: 1500 },
      {
        id: "website",
        name: "Website",
        description: "app.fhmatchcentre.com: results, clubs and your account.",
        url: "https://app.fhmatchcentre.com/",
        slowMs: 2500,
      },
      { id: "database", name: "Database", description: "Where matches and accounts are kept.", url: null },
      { id: "email", name: "Email", description: "Confirmations, password resets and testing invitations.", url: null },
    ],
  },
  {
    name: "Pages",
    components: [
      { id: "landing", name: "Landing page", description: "fhmatchcentre.com: what it is and where to get it.", url: "https://fhmatchcentre.com/", slowMs: 2500 },
      { id: "docs", name: "Documentation", description: "docs.fhmatchcentre.com: the guide for every app.", url: "https://docs.fhmatchcentre.com/", slowMs: 2500 },
    ],
  },
];

export const COMPONENTS: StatusComponent[] = GROUPS.flatMap((g) => g.components);

export const componentById = (id: string): StatusComponent | undefined => COMPONENTS.find((c) => c.id === id);

export const componentName = (id: string): string => componentById(id)?.name ?? id;
