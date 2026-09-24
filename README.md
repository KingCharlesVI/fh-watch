# fh-watch

Field hockey match system: umpire watch apps, a phone app, an API and a public website. See [docs/design.md](docs/design.md).

## Layout

| Path | Contents |
| --- | --- |
| `schema/match.schema.json` | Match document contract for the watch apps (generated — don't edit) |
| `packages/shared` | Zod match schema, validation, score calculation, CSV export, permission rules |
| `api` | REST API (Fastify + PostgreSQL). OpenAPI docs at `/v1/docs` |
| `web` | Public website, dashboards and admin (Next.js, shadcn/ui) |
| `mobile` | Phone app for umpires (Expo / React Native), with the watch-sync native module in `mobile/modules/watch-sync` |
| `watch-wear` | Wear OS umpire app (Kotlin, Compose for Wear OS). See [watch-wear/README.md](watch-wear/README.md) |
| `deploy` | Runs the server on a Linux or Windows machine behind a Cloudflare Tunnel: setup scripts, services, and the `fh` command for deploys and backups. See [docs/deployment.md](docs/deployment.md) |

## Development

Requires Node 22+, pnpm 9 and PostgreSQL 16+.

One-off database setup (as the `postgres` superuser):

```sh
psql -U postgres -h localhost -c "CREATE ROLE fh LOGIN PASSWORD 'CHANGE_ME';" -c "CREATE DATABASE fh_dev OWNER fh;" -c "CREATE DATABASE fh_test OWNER fh;"
cp api/.env.example api/.env   # then fill in the password
npx playwright-core install --only-shell chromium   # for PDF downloads
```

**Everyday:** one command starts what you need, prefixed and colour-coded, and Ctrl+C stops it all.

```sh
pnpm dev                  # API, website and phone app (starts the emulator and opens the app)
pnpm dev:web              # API and website
pnpm dev:api              # API only
pnpm dev:mobile           # API and phone app
pnpm dev:watch            # Wear OS app on the watch emulator (not part of plain `pnpm dev`)
pnpm dev --seed           # any of the above, resetting the demo data first
pnpm dev mobile --build   # rebuild the phone app after native changes (also automatic if it isn't installed)
```

It checks PostgreSQL is running, applies migrations, keeps `packages/shared` compiled for the website, and for the phone app starts the emulator if no device is connected.

**Other commands:**

```sh
pnpm install
pnpm build                          # the API's production build uses packages/shared/dist
pnpm test                           # all packages; API tests rebuild fh_test from the migrations
pnpm typecheck
pnpm gen:schema                     # after changing packages/shared/src/schema.ts
pnpm --filter @fh/api db:migrate    # apply migrations to fh_dev
pnpm --filter @fh/api db:seed       # demo clubs, matches and accounts (password demo-password-123)
pnpm --filter @fh/api db:generate   # after changing api/src/db/schema.ts
```

## Phone app

Needs Android Studio (SDK and an emulator) for Android. An iPhone build needs a Mac with Xcode.

**Building for Android on Windows.** React Native's generated native code has paths over 260 characters, so:

1. Turn on Windows long paths (once, in an administrator PowerShell):
   `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`
2. Install **CMake 3.31.6** in Android Studio (Settings → Android SDK → SDK Tools → CMake, tick "Show package details"). The app is set to use it, because its Ninja handles long paths; the default 3.22.1 doesn't.

The workspace uses pnpm's `node-linker=hoisted` (see `.npmrc`) for the same reason: pnpm's default symlinked layout breaks the Android native build.

```sh
cp mobile/.env.example mobile/.env    # API and website addresses; defaults suit the Android emulator
pnpm dev:mobile                       # API, emulator and app; the first run builds and installs the app
pnpm --filter @fh/mobile test         # sync engine and API client tests
```

In a development build, **Settings → Add a sample match** creates a finished match to try things with.
