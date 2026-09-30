# Development setup

The [README](https://github.com/KingCharlesVI/fh-watch#readme) has every command; this is the short version.

## Tools

| For | You need |
| --- | --- |
| Everything | Node 22+, pnpm 9 |
| The API and website | PostgreSQL 16+ |
| Android (phone and Wear OS) | Android Studio: the SDK, emulators, and CMake 3.31.6. On Windows, turn on long paths. |
| iPhone and Apple Watch | A Mac with Xcode, to run them locally. Cloud builds (EAS) need no Mac. |
| The Apple Watch engine's tests | Swift (a Mac, or [Swift for Windows](https://www.swift.org/install/windows/)) |

## First time

```sh
pnpm install
psql -U postgres -h localhost -c "CREATE ROLE fh LOGIN PASSWORD 'CHANGE_ME';" -c "CREATE DATABASE fh_dev OWNER fh;" -c "CREATE DATABASE fh_test OWNER fh;"
cp api/.env.example api/.env        # then set the password
cp mobile/.env.example mobile/.env  # the phone app's stage (alpha or beta)
```

## Running things

```sh
pnpm dev              # API, website and phone app (starts the emulator)
pnpm dev:web          # API and website
pnpm dev:mobile       # API and phone app
pnpm dev:watch        # the Wear OS app on the watch emulator
pnpm dev --seed       # any of them, with fresh demo data (password demo-password-123)

pnpm --filter @fh/landing dev   # the landing page, http://localhost:3002
node docs-site/build.mjs --serve  # these docs, http://localhost:3003
```

The Apple Watch app runs from Xcode on a Mac:

```sh
cd mobile && npx expo prebuild -p ios --clean && xed ios
```

Then pick the **FHMatchCentreWatch** scheme and a watch simulator.

## Checking your work

```sh
pnpm test         # every package's tests
pnpm typecheck
pnpm gen:schema   # after changing packages/shared/src/schema.ts
```

| Tests | Run with |
| --- | --- |
| Shared package, API, website, phone app | `pnpm test` (the API's use the `fh_test` database) |
| Wear OS app | `cd watch-wear && ./gradlew :app:testDebugUnitTest` |
| Apple Watch engine | `cd mobile/targets && swift test` |

The watch apps' tests write a full match to `mobile/test/fixtures/` (`wear-full-match.json`, `watchos-full-match.json`), which the phone app's tests run through its real import, so a change to either watch that breaks the format fails a test.

## Commits

One change per commit, with [conventional commit](https://www.conventionalcommits.org) messages (`feat(watch): …`, `fix(phone): …`, `docs: …`): the release notes and changelog are written from them by git-cliff. Work happens on `dev`; `main` is for full releases.

## Editing these docs

The docs are Markdown in `docs-site/`: the user guide in `guide/`, the technical pages in `technical/`, and the sidebar in `_sidebar.md`. Design, releasing, Google Play, deployment and the privacy policy are copied from `docs/` when the site is built, so edit those in `docs/`.
