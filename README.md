# fh-watch

Field hockey match system: umpire watch apps, a phone app, an API and a public website. See [docs/design.md](docs/design.md).

## Layout

| Path | Contents |
| --- | --- |
| `schema/match.schema.json` | Match document contract for the watch apps (generated — don't edit) |
| `packages/shared` | Zod match schema, validation, score calculation, CSV export |

## Development

Requires Node 22+ and pnpm 9.

```sh
pnpm install
pnpm test          # all packages
pnpm typecheck
pnpm build
pnpm gen:schema    # regenerate schema/match.schema.json after changing packages/shared/src/schema.ts
```
