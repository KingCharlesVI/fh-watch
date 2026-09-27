# Wear OS umpire app

Kotlin, Jetpack Compose for Wear OS (Material 3), Room. Runs on Wear OS 3 and later (API 30+). See [docs/design.md](../docs/design.md) for what it does and why.

During a match the screen is a row of pages, swiped left and right: **Timing** (clock, score, start/stop, injury and video stops), **Cards** (suspension timers and earlier cards, + to give one), **Goals** (score, +1 per team, penalty corners, strokes), **Phone** (whether the phone is in reach, and sending anything left over) and **Match** (clock direction, the events log, ending a period or the match). Timing is first; swiping right from it goes back home. The layout is in `ui/MatchScreen.kt`; the page order is the `Page` enum there.

## Running it

From the repository root:

```sh
pnpm dev:watch          # starts the Wear OS emulator if needed, builds, installs and opens the app, then shows its log
```

Or with Gradle directly, from this folder (needs a JDK 17+; Android Studio's is in `C:\Program Files\Android\Android Studio\jbr`):

```sh
./gradlew :app:installDebug        # to every connected device, or set ANDROID_SERIAL to pick one
./gradlew :app:testDebugUnitTest   # the match engine and the document contract
```

The physical button: on Galaxy watches it's the lower (Back) button; during a match it starts and stops the clock, and swiping right still goes back. On Wear OS 6 a swipe back also arrives as a Back key; it's told apart from the button by its "virtual key" flag and the touch just before it (see `dispatchKeyEvent` in `MainActivity.kt`, which has the values measured on a Galaxy Watch7). `adb logcat -s FHKey` shows each Back key and what was decided. On the emulator, `adb shell input keyevent 4` acts as the button. `adb shell input rotaryencoder scroll --axis SCROLL,-1` turns the crown.

## Layout

| Path | What |
| --- | --- |
| `engine/` | The match engine: pure Kotlin, no Android. Clock, periods, breaks, goals, cards and suspension timers, corners, strokes, shootout, undo, alerts. The document types mirror `packages/shared/src/schema.ts`. |
| `data/` | Room storage (one row per match, rewritten on every event) and preferences (last setup, clock direction). |
| `match/` | `MatchController` applies actions and saves them; `MatchService` is the foreground service that ticks, vibrates and keeps the match on the watch face. |
| `sync/` | Sending finished matches to the phone over the Data Layer, and the phone's acknowledgements. |
| `ui/` | Compose screens. |

## The document contract

`DocumentSchemaTest` builds a match using every event type and validates it against `schema/match.schema.json`, and writes it to `app/build/match-fixtures/full-match.json`. To check that file with the full TypeScript validator too (the one the phone and API use, which also checks things like a scored stroke having its goal):

```sh
pnpm --filter @fh/shared check:match ../../watch-wear/app/build/match-fixtures/full-match.json
```

A copy lives at `mobile/test/fixtures/wear-full-match.json`, so the phone's tests run against the watch's real output. Refresh it after changing what the watch writes.

## Syncing with the phone

The watch and phone apps share the package name `com.fhmatchcentre.app` and must be signed with the same key, or the Data Layer won't connect them. Debug builds of both use React Native's public debug key (`app/debug.keystore`). Release builds will need the same upload key for both.

To try sync end to end you need a paired watch and phone:

- **Real devices:** pair the watch with the phone as usual, install the phone app (`pnpm dev:mobile`) and the watch app (`pnpm dev:watch`) with USB or Wi-Fi debugging.
- **Emulators:** the phone emulator must have Google Play, be signed in to a Google account and have the Pixel Watch (or Wear OS) app installed. Then pair them in Android Studio: Device Manager → the Wear OS emulator's menu → Pair Wearable. Without the companion app, the phone's log shows `MISSING_COMPANION_APP` and nothing is delivered.

After a match, the summary screen says whether the phone has it. The phone's Settings → Watch shows whether a watch is connected.
