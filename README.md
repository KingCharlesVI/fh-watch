# fh-watch

Field hockey match system: umpire watch apps, a phone app, an API and a public website. See [docs/design.md](docs/design.md).

## Layout

| Path | Contents |
| --- | --- |
| `schema/match.schema.json` | Match document contract for the watch apps (generated — don't edit) |
| `packages/shared` | Zod match schema, validation, score calculation, CSV export, permission rules |
| `api` | REST API (Fastify + PostgreSQL). OpenAPI docs at `/v1/docs` |

## Development

Requires Node 22+, pnpm 9 and PostgreSQL 16+.

One-off database setup (as the `postgres` superuser):

```sh
psql -U postgres -h localhost -c "CREATE ROLE fh LOGIN PASSWORD 'CHANGE_ME';" -c "CREATE DATABASE fh_dev OWNER fh;" -c "CREATE DATABASE fh_test OWNER fh;"
cp api/.env.example api/.env   # then fill in the password
```

```sh
pnpm install
pnpm build                          # the API's production build uses packages/shared/dist
pnpm test                           # all packages; API tests rebuild fh_test from the migrations
pnpm typecheck
pnpm gen:schema                     # after changing packages/shared/src/schema.ts
pnpm --filter @fh/api db:migrate    # apply migrations to fh_dev
pnpm --filter @fh/api dev           # API on http://127.0.0.1:3001
pnpm --filter @fh/api db:generate   # after changing api/src/db/schema.ts
```
