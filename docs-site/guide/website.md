# The website

The website, at [app.fhmatchcentre.com](https://app.fhmatchcentre.com), is where results are published: umpires upload their matches, and anyone can see published results, by match and by club.

## For everyone

- **Matches**: published results, newest first, with the score, timeline, cards and statistics. Filter them by club, team, competition or venue.
- **Clubs**: each club's teams and their matches.
- **Search** (the box at the top, or the magnifying glass on a phone): finds clubs, teams, competitions, venues and matches at once. A match is found when each word you type is in a team's name, the venue or the competition.
- A match can be downloaded as a report (PDF), a spreadsheet (CSV) or data (JSON).

## For umpires

Register with your email address, in the phone app (**Create an account** on the sign-in screen) or here; there's no approval needed. Either way you'll get an email with a link to confirm your address, and you can sign in once you've followed it.

1. **Sign in on the phone app** too, with the same account.
2. **Upload** a match from its page in the phone app. Nothing is uploaded until you ask; if there's no signal, it goes as soon as there is. If a match from your watch still isn't uploaded 2 hours after it reached your phone, the app reminds you.
3. The match is a **draft** on the website: only you and your colleague can see it. **Publish** it from the phone or the website when you're happy with it: nothing is published until you do.
4. **Share** a published match with a link or QR code.

Both umpires on a match can edit it; the website keeps every revision.

If clubs appoint you to their fixtures, **Umpiring** has your appointments, availability and season. See [Club umpiring](guide/club-umpiring.md).

The **Dashboard** lists your matches, with downloads of them all. Filter them by status, dates, club, team, competition and venue: pick a club to choose one of its teams, and type a competition or venue or pick it from the site's lists (any name containing what you type counts). The CSV download has the same filters. A match's **Edit** page has the same fixes as the phone app, for doing them at a desk: link each team to its club team, and type the venue and competition or pick them from the site's lists.

## For clubs

Club admins keep their club's **teams** up to date from **manage teams** on the **Dashboard** (or **Manage club** on the club's page): add and rename them. Umpires link a match's teams to these, which puts the match on the club's pages, and the phone app offers them as team names when an umpire sets up a match.

Club admins can also organise their club's umpiring from the **Dashboard**: a list of the club's umpires, its fixtures, and who's appointed to each. See [Club umpiring](guide/club-umpiring.md).

Anyone can ask for a new club, or to be a club's admin, from their account page; an admin approves it.

## Venues and competitions

The site keeps two lists that umpires pick from, apart from the clubs:

- **Venues**, the grounds matches are played at (e.g. `Banbury Road, Oxford`): offered when setting up a match in the phone app, and when editing one in the app or here. They aren't tied to a club, since clubs often share a ground.
- **Competitions**, the leagues and cups (e.g. `South League Premier`): offered when setting up a match in the phone app, and when editing one in the app or here.

Umpires add one that's missing as they go: typing a name the list doesn't have offers **Add “…” as a new venue** (or competition), in the phone app and on a match's **Edit** page. Adding one that's already there, in different capitals, just picks that one. Admins tidy the lists under **Admin → Venues** and **Admin → Competitions**: add, rename and delete. A match keeps its venue and competition as text, so renaming or deleting one doesn't change matches already played.

**Merge duplicates**, on the same pages, is for two names for one thing (`Banbury Rd` and `Banbury Road, Oxford`): pick the duplicate and the one to keep. Matches with the duplicate's name, in any capitals, take the kept one's, and the duplicate is deleted. Clubs and teams merge the same way: under **Admin → Clubs**, a duplicate club's teams, club admins and logo move to the club you keep (a team with the same name there is merged into it), and on a club's page, a duplicate team's matches are linked to the team you keep. Each changed match gets a new revision, so its edit history shows the change and phones pick it up.

## Importing from a spreadsheet

To start a league or season, **Admin → Import** adds many at once from a CSV file (save the spreadsheet as CSV), or rows pasted in:

- **Clubs and teams**: columns `club` and `team`, one row per team. A row with only a club adds just the club.
- **Venues** or **Competitions**: one column, `name`.

A heading row is optional. **Preview** shows what would be added, how many rows are already on the site (matched in any capitals) and any rows that can't be imported, by their line in the file. **Import** then adds them. Nothing already there is changed, so importing the same file twice is safe.
