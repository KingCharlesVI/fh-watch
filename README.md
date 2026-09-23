# fh-watch

Field hockey match system: umpire watch apps, a phone app, an API and a public website. See [docs/design.md](docs/design.md).

## Layout

| Path | Contents |
| --- | --- |
| `schema/match.schema.json` | Match document contract for the watch apps (generated — don't edit) |
| `packages/shared` | Zod match schema, validation, score calculation, CSV export, permission rules |
| `api` | REST API (Fastify + PostgreSQL). OpenAPI docs at `/v1/docs` |
| `web` | Public website, dashboards and admin (Next.js, shadcn/ui) |
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
