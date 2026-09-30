# Publishing on Google Play

FH Match Centre is one Play listing (package `com.fhmatchcentre.app`) with two app bundles: the phone app and the Wear OS app. Both are built by one command and signed with the same upload key. The Wearable Data Layer only connects a watch app and phone app signed with the same key, so testers must install both from Google Play, not mix Play installs with development builds.

## The stages

| Stage | Phone app | Needs |
| --- | --- | --- |
| **Alpha** (now) | Watch and phone only. No account and nothing sent anywhere: matches are saved on the phone and exported as PDF, CSV or JSON files, or backed up in one file. | Just this guide. |
| **Beta** | Adds sign-in, uploading (only when the umpire taps Upload), publishing and share links. | The server running (see [deployment.md](deployment.md)), and updated Data safety answers. |

The stage is baked into the phone app when it's built (`EXPO_PUBLIC_STAGE`, see `mobile/src/config.ts`). `pnpm release:android` builds the alpha; `pnpm release:android --beta` builds the beta. The watch app is the same for both.

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

This builds both bundles into `dist/play/`. To build one app on its own, use `pnpm release:phone` or `pnpm release:watch` (with the same options). Add `--apk` for installable APKs as well, e.g. to put a build straight on a watch with `adb install`. Release both apps from the same build number, so testers' phones and watches match. The version name and build number live in `version.json`. The phone's version code is the build number; the watch's is 1,000,000 higher, because version codes must be unique across the listing.

## 3. Set up the app in Play Console (once)

1. **Create app:** name *FH Match Centre*, default language English (United Kingdom), App, Free.
2. **App content** (Policy and programs → App content), answer each section:
   - **Privacy policy:** a public web page is required. [privacy-policy.md](privacy-policy.md) is the alpha's policy, and the landing page serves it at `/privacy` (see [landing/README.md](../landing/README.md)): deploy that and paste the link, e.g. `https://<your landing address>/privacy`.
   - **App access:** all functionality is available without special access (the alpha has no sign-in).
   - **Ads:** no ads.
   - **Content rating:** fill in the questionnaire (a utility/sports app with no user-generated content shared with others).
   - **Target audience:** 18 and over. The app is for match officials; choosing younger ages brings Families policy requirements.
   - **Data safety:** for the alpha, *no data collected* and *no data shared*. Matches stay on the device; the watch-to-phone transfer is between the user's own devices, and exports happen only when the user chooses. **Update this before the beta**, which collects account details (name, email) and uploads matches.
   - **Health apps:** the watch reads heart rate and steps (Health Services) while **Record workout** is on, and the phone writes workouts to Health Connect (exercise, steps, distance, total calories, heart rate; write-only). Complete the Health apps declaration and the Health Connect permissions declaration, giving *fitness tracking of the umpire's own workouts during matches* as the use. Data safety: health and fitness data is processed on the user's devices only and not collected, since nothing leaves them except to Health Connect on the same phone.
   - **Foreground service permissions:** the watch app uses a special-use foreground service to keep the match clock, suspension timers and alerts running with the screen off. Describe that, and give a link to a short screen recording of a match running on the watch. With Record workout on, the same service is also a health foreground service: it keeps the workout recording for the length of the match.
3. **Add Wear OS:** Test and release → Advanced settings → Form factors → Add form factor → Wear OS. This creates separate Wear OS release tracks. The Wear OS app is reviewed against the [Wear OS app quality guidelines](https://developer.android.com/docs/quality-guidelines/wear-app-quality).
4. **Store listing** (Grow users → Store presence → Main store listing): short and full description, a 512×512 icon, a 1024×500 feature graphic, at least two phone screenshots, and Wear OS screenshots (one of each match page: Timing, Cards and Goals show it best).

## 4. Internal testing: the alpha

Internal testing reaches up to 100 testers you choose, and releases are usually available within minutes, without a full review.

1. Test and release → Testing → **Internal testing** → Testers: create an email list of your alpha umpires (the Google accounts they use on their phones).
2. Create a release and upload the phone bundle (`fh-match-centre-phone-….aab`).
3. Switch the form factor at the top of the page to **Wear OS**, open its Internal testing track, create a release and upload the watch bundle (`fh-match-centre-watch-….aab`).
4. Copy the opt-in link from the Testers tab and send it to the testers. They accept, then install the phone app from Google Play; the watch app installs from the Play Store on the watch (or from the phone's Play Store, under the watch's device).

For every update: `pnpm release:android --bump`, then upload both bundles to their internal testing tracks. Keep the two in step, so testers never have a phone and watch from different builds.

## Later: production

Google requires new personal developer accounts to run a **closed test with at least 12 testers for 14 days** before the app can go to production. The beta is a good time for that: move from internal testing to a closed testing track with the beta build.
