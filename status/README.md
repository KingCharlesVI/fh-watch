# Status page

Whether FH Match Centre is working, at `status.fhmatchcentre.com`. Modelled on [Cachet](https://cachethq.io): components in groups, each with a state and 90 days of history, incidents with a timeline of updates, planned maintenance, and an overall headline.

Two rules shape it:

- **It doesn't depend on what it reports on.** No connection to the API or its database — those are the things most likely to be down when someone comes here. Its own records live in a separate SQLite database.
- **The states are measured, not claimed.** Anything with a URL is checked from the server when a page is asked for, so nobody has to remember to update it. The rest (the database, email, the watch connection, the app stores) can only be set by hand, and the page says as much.

```sh
pnpm --filter @fh/status db:migrate   # creates status.db the first time
pnpm --filter @fh/status dev          # http://localhost:3003
```

## What it reports on

[`src/lib/components.ts`](src/lib/components.ts) is the whole list: the groups, what each component is, and the URL to check. A component with `url: null` is one nothing outside can see — its state comes from an incident or from the admin page. `slowMs` is where "operational" becomes "degraded performance".

Checks run in parallel with an 8-second timeout. A 5xx or no answer at all is a major outage, a 4xx is degraded (it answered, just not with what we asked for), and slower than `slowMs` is degraded.

## Incidents

SQLite, through libSQL: a file in development, [Turso](https://turso.tech) in production (Vercel's filesystem doesn't last, so a local file can't be written there). Three tables, in [`src/lib/db/schema.ts`](src/lib/db/schema.ts):

| Table | |
| --- | --- |
| `incidents` | An incident or a maintenance window: title, how bad, which stage it's at, which components, when it started and finished |
| `incident_updates` | The timeline: one entry per thing you told people, with the stage it was at |
| `component_notes` | A component's state set by hand, for the ones nothing can check |

Post them from `/admin`, which asks for `STATUS_ADMIN_PASSWORD` and nothing else: one password, no accounts, and no sign-in through the API — which would be no use on the day the API is what's broken. The cookie it sets is signed with the password, so changing the password signs you out everywhere. Use a long random one.

From there you can post an incident or schedule maintenance, add an update (optionally marking it over), end one without an update, delete one, and set the state of a component by hand. A hand-set state can only make things look worse, never better: the page takes the worst of the check, the note and any open incident, so a stale "operational" note can't hide a real outage.

**Uptime** is worked out from the incidents: the time a component spent in a partial or major outage against the whole 90 days. Degraded performance and planned maintenance don't count against it, which is how Cachet's own uptime reads. There's no per-minute history, so the bar strip shows the worst thing that happened each day rather than pretending to a precision it hasn't got.

## Settings

| Variable | |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://….turso.io`. Unset: the local `status.db` file |
| `TURSO_AUTH_TOKEN` | From Turso |
| `STATUS_ADMIN_PASSWORD` | Lets you in to `/admin`. Unset: the admin page says so and does nothing |
| `STATUS_URL` | This page's own address, for the feed and share previews. Defaults to `https://status.fhmatchcentre.com` |

## Deploying on Vercel (once)

1. [Turso](https://turso.tech): create a database (the free tier is far more than this needs), and copy its URL and a token.
2. Apply the migrations to it from your own machine. Vercel never migrates anything:

   ```sh
   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… pnpm --filter @fh/status db:migrate
   ```

3. In Vercel, **Add New → Project**, import this repository, and set **Root Directory** to `status`. It picks up the rest from [`vercel.json`](vercel.json), which installs only this app's packages.
4. Add the three settings above as environment variables, then deploy.
5. **Domain:** add `status.fhmatchcentre.com` in the project's Settings → Domains, and the record Vercel shows in Cloudflare, set to **DNS only** (grey cloud).

Every push to `main` redeploys it, like the landing page and the docs.

## Elsewhere

- `/api/status` — the whole board as JSON, readable from anywhere, for a banner in an app or a bot.
- `/feed.xml` — incidents as RSS.
- `/history` — a year of incidents, by month. Each one also has its own page at `/incidents/<id>`.

## Changing a migration

```sh
pnpm --filter @fh/status db:generate   # after editing schema.ts
```

Rename the file it writes to something readable and change the `tag` in `drizzle/meta/_journal.json` to match, as the API's migrations do.
