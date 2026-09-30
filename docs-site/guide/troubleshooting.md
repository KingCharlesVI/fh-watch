# Troubleshooting

## A match hasn't reached my phone

1. **Check the watch's summary** (or **Past matches**): **Not synced** means the phone hasn't confirmed it yet.
2. **Bring the phone near** with Bluetooth on, and open the phone app. Matches wait on the watch until the phone is in reach, however long that takes.
3. On the watch, **Settings → Resend all unsynced** (or **Send to phone** on the match).
4. **Wear OS:** the phone and watch apps must come from the same build, and from the same place (both from Google Play, or both from the same GitHub release). Check the versions in each app's Settings.
5. **Apple Watch:** check the watch app is installed from the iPhone's Watch app.

A match is never deleted from the watch until the phone has it.

## The side button doesn't start the clock (Wear OS)

The lower side button works on Samsung Galaxy Watch 4 to 7 and similar watches. On a watch without a usable button (a Pixel Watch, say), turn on **Start/stop on screen** in the watch's Settings.

## The clock stops when I lower my wrist (Apple Watch)

The app needs **Health** access to keep running with your wrist down. On the iPhone: **Settings → Health → Data Access & Devices → FH Match Centre**, and allow it.

## The phone says a match from the watch "needs an update"

The watch app is newer than the phone app. Update the phone app; the match waits safely until you do.

## "A match from the watch couldn't be read"

Something went wrong with that match. **Settings → Watch** shows it with an **Export** button: send the file to the developers (see below) so it can be looked at. It stays on the phone in the meantime.

## My workout isn't in Samsung Health

- Check it's on the match page first (**Your workout**). If not, turn on **Record workout** on the watch before the next match.
- Tap **Save to Health Connect**, and allow everything Android asks.
- In Samsung Health, turn on **Settings → Health Connect** sync.

## Installing the watch APK fails

The watch app has to be installed from a computer (with `adb`) or with a sideloading app. If it says the app is already installed with a different signature, uninstall the watch app first (after syncing its matches to the phone), then install again.

## Still stuck?

Report a problem on [GitHub](https://github.com/KingCharlesVI/fh-watch/issues), with your phone and watch models and the app versions from Settings.
