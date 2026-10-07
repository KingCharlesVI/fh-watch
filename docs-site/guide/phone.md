# The phone app

Every match you've umpired, on your phone: check it, fix it, upload it and publish the result on the [website](guide/website.md).

## Signing in

The app opens on **Sign in**. No account yet? Tap **Create an account**: your name, email address, a password and, if you like, your club (pick it from the list, or ask for one that isn't there). Confirm your address from the email you're sent, then sign in. **Forgotten your password?** emails you a link: paste it into the app, or open it, and choose a new password.

?> The alpha builds (`-alpha` on the GitHub releases page) have no account: matches stay on the phone, under **New** and **Saved**, and there's no uploading or publishing.

## Your matches

Matches from the watch arrive by themselves, even when the app is closed, and appear under **New** until you've opened them. The rest are under **Drafts** (uploaded, but only you and your colleague can see them) and **Published** (on the website for everyone). Matches you've uploaded from another phone, or that a colleague added you to, are listed too, and download when you open them.

Pull down on the list to check for anything waiting.

## A match

Opening a match shows:

- The **score** and the date, competition and venue.
- **Red card reports**, if there was a red card: see [Red card reports](guide/red-cards.md).
- The **timeline**: goals, cards, strokes, shootout attempts and notes, in order.
- The **score by period** and the **statistics** (cards, and corners and strokes in older matches).
- **Your workout**, if the watch recorded one: see [Workouts](guide/workouts.md).
- The **umpires**.

### Uploading and publishing

Nothing leaves the phone until you ask. A match that's only on the phone says so at the top, with **Upload**: it then goes to the website as a **draft**, which only you and your colleague can see. With no signal, it waits and goes as soon as there's a connection. Change it afterwards and it says **Upload changes**.

When you're happy with it, **Publish** puts it on the website for everyone. **Share link** then shows its QR code and a link to copy or send; **Unpublish** takes it off again. **Open on the website** opens its page there.

If someone saved a newer version on the website since your last upload, the match says so: **Keep mine** replaces theirs, **Use theirs** drops your changes.

### Sharing the match report

**Share report** sends the one-page match report (PDF) to any app: WhatsApp, email, Quick Share, and so on. On Android the message carries the result too.

### Exports

Each can be saved to a folder you pick (**Save to phone**) or shared:

| Export | |
| --- | --- |
| **Match report (PDF)** | One page: the score, score by period, goals, cards and statistics. |
| **Events (CSV)** | Every event, for a spreadsheet. |
| **Match data (JSON)** | Everything, for importing on another phone or the website. |

## Your summary

**Summary** adds up your umpiring from the matches on the phone, for this season, last season (seasons run September to August) or all time: matches, goals and cards (and how many a match), the cards by colour and reason, results and shootouts, the teams you've umpired most, and how far you ran when the watch recorded a workout.

## Editing a match

**Edit match** fixes anything the watch got wrong, or adds what it didn't record:

- **Details**: competition and venue.
- **Teams**: names, colours and captains, and the **club team** each one is: search for it (e.g. `hawks m1`) to link it, which puts the match on the club's pages on the website.
- **Umpires**: your colleague. Search for them if they have an account (they can then edit the match too), or type their name if they don't.
- **Events**: add a goal, card, penalty corner, stroke or note at a period and time; cancel an event (it's kept, struck through, and can be restored); add or change a card's reason.

**Save** checks the match first (the score and the events must make sense) and says what to fix if something's wrong.

## Setting up a match on the phone

Typing team names is easier on the phone. **Settings → Set up a match**: choose the format, the teams' names, colours and captains, and the venue, then **Send to watch**. The watch opens its setup screen with it; check it and tap **Ready**.

The team names and the venue can be anything you type. As you type, the app also offers the clubs' own teams and venues from the website (e.g. type `hawks` for **Oxford Hawks M1** or **Oxford Hawks, Pitch 1**): tap one to use it. Clubs keep these lists up to date; with no signal, you just type.

On a Wear OS watch you can start from the watch instead: **Setup on phone** on the watch opens this screen on the phone.

### Upcoming matches

To have nothing to type at the ground, set matches up beforehand under **Upcoming**. **New match** has the same fields as **Set up a match**, plus a day and a kick-off time, picked from a calendar and a clock, to put the list in order. Fill in what you know and **Save**; it doesn't need to be complete until you send it.

At the ground, open the match and tap **Send to watch**, as above. It's marked **Sent to watch**, and it leaves the list by itself once the played match comes back from the watch. A match whose day has gone without being played shows its date in amber; edit it or delete it.

Upcoming matches are kept on the phone only, and aren't in backups.

## Backups and moving phones

Uploaded matches are safe on the website. Anything only on the phone isn't, so back up now and then:

- **Settings → Save a backup** (to a folder) or **Share a backup** (to email, Drive and so on): one file with every match, its umpires, workout and red card reports.
- **Settings → Import from a file** reads a backup, or a single match exported from the app or the website. Matches the phone already has are skipped.

?> Uninstalling the app deletes its matches. Upload them or save a backup first.

## Settings

| Setting | |
| --- | --- |
| **Account** | Your name, email and roles, **Manage on the website**, and **Sign out**. Signing out removes the matches from this phone; anything not uploaded is lost, so it warns you first. |
| **Notifications** | **Turn on notifications** for a reminder when a match from your watch hasn't been uploaded 2 hours after it arrived. |
| **Watch** | Whether your watch is connected, and **Set up a match**. A match from the watch that couldn't be read shows here, with a way to export it. |
| **Health Connect** (Android) | Save workouts to Health Connect, for Samsung Health and other fitness apps. See [Workouts](guide/workouts.md). |
| **Your matches** | Backups and importing. |
| **About** | The version and build. On Android: update notices, and whether to include test builds (**Include pre-releases**). |

## Updates (Android)

If you installed the apps from the GitHub releases page, the phone app tells you when there's a newer phone app, or a newer watch app than the one on your watch, with a notice on the match list and in Settings. Both install from the notice, with no computer:

- **Install phone app** downloads it and asks Android to install it. Confirm, and the app closes and opens again on the new version, with your matches as they were. The first time, Android asks you to allow FH Match Centre to install apps: turn it on, come back and tap **Install phone app** again.
- **Send to watch** downloads the watch app and sends it to your watch (keep it near the phone with Bluetooth on; it can take a couple of minutes). The phone says when the watch has it, and the watch says **Update ready**; open FH Match Centre there and tap **Install update** on its home screen, then confirm. It's never offered during a match. The first time, the watch opens its **Install unknown apps** setting instead: turn it on, go back and tap **Install update** again. A watch app older than build 17 doesn't tell the phone it got the update; if **Install update** doesn't appear, install the new watch app on the watch by hand once.

With both to update, send the watch's first: installing the phone app closes it.

If you installed from Google Play, Google Play keeps both apps up to date instead, and the phone app doesn't show these notices.
