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

## I'm not getting emails

Emails (confirming your address, password resets, appointments) come from FH Match Centre at fhmatchcentre.com. Check your spam or junk folder, and add the address to your contacts. A password reset link lasts an hour and a confirmation link 24 hours; ask for a new one if it's run out.

## "Too many attempts" or "Too many requests"

To stop people guessing passwords, sign-in, password resets and similar allow 10 tries in 15 minutes. Wait, then try again. Everything else allows far more than anyone needs, so seeing it there means the app or a script is going wrong: tell us.

## The phone app can't reach the server

**Settings → About** says whether the server answers. **Can't reach it** usually means the phone has no internet connection; **Having problems** means the server answered with an error. Either way your matches are safe on the phone and can be uploaded later. [status.fhmatchcentre.com](https://status.fhmatchcentre.com) shows whether the service is up.

## Reminders don't arrive

- Check **Settings → Notifications** in the app is on.
- If it says notifications are turned off in your phone's settings, allow them for FH Match Centre there.
- Upload reminders are for matches from your watch that haven't been uploaded after 2 hours; appointment reminders come at 6pm the day before a match you've accepted.

## An appointment isn't in Upcoming

- Only matches you've **accepted** as the **watch umpire** join the list; as second umpire, they're shown above it.
- Pull down on **Upcoming** to fetch your appointments now.
- If you deleted it from Upcoming, it isn't added again: set it up yourself, or see it on the website under **Umpiring → Appointments**.

## Still stuck?

Report a problem on [GitHub](https://github.com/KingCharlesVI/fh-watch/issues), with your phone and watch models and the app versions from Settings.
