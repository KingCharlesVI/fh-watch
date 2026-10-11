## [1.2.0-beta.20] - 2026-10-08

### 🚀 Features

- *(api)* Generous rate limits on every request, exports and password changes
- *(mobile)* Show whether the server answers in Settings
- *(mobile)* One switch in Settings for all notifications
- *(mobile)* What's new after an update, and from Settings
- *(api)* Search matches by words in their teams, venue or competition
- *(web)* Search clubs, teams, competitions, venues and matches at once
- *(shared)* Read CSV files
- *(api)* Bulk import clubs and teams, venues or competitions
- *(web)* Import clubs and teams, venues or competitions from a CSV
- *(api)* Club umpire lists, with levels and competitions' minimum level
- *(api)* Club fixtures, added one by one or from a spreadsheet
- *(api)* Umpires mark the days they can or can't umpire
- *(api)* Appoint umpires to fixtures, who accept, decline or ask for cover
- *(api)* Suggest umpires for a fixture, with clashes and a fair spread
- *(api)* A private calendar of each umpire's appointments
- *(api)* Find fixtures short of umpires, and email club admins about them
- *(web)* Club admins keep their umpire list, fixtures and appointments
- *(web)* Umpires answer appointments, mark availability and see their season
- *(web)* Admins set the umpire level each competition asks for
- *(mobile)* Club appointments on the phone, in Upcoming and the day before

### 📚 Documentation

- Club umpiring, and what it means for privacy

### ⚡ Performance

- *(api)* Indexes for the public results list and competition and venue filters
- *(web)* Cache the public club, team, competition and venue lists for a minute

### 🚜 Refactor

- *(api)* Type responses with the shared API types

### ⚙️ Miscellaneous Tasks

- *(release)* V1.2.0 build 21
## [1.1.3-beta.19] - 2026-10-07

### 🚀 Features

- *(api)* Competitions, a list admins keep like venues
- *(web)* Competitions to manage, and venues and competitions to pick when editing a match
- *(mobile)* Pick the venue and competition from the site's lists when editing a match
- *(api)* Umpires can add a venue or competition that's missing
- *(mobile)* Add a missing venue or competition while setting up or editing a match
- *(web)* Add a missing venue or competition while editing a match

### 📚 Documentation

- Competitions, and picking venues and competitions when editing a match
- Umpires add missing venues and competitions as they go

### ⚙️ Miscellaneous Tasks

- *(release)* V1.1.3 build 19
## [1.1.2-beta.18] - 2026-10-07

### 🚀 Features

- *(api)* Club venues, managed like teams and searchable
- *(web)* Manage a club's venues
- *(mobile)* Pick teams and venues from the clubs when setting up a match
- *(api)* Delete answered test and club requests after 12 months
- *(deploy)* Keep the services' logs for 30 days
- *(mobile)* Report a bug or suggest a feature on GitHub from Settings

### 🐛 Bug Fixes

- *(mobile)* No touch effect on the tab bar

### 📚 Documentation

- Bring the guide and docs up to date for the beta
- The privacy policy for the beta, with accounts and uploads
- The support pages say what account deletion and notifications really do

### 🚜 Refactor

- Venues are one list of their own, not a club's

### ⚙️ Miscellaneous Tasks

- *(release)* V1.1.2 build 18
## [1.1.0-beta.17] - 2026-10-07

### 🚀 Features

- A 10-minute half-time in the 2 × 35 min preset
- *(mobile)* Pick an upcoming match's day and kick-off with date and time pickers

### 🐛 Bug Fixes

- *(mobile)* Notifications show as on without a push token
- Sending the watch app from the phone, and installing it on the watch

### ⚙️ Miscellaneous Tasks

- *(release)* V1.1.1 build 17

### 💼 Other

- Update content.ts
- Merge pull request #39 from KingCharlesVI/main

minor changes
- Update CHANGELOG.md
## [1.1.0] - 2026-10-06

### 💼 Other

- Update content.ts
- Merge pull request #39 from KingCharlesVI/main

minor changes
## [1.1.0-beta.15] - 2026-10-05

### 🚀 Features

- *(mobile)* Install the new phone app from the update notice
- *(wear)* Install a new watch app sent from the phone
- *(mobile)* Send the new watch app to the watch

### 🐛 Bug Fixes

- *(mobile)* Google Play's build doesn't offer GitHub updates

### 📚 Documentation

- Updating both Android apps from the phone

### ⚙️ Miscellaneous Tasks

- *(release)* V1.1.0 build 15

### 💼 Other

- GitHub builds of both apps, apart from Google Play's
## [1.1.0-beta.14] - 2026-10-05

### 🚀 Features

- *(scripts)* Take store screenshots from both devices at once
- *(landing)* The real app in the hero, and the right project board
- How to delete your account, and how to delete your data
- *(scripts)* Render Google Play's 512 store icon too
- *(scripts)* Render the Play feature graphic
- *(shared)* Shootout cards, forfeits and the FIH taking order
- *(wear)* The shootout follows the FIH order, with cards and forfeits
- *(wear)* FIH shootout screen, with an 8-second timer on the side button
- *(watchos)* The shootout follows the FIH order, with cards and forfeits
- *(watchos)* FIH shootout screen, with an 8-second timer
- *(web)* Shootout cards and forfeits on the match page
- *(mobile)* A red card report for a red card in the shootout
- *(mobile)* Upcoming matches, set up ahead and sent at the ground
- *(mobile)* An upcoming match leaves the list once it's played
- *(mobile)* A summary of your umpiring, by season

### 🐛 Bug Fixes

- *(release)* The iOS build uses the beta profile
- *(watchos)* The engine tests compile again

### 📚 Documentation

- *(play)* App content answers for 1.0, not the alpha
- The FIH shootout on both watches
- Upcoming matches in the phone app
- The umpire summary in the phone app

### 🚜 Refactor

- *(mobile)* The setup form is its own component

### 🧪 Testing

- *(mobile)* Refresh the Wear OS app's full match

### ⚙️ Miscellaneous Tasks

- Bump to v1.1.0 build 14

### 💼 Other

- Merge pull request #34 from KingCharlesVI/main

v1.0.0 rebalancing
## [1.0.0-beta.13] - 2026-10-03

### 🚀 Features

- *(wear)* A break leads to the next period, which waits for the whistle
- *(watchos)* A break leads to the next period, which waits for the whistle
- *(mobile)* Create an account in the app, not on the website
- *(mobile)* Reset a forgotten password in the app
- *(landing)* A front page that answers the obvious questions
- *(landing)* A support page
- *(web)* A support page
- *(landing)* A form to ask for a place in the TestFlight test
- *(landing)* A form to ask for a place in the Google Play test
- Issue forms for bugs and features, linked from both sites
- *(landing)* Grey out the stages that are done
- *(landing)* A changelog page
- *(landing)* The join forms ask for an email address
- *(api)* Endpoints behind the join-the-testing forms
- *(api)* Confirm a testing request by email
- *(api)* Email the decision, with what to do next
- *(landing)* Drop the roadmap, keep the progress stepper
- *(web)* An admin panel for testing requests

### 🐛 Bug Fixes

- *(release)* The Play upload matches how the apps are built now

### 📚 Documentation

- The break and the next period on the watch
- Registering in the phone app
- *(deploy)* SES is in eu-north-1, not eu-west-2

### ⚙️ Miscellaneous Tasks

- *(release)* Build 13
## [1.0.0-beta.12] - 2026-10-03

### 🚀 Features

- *(web)* A front page, with the results on their own page
- *(web)* Brand header with a phone menu, and a proper footer
- *(web)* Icons, share previews, and designed 404, error and loading pages
- *(web)* Results grouped by day, with the scores in one column
- *(web)* A scoreboard, a two-sided timeline and statistic bars on match pages
- *(web)* Club and team pages with badges, team cards, record and form
- *(web)* Dashboard summary, branded sign-in pages, aligned scores
- *(api)* [**breaking**] Remove auto-publish
- *(web)* Drafts wait for their umpire, with no auto-publish
- *(phone)* Remind to upload matches, with no auto-publish

### 🐛 Bug Fixes

- *(deploy)* The website and API live at app.fhmatchcentre.com
- *(mobile)* A deleted match no longer comes back from the watch

### 📚 Documentation

- *(deploy)* Amazon SES for email, and the Ubuntu Desktop laptop server
- No public beta, straight from the alpha to 1.0

### ⚙️ Miscellaneous Tasks

- From 1.0.0, main releases are tagged with just their version
- Start 1.0.0
- Build bump to 11
- *(mobile)* Ignore the native modules' .gradle folders

### 💼 Other

- Merge pull request #24 from KingCharlesVI/main

v0.4.1 remerge
- Merge branch 'dev' of https://github.com/KingCharlesVI/fh-watch into dev
## [0.4.0-alpha.9] - 2026-09-30

### 🚀 Features

- *(phone)* Run on iPhone
- *(watch)* Record the umpire's workout during a match
- *(phone)* Show the umpire's workout from the watch
- *(phone)* Save workouts to Health Connect
- *(phone)* Red card reports for England Hockey
- *(watchos)* The match engine in Swift
- *(watchos)* The Apple Watch umpire app
- *(phone)* Receive matches from the Apple Watch

### 🐛 Bug Fixes

- Compile the shared package on install

### 📚 Documentation

- Cover recorded workouts in the privacy policy
- Cover red card reports in the privacy policy
- The Apple Watch app
- A quick reference for releasing

### ⚙️ Miscellaneous Tasks

- Build the iPhone app with EAS for TestFlight
- *(phone)* Link the Expo project

### 💼 Other

- Update CHANGELOG.md
- Update .gitignore
## [0.4.0-alpha.8] - 2026-09-27

### 🚀 Features

- *(landing)* APK buttons link to the newest GitHub release
- *(phone)* Share the match report in one tap
- *(watch)* Delete a past match from the watch
- Update notices from GitHub releases

### 🐛 Bug Fixes

- *(watch)* Screen doesn't dim while the app is open

### ⚙️ Miscellaneous Tasks

- *(landing)* Stop tracking the build output
- Start 0.4.0

### 💼 Other

- Update CHANGELOG.md
## [0.3.0-alpha.7] - 2026-09-27

### 🚀 Features

- Card reasons
- Three-digit shirt numbers

### 🐛 Bug Fixes

- *(watch)* Side button starts and stops the clock on Galaxy watches

### 🚜 Refactor

- *(watch)* Leave clock control to the side button

### ⚙️ Miscellaneous Tasks

- General tidying
- Publish GitHub releases from this PC
- Git-cliff for changelog

### 💼 Other

- Landing page fixes
- Update content.ts
- Workflow Update

- Fixed swipe back bug
- Adjusted number and colour input
- Added github actions builds
- Delete android.yml
- Update content.ts
- Some fixes
- Ensure screen stays on
- Optionally allow setup on mobile
- Fix button/swipe timer control
- Update CHANGELOG.md
## [0.2.0] - 2026-09-25

### 💼 Other

- Initial commit
- Milestone 1
- Milestone 2
- Milestone 4
- Milestone 5
- Milestone 6
- 0.2.0-Alpha
