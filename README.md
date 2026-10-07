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
| `docs-site` | The documentation site, user guide and technical (docsify, for Vercel at docs.fhmatchcentre.com). See [docs-site/README.md](docs-site/README.md) |
| `landing` | The public landing page (static, for Vercel): what it does, the stage it's in, download links, the changelog, support and the privacy policy. See [landing/README.md](landing/README.md) |
| `status` | The status page (for Vercel): whether the apps, website and API are working, with incidents and uptime. Its own SQLite database, and no connection to the API. See [status/README.md](status/README.md) |
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
pnpm dev:docs             # the documentation site, http://localhost:3003
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

Needs Android Studio (SDK and an emulator) for Android. iPhone builds are made in the cloud by EAS Build, so they don't need a Mac: see [iPhone builds](#iphone-builds-testflight).

**Building for Android on Windows.** React Native's generated native code has paths over 260 characters, so:

1. Turn on Windows long paths (once, in an administrator PowerShell):
   `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`
2. Install **CMake 3.31.6** in Android Studio (Settings → Android SDK → SDK Tools → CMake, tick "Show package details"). The app is set to use it, because its Ninja handles long paths; the default 3.22.1 doesn't.

The workspace uses pnpm's `node-linker=hoisted` (see `.npmrc`) for the same reason: pnpm's default symlinked layout breaks the Android native build.

The app is built for a **stage**, set by `EXPO_PUBLIC_STAGE` in `mobile/.env`: `alpha` (watch and phone only: no account, matches saved and exported on the phone) or `beta` (with the API and website). See `mobile/src/config.ts`.

```sh
cp mobile/.env.example mobile/.env    # the stage, and the API and website addresses for the beta
pnpm dev mobile                       # alpha: emulator and app; the first run builds and installs the app
pnpm dev:mobile                       # beta: the API too
pnpm --filter @fh/mobile test         # sync engine, watch inbox, backups and API client tests
```

In a development build, **Settings → Add a sample match** creates a finished match to try things with.

## Packaging the apps for release

The phone app and the Wear OS app are packaged by one script, [scripts/release-android.mjs](scripts/release-android.mjs), with a shortcut for each app. The script makes signed release builds ready to hand out: an **App Bundle** (`.aab`) for Google Play, and optionally an **APK** (`.apk`) that installs straight onto a device.

### Before the first release

- **An upload key.** Release builds are signed with your upload key, which is named in `~/.gradle/gradle.properties`. How to make it and set it up is in [docs/play-store.md](docs/play-store.md), step 1. Without one, the script stops, unless you add `--debug-key`: that signs with the development key, which is fine for trying a build but Google Play refuses it.
- **The Android SDK and a JDK.** Both come with Android Studio, and the script finds them itself (or set `ANDROID_HOME` and `JAVA_HOME`).
- **The Play Console setup** (the listing, the Wear OS form factor and the testing tracks) is also in [docs/play-store.md](docs/play-store.md).

### The commands

| Command | What it builds |
| --- | --- |
| `pnpm release:android` | Both apps: the phone app and the Wear OS app. |
| `pnpm release:phone` | Just the phone app. |
| `pnpm release:watch` | Just the Wear OS app. |

Each takes the same options, in any order:

| Option | What it does |
| --- | --- |
| `--bump` | Adds 1 to the build number in `version.json` before building. Google Play refuses a build number it has already seen, so use this for every upload after the first. |
| `--beta` | Builds the phone app for the beta (with sign-in, the API and the website) instead of the alpha (watch and phone only). It makes no difference to the watch app. See `mobile/src/config.ts`. |
| `--apk` | Also makes an APK of each app, for installing directly on a phone or watch without Google Play. These are the **GitHub builds**: they can install their own updates from GitHub releases (the phone downloads both apps' and sends the watch its), which Google Play's builds can't. |
| `--debug-key` | Signs with the development key when no upload key is set up. For trying a build only. |

With pnpm, options go straight after the command: `pnpm release:watch --bump --apk`.

### What you get

Everything lands in `dist/play/` (which isn't committed), named after the version and build number in `version.json`:

| File | Upload to / use for | Version code |
| --- | --- | --- |
| `fh-match-centre-phone-<version>-<build>-alpha.aab` (or `-beta`) | The phone tracks in Play Console | the build number |
| `fh-match-centre-watch-<version>-<build>.aab` | The Wear OS tracks in Play Console | 1,000,000 + the build number |
| `.apk` files with the same names (with `--apk`) | Installing directly: `adb install <file>` | as above |

Both apps share one Play listing, so their version codes must never clash; the watch's is offset by a million for that. The version name (`0.1.0`) is the one users see; change it in `version.json` by hand when a release deserves a new number.

### Everyday use

```sh
# The first release of both apps
pnpm release:android

# Every release after that: a new build number, both apps
pnpm release:android --bump

# A fix to just one app
pnpm release:watch --bump
pnpm release:phone --bump

# A build to try on your own devices, without going through Google Play
pnpm release:watch --apk
adb -s <watch serial> install -r dist/play/fh-match-centre-watch-<version>-<build>.apk
```

(`adb devices` lists the serials. Installing over an app from Google Play only works if the APK was signed with the same key; if it wasn't, uninstall the other one first.)

**Keep the two apps in step.** The watch sends matches to the phone over the Wear OS Data Layer, which only connects apps signed with the same key, and both apps read the same match format. When one app changes, it's safest to release both from the same build number, so testers never have a phone and watch from different builds. When you build only one, the script reminds you.

**The phone build takes longer.** It first regenerates `mobile/android/` from `mobile/app.config.ts` (`expo prebuild`), so the version, icon, fonts and signing are always current, and then builds the JavaScript bundle into the app. Don't edit files in `mobile/android/` by hand: they're overwritten.

After building, upload the bundles as described in [docs/play-store.md](docs/play-store.md) (step 4, Internal testing).

### Publishing a GitHub release

For the commands in order (build number, changelog, GitHub release, TestFlight), see [docs/releasing.md](docs/releasing.md).

`pnpm release:github` ([scripts/github-release.mjs](scripts/github-release.mjs)) builds both apps' APKs on this PC and publishes them as a release on GitHub, with patch notes written by [git-cliff](https://git-cliff.org) from the commit messages. The branch you're on decides the kind of release:

| Branch | Release | Tag | Notes cover |
| --- | --- | --- | --- |
| `dev` | A **pre-release**, for testing | `v<version>-<stage>.<build>`, e.g. `v1.1.2-beta.18` (with `--beta`) | Commits since the last tag (the previous pre-release) |
| `main` | A full release, marked **Latest** | `v<version>-alpha` before 1.0.0, e.g. `v0.4.0-alpha`; `v<version>` from 1.0.0 | Commits since the last full release, so every pre-release of that version together |

Each release has the phone and watch APKs from the same build attached. On GitHub: **Releases**.

| Option | What it does |
| --- | --- |
| `--dry-run` | Builds the APKs and writes the notes, but publishes nothing. Use it to check the notes first. |
| `--skip-build` | Publishes the APKs already in `dist/play/` for this version and build, instead of building them again. |
| `--beta` | As for the packaging commands: the phone app for the beta. The tag then says `beta`. |

**Once, before the first release.** Install the GitHub CLI and sign in to it (it asks for the account in the browser):

```powershell
winget install GitHub.cli
# then, in a new terminal:
gh auth login
```

git-cliff reads the repository's `cliff.toml`. The script writes the notes to `dist/play/release-notes-<tag>.md` and leaves `CHANGELOG.md` as it is; [docs/releasing.md](docs/releasing.md) has the command that adds the new entry to it.

**A pre-release from `dev`:**

1. Set the build in `version.json` to one more than the last release (each pre-release needs a new build number, so its APKs install over the last ones), and commit.
2. Push `dev`. The script checks that what you have is what's on GitHub, because the tag goes on the pushed commit.
3. `pnpm release:github`

**A full release from `main`:**

1. Merge `dev` into `main` (a pull request on GitHub), then check out `main` and pull.
2. `pnpm release:github`. The build is the one last tested as a pre-release, so there's nothing to change first.
3. For the next version, change `version` in `version.json` on `dev` (e.g. 0.3.0 → 0.4.0).

The script stops before building if anything is out of order: another branch, uncommitted changes, a commit that isn't pushed, or a tag that already exists (it then says which number to change). It never pushes commits; `gh` makes the tag on GitHub at the pushed commit, and the script fetches it afterwards.

**Commit messages make the notes.** git-cliff groups commits by their [conventional commit](https://www.conventionalcommits.org) type (`feat:` under Features, `fix:` under Bug Fixes, and so on). Commits without a type land under Other, as written.

#### Getting the APKs to testers

The landing page's APK buttons link to the newest release's APKs, pre-releases included, so a new release reaches testers as soon as it's published, without redeploying the landing page (see [landing/README.md](landing/README.md)). This needs the repository to be public: a private repository's releases need a GitHub login with access to it.

The phone app tells testers about new releases itself. It checks the releases when it opens (and every six hours while in use), and shows a notice on the match list when there's a newer phone app, or a newer watch app than the one on the paired watch (which tells the phone its build number). The phone app downloads and installs its own APK from the notice, and downloads the watch's and sends it to the watch, which installs it from **Install update** on its home screen (see the [user guide](docs-site/guide/phone.md#updates-android)). Google Play's builds show no notices, as Play updates them. **Settings → About → Include pre-releases** (on by default) decides whether pre-releases from `dev` count, or only full releases from `main`. Builds are compared by the build number in the APK names, so each release needs a higher build than the last one it should replace.

### iPhone builds (TestFlight)

iOS apps can't be built on Windows, so the iPhone app is built by [EAS Build](https://docs.expo.dev/build/introduction/) (Expo's cloud builders) and handed to testers through **TestFlight**. There's no APK-style install on an iPhone, and GitHub update notices are Android only: TestFlight tells testers about new builds itself.

The iPhone app is the same app as on Android, with the Apple Watch app inside it (Wear OS watches don't pair with iPhones). The watch app installs from the iPhone's Watch app, or by itself on the watch, once the iPhone app is on.

**Once, before the first build:**

1. An [Expo account](https://expo.dev/signup), and an Apple Developer Program membership.
2. In `mobile/`: `npx eas-cli login`, then `npx eas-cli init`. That created the Expo project; its ID is `EAS_PROJECT_ID` in `mobile/app.config.ts`. (Done already: only needed again for a new Expo account.)
3. The first build asks for your Apple ID and makes the signing certificate and provisioning profile itself (EAS keeps them). The first upload also creates the app in App Store Connect if it isn't there.
4. In [App Store Connect](https://appstoreconnect.apple.com), under the app's **TestFlight** tab, add testers (up to 100 internal testers, from your team, with no review; external testers after a short beta review). Testers install the TestFlight app and accept the invite.

**Each build:**

```sh
pnpm release:ios
```

This builds the beta from the committed code (`mobile/eas.json`, profile `beta`; `alpha` is the same without the API), then uploads it to App Store Connect. It reaches TestFlight after Apple's processing, usually 10 to 30 minutes. The build number comes from `version.json`, as on Android, and App Store Connect refuses one it has already seen for the same version, so build after bumping it, as for a GitHub release. EAS's free plan includes a limited number of iOS builds a month, queued behind paid ones.


### Apple Watch app

The watch app is SwiftUI, in `mobile/targets/watch/`. The `@bacons/apple-targets` config plugin adds it to the iPhone app at prebuild, so EAS builds include it; nothing else is needed for TestFlight.

- **Engine tests** (no Xcode needed): `cd mobile/targets && swift test`. They're the Wear OS engine's tests, ported, and they write `mobile/test/fixtures/watchos-full-match.json`, which the phone's tests check. Swift runs on Windows too ([install](https://www.swift.org/install/windows/)).
- **On a Mac**, to run it in the simulator or on a watch: `cd mobile && npx expo prebuild -p ios --clean`, then `xed ios`. Pick the **FHMatchCentreWatch** scheme and a watch simulator, and Run. Edit the watch files in Xcode's `expo:targets/watch` group: they're the files in `mobile/targets/watch/`. For a real watch, set `APPLE_TEAM_ID` (your team ID, from the Apple Developer site) before prebuild.
- **What's different from Wear OS:** there's no side button to use, so the Timing page has the Start/Stop button, which double-tap presses on a Series 9, Ultra 2 or later with watchOS 11. A workout session keeps the match running with the wrist down; the first match asks for Health access for that.
