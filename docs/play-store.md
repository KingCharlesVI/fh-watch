# Publishing on Google Play

FH Match Centre is one Play listing (package `com.fhmatchcentre.app`) with two app bundles: the phone app and the Wear OS app. Both are built by one command and signed with the same upload key. The Wearable Data Layer only connects a watch app and phone app signed with the same key, so testers must install both from Google Play, not mix Play installs with development builds.

## The stages

| Stage | Phone app | Needs |
| --- | --- | --- |
| **Alpha** (done) | Watch and phone only. No account and nothing sent anywhere: matches are saved on the phone and exported as PDF, CSV or JSON files, or backed up in one file. | Just this guide. |
| **Beta** (now) | Adds sign-in, uploading (only when the umpire taps Upload), publishing and share links. | The server running (see [deployment.md](deployment.md)), and updated Data safety answers. |
| **1.0** | The same apps, open to everyone rather than invited testers. | A closed test of 12 testers for 14 days first (see "Later: production"). |

The stage is baked into the phone app when it's built (`EXPO_PUBLIC_STAGE`, see `mobile/src/config.ts`). `pnpm release:android` builds the alpha's phone app; **`pnpm release:android --beta` builds the beta's**, which is what to use now. The watch app is the same for both, so its bundle's name has no stage in it.

## 1. Make the upload key (once)

The upload key proves bundles come from you. Google re-signs the apps for users with its own app signing key (Play App Signing), so if the upload key is ever lost, Google support can replace it.

In PowerShell:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\fh-upload-key.jks" -alias fh-upload `
  -keyalg RSA -keysize 4096 -validity 10000
```

It asks for a password and your name. Keep the `.jks` file and its password somewhere safe outside this repository (a password manager, plus a copy of the file). Never commit it.

Then tell Gradle where it is: create or edit `C:\Users\<you>\.gradle\gradle.properties` and add:

```properties
FH_UPLOAD_STORE_FILE=C:/Users/<you>/fh-upload-key.jks
FH_UPLOAD_STORE_PASSWORD=the password
FH_UPLOAD_KEY_ALIAS=fh-upload
FH_UPLOAD_KEY_PASSWORD=the password
```

## 2. Build the bundles

```sh
pnpm release:android          # the first time
pnpm release:android --bump   # every time after: Google Play needs a new build number for each upload
```

This builds both bundles into `dist/play/`. To build one app on its own, use `pnpm release:phone` or `pnpm release:watch` (with the same options). Add `--apk` for installable APKs as well, e.g. to put a build straight on a watch with `adb install`. The APKs are the GitHub builds, which may install apps (their own updates); the bundles never ask for that, as Google Play doesn't allow it. Release both apps from the same build number, so testers' phones and watches match. The version name and build number live in `version.json`. The phone's version code is the build number; the watch's is 1,000,000 higher, because version codes must be unique across the listing.

## 3. Set up the app in Play Console (once)

1. **Create app:** name *FH Match Centre*, default language English (United Kingdom), App, Free.

   The package name isn't typed in anywhere: Play takes it from the first bundle uploaded, and it can never be changed afterwards. Upload the phone bundle to internal testing (step 4) before filling in everything below, then check the app's package reads `com.fhmatchcentre.app`. An app that has never been published can be deleted, which is the way out of a wrong one.
2. **App content** (Policy and programs → App content), answer each section:
   - **Privacy policy:** a public web page is required. [privacy-policy.md](privacy-policy.md) is the policy (for the beta and on), and the landing page serves a copy of it at `/privacy` (see [landing/README.md](../landing/README.md)): deploy that and paste the link, e.g. `https://<your landing address>/privacy`.
   - **App access:** from 1.0 some of it needs an account, so *All or some functionality is restricted*. Give reviewers the email and password of an account you've registered and verified for them, and say that recording a match on the watch and reviewing it on the phone need no sign-in, while uploading, publishing and sharing do.
   - **Ads:** no ads.
   - **Content rating:** fill in the questionnaire (a utility/sports app with no user-generated content shared with others).
   - **Target audience:** 18 and over. The app is for match officials; choosing younger ages brings Families policy requirements.
   - **Data safety:** the alpha collected nothing. From 1.0 it does, so answer for what the server actually holds, and keep it saying the same as [privacy-policy.md](privacy-policy.md):
     - **Personal info:** name and email address — collected, stored, required, for account management. Not shared with anyone, and not used for advertising or analytics.
     - **App activity / user-generated content:** the matches an umpire uploads (teams, scores, cards, timings, shirt numbers, umpire names). Optional: nothing is uploaded until they ask for it, and nothing is public until they publish it.
     - **Device or other IDs:** the push token, for notifications, if they turn them on.
     - Everything travels over HTTPS, and an account can be deleted from the account page on the website (or by email).
     - Retention, as the policy states: request logs (with IP addresses) 30 days, answered test and club requests 12 months, backups 14 days.
     - Health and fitness data isn't collected in Play's sense — see the health declarations below.
   - **Health apps:** the watch reads heart rate and steps (Health Services) while **Record workout** is on, and the phone writes workouts to Health Connect (exercise, steps, distance, total calories, heart rate; write-only). Complete the Health apps declaration and the Health Connect permissions declaration, giving *fitness tracking of the umpire's own workouts during matches* as the use. Data safety: health and fitness data is processed on the user's devices only and not collected, since nothing leaves them except to Health Connect on the same phone. It is never part of an uploaded match.
   - **Foreground service permissions:** the watch app uses a special-use foreground service to keep the match clock, suspension timers and alerts running with the screen off. Describe that, and give a link to a short screen recording of a match running on the watch. With Record workout on, the same service is also a health foreground service: it keeps the workout recording for the length of the match.
3. **Add Wear OS:** Test and release → Advanced settings → Form factors → Add form factor → Wear OS. This creates separate Wear OS release tracks. The Wear OS app is reviewed against the [Wear OS app quality guidelines](https://developer.android.com/docs/quality-guidelines/wear-app-quality).
4. **Store listing** (Grow users → Store presence → Main store listing): short and full description, a 512×512 icon, a 1024×500 feature graphic, at least two phone screenshots, and Wear OS screenshots (one of each match page: Timing, Cards and Goals show it best).

   `pnpm screenshots <name>` takes one from every connected device at once, naming each by what the device says it is, and checks it against what Play accepts: 320-3840px a side and 16:9 or taller for a phone, square and at least 384px for a watch. They land in `dist/screens/`.

   ```sh
   pnpm screenshots --list       # what's connected
   pnpm screenshots timing       # phone-timing.png and watch-timing.png
   pnpm screenshots goals --watch
   ```

   The phone needs USB debugging and the cable; the watch needs wireless debugging and `adb connect <address>` (the same setup as installing its APK). Set a match up first: the empty screens make a poor listing.

## 4. Internal testing

Internal testing reaches up to 100 testers you choose, and releases are usually available within minutes, without a full review.

1. Test and release → Testing → **Internal testing** → Testers: create an email list of your testers (the Google accounts they use on their phones). The landing page's "Join the testing" form collects exactly that from umpires who ask.
2. Create a release and upload the phone bundle (`fh-match-centre-phone-….aab`).
3. Switch the form factor at the top of the page to **Wear OS**, open its Internal testing track, create a release and upload the watch bundle (`fh-match-centre-watch-….aab`).
4. Copy the opt-in link from the Testers tab and send it to the testers. They accept, then install the phone app from Google Play; the watch app installs from the Play Store on the watch (or from the phone's Play Store, under the watch's device).

For every update: `pnpm release:android --bump --beta`, then upload both bundles to their internal testing tracks (or do it from the command line, below). Keep the two in step, so testers never have a phone and watch from different builds.

## 5. Uploading from the command line

`pnpm release:play` ([scripts/play-upload.mjs](../scripts/play-upload.mjs)) uploads both bundles from `dist/play/` and releases them to a testing track: the phone bundle to the phone track, the watch bundle to the Wear OS one (e.g. `wear:internal`). The release notes are the features and fixes from the GitHub release notes, cut to Play's 500 characters.

| Command | Track |
| --- | --- |
| `pnpm release:play --beta` | Internal testing, with the beta's phone bundle: **the one to use now** |
| `pnpm release:play` | Internal testing, with the alpha's phone bundle |
| `pnpm release:play --track closed --beta` | Closed testing, for the 14-day test before 1.0 |
| `pnpm release:play --track open` | Open testing |

`--beta` has to match the bundle you built: it picks which phone bundle to upload, and the watch bundle is the same either way. Leave it off when the phone bundle was built without it. If the other one is the one on disk, the script says so and stops rather than uploading the wrong stage.

Add `--dry-run` to upload and check everything without releasing anything, or `--draft` to leave the releases as drafts to roll out in Play Console.

The release notes come from `dist/play/release-notes-<tag>.md`, which `pnpm release:github` writes: the pre-release's notes for a build off `dev`, and the full release's for one off `main`. Without them, testers just get "Build <n>." and the script says so before it uploads.

**Once, before the first upload:**

1. Upload the very first bundles by hand (step 4). Google Play only accepts uploads through its API for an app that already has one. Until the app has been published on a track, uploads must be drafts: add `--draft`.
2. In [Google Cloud Console](https://console.cloud.google.com), create a project (any name), and under **APIs & Services → Library** enable the **Google Play Android Developer API**.
3. Under **IAM & Admin → Service accounts**, create a service account (e.g. `play-upload`). Open it, then **Keys → Add key → JSON**. Save the file as `C:\Users\<you>\.fh\play-service-account.json`, outside the repository (or anywhere, with `FH_PLAY_KEY` set to its path). Keep it private: it can release the app.
4. In [Play Console](https://play.google.com/console), **Users and permissions → Invite new users**: the service account's email address, with **FH Match Centre** added under **App permissions** and **Release to testing tracks** ticked (and **Release to production** later, if you want that from the command line too).

It can take up to a day before a new service account's access works; until then Play answers that it doesn't have permission.

## Later: production

Google requires new personal developer accounts to run a **closed test with at least 12 testers for 14 days** before the app can go to production. Do it with the 1.0 build before release: move from internal testing to a closed testing track (`pnpm release:play --track closed --beta`).
