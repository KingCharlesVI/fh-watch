# fh-watch

Field hockey match system: umpire watch apps, a phone app, an API and a public website. See [docs/design.md](docs/design.md).

## Layout

| Path | Contents |
| --- | --- |
| `schema/match.schema.json` | Match document contract for the watch apps (generated — don't edit) |
| `packages/shared` | Zod match schema, validation, score calculation, CSV export, permission rules |
| `api` | REST API (Fastify + PostgreSQL). OpenAPI docs at `/v1/docs` |
| `web` | Public website, dashboards and admin (Next.js, shadcn/ui) |
| `mobile` | Phone app for umpires (Expo / React Native) |
| `deploy` | Server setup, deploy, backup and restore scripts. See [docs/deployment.md](docs/deployment.md) |

## Development

Requires Node 22+, pnpm 9 and PostgreSQL 16+.

One-off database setup (as the `postgres` superuser):

```sh
psql -U postgres -h localhost -c "CREATE ROLE fh LOGIN PASSWORD 'CHANGE_ME';" -c "CREATE DATABASE fh_dev OWNER fh;" -c "CREATE DATABASE fh_test OWNER fh;"
cp api/.env.example api/.env   # then fill in the password
npx playwright-core install --only-shell chromium   # for PDF downloads
```

```sh
pnpm install
pnpm build                          # the API's production build uses packages/shared/dist
pnpm test                           # all packages; API tests rebuild fh_test from the migrations
pnpm typecheck
pnpm gen:schema                     # after changing packages/shared/src/schema.ts
pnpm --filter @fh/api db:migrate    # apply migrations to fh_dev
pnpm --filter @fh/api db:seed       # demo clubs, matches and accounts (password demo-password-123)
pnpm --filter @fh/api dev           # API on http://127.0.0.1:3001
pnpm --filter @fh/web dev           # website on http://localhost:3000 (needs `pnpm build` once for packages/shared)
pnpm --filter @fh/api db:generate   # after changing api/src/db/schema.ts
```

## Phone app

Needs Android Studio (SDK and an emulator) for Android. An iPhone build needs a Mac with Xcode.

**Building for Android on Windows.** React Native's generated native code has paths over 260 characters, so:

1. Turn on Windows long paths (once, in an administrator PowerShell):
   `New-ItemProperty -Path HKLM:SYSTEMCurrentControlSetControlFileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`
2. Install **CMake 3.31.6** in Android Studio (Settings → Android SDK → SDK Tools → CMake, tick "Show package details"). The app is set to use it, because its Ninja handles long paths; the default 3.22.1 doesn't.

The workspace uses pnpm's `node-linker=hoisted` (see `.npmrc`) for the same reason: pnpm's default symlinked layout breaks the Android native build.

```sh
cp mobile/.env.example mobile/.env    # API and website addresses; defaults suit the Android emulator
pnpm --filter @fh/api dev             # the app talks to your local API
pnpm --filter @fh/mobile android      # build and install the development app on the emulator
pnpm --filter @fh/mobile start        # later runs: just start the JavaScript bundler
pnpm --filter @fh/mobile test         # sync engine and API client tests
```

In a development build, **Settings → Add a sample match** creates a finished match to try things with.
