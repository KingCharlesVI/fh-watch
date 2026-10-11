# Getting started

## What you need

| | Android | iPhone |
| --- | --- | --- |
| **Watch** | A Wear OS 3 watch or later: Samsung Galaxy Watch 4 and newer, Google Pixel Watch | An Apple Watch with watchOS 10 or later (Series 4 and newer) |
| **Phone** | An Android phone paired with the watch | An iPhone paired with the watch |

A Wear OS watch only pairs with an Android phone, and an Apple Watch only with an iPhone, so the two go together.

?> The watch works on its own during a match. The phone is only needed afterwards, to receive the match.

## Installing (beta)

The beta is for invited umpires. Ask to join from [fhmatchcentre.com](https://fhmatchcentre.com/#download).

### Android and Wear OS

Either:

- **From Google Play** (once you've been invited): open the testing link on your phone with the same Google account, install the phone app, then install the watch app from the Play Store on the watch (or from the phone's Play Store, under your watch).
- **From the APKs** on the download page: the phone APK installs on the phone directly (allow installing from your browser when asked). The watch APK is installed from a computer with `adb`, or with a sideloading app; the download page has the steps.

Install the **phone and watch apps from the same build**: they need to match to talk to each other.

### iPhone and Apple Watch

The iPhone app comes through **TestFlight**. Install TestFlight from the App Store, accept the invitation, and install FH Match Centre. The Apple Watch app comes with it: open the **Watch** app on your iPhone, find FH Match Centre under **Available apps** and tap **Install** (or it installs by itself if automatic app installs are on).

### Your account

Open the phone app and tap **Create an account** (or sign in, if you made one on the [website](https://app.fhmatchcentre.com)). Confirm your email address from the email you're sent, then sign in. See [Signing in](guide/phone.md?id=signing-in).

If your club organises its umpires on the website, ask its admin to add you to the club's list: you'll then be asked to umpire its fixtures, by email and in the app. See [Club umpiring](guide/club-umpiring.md).

## Your first match

1. **Open the app on the watch** and tap **New match**. It starts from your last match's choices.
2. **Set it up:** the format (4 × 15 min quarters, or halves), the teams' names and colours, and, if you like, the captains and the venue. Tap **Ready**.
   Or set it up on your phone, where typing is easier: see [Setting up on the phone](guide/phone.md?id=setting-up-a-match-on-the-phone).
3. **Start the first period**: on a Galaxy Watch press the lower side button, on an Apple Watch tap **Start**. The clock runs.
4. **During the match**, swipe between the pages: **Timing** (the clock and score), **Goals**, **Cards** and **Settings**. The button stops and restarts the clock.
5. **At the end of each period** the watch buzzes; press the button to end the period. The break counts down; tap **Next: Q2** (or press the button) to move on, then start the clock when play restarts. After the last period, tap **End match**.
6. **The match goes to your phone** by itself when it's in reach. Open the phone app: it's under **New**.
7. **Upload and publish it** from its page in the phone app when you've checked it: see [Uploading and publishing](guide/phone.md?id=uploading-and-publishing).

The [Wear OS](guide/wear-os.md) and [Apple Watch](guide/apple-watch.md) pages go through everything in detail.

## Updates

- **Android, from GitHub releases:** the phone app tells you when there's a newer phone or watch app, installs its own, and sends the watch's to the watch to install there. See [Updates](guide/phone.md#updates-android).
- **Android, from Google Play:** Google Play updates both apps.
- **iPhone:** TestFlight tells you about new builds; the watch app updates with the iPhone app.
