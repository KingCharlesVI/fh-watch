# Releasing: quick reference

The commands for a new build, in order. The README has the details ([Publishing a GitHub release](../README.md#publishing-a-github-release), [iPhone builds](../README.md#iphone-builds-testflight)).

Every app uses the version and build in `version.json`: the Android phone and Wear OS apps (GitHub release APKs) and the iPhone app with the Apple Watch app inside (TestFlight). Every release needs a new build number, on both platforms.

## Once, on a new PC

```powershell
winget install GitHub.cli      # then open a new terminal
gh auth login                  # GitHub, for the release
cd mobile; npx eas-cli login   # Expo, for the iPhone build
# Google Play: a service account key, see play-store.md step 5
```

git-cliff (for the changelog) is needed too: `cargo install git-cliff`, or `winget install orhun.git-cliff`.

## A test release (from `dev`)

Replace `18` with the next build number, and `1.1.2` with the version in `version.json`. Test builds are beta builds (the phone app with accounts and the website), so the commands carry `--beta` and the tags say `beta`.

**1. Bump the build.** In `version.json`, set `"build"` to one more than the last release:

```json
{ "version": "1.1.2", "build": 18 }
```

**2. Add the changelog entry.** It lists the commits since the last release. To see it first, without changing anything:

```powershell
git-cliff --unreleased --tag v1.1.2-beta.18 -o -
```

Then add it to the top of `CHANGELOG.md`:

```powershell
git-cliff --unreleased --tag v1.1.2-beta.18 --prepend CHANGELOG.md -o -
```

Always keep the `-o -`. `cliff.toml` names `CHANGELOG.md` as git-cliff's output, so without it git-cliff rewrites the whole file (and with `--unreleased`, down to just the new entry). If that happens, `git checkout -- CHANGELOG.md` puts it back.

**3. Commit and push:**

```powershell
git add version.json CHANGELOG.md
git commit -m "chore(release): prepare for v1.1.2-beta.18"
git push
```

(Commits named `chore(release): prepare for …` are left out of the notes.)

**4. Android: build the APKs and publish the GitHub release:**

```powershell
pnpm release:github --beta
```

This makes the pre-release `v1.1.2-beta.18`, with the phone and watch APKs and the same notes. Add `--dry-run` to build and see the notes without publishing. (Without `--beta` it builds the alpha's phone app, with no accounts, and the tag says `alpha`.)

**5. Google Play: upload the same build to internal testing** (needs the one-time setup in [play-store.md](play-store.md#5-uploading-from-the-command-line)):

```powershell
pnpm release:play --beta
```

It uploads the bundles step 4 built alongside the APKs (in `dist/play/`), so there's nothing to build. Add `--dry-run` to check without releasing.

**6. iPhone and Apple Watch: build and send to TestFlight:**

```powershell
pnpm release:ios
```

Run it in your own terminal: it can ask you to log in to Apple. It builds in Expo's cloud (10 to 20 minutes), uploads to App Store Connect, and reaches TestFlight after Apple's processing (another 10 to 30 minutes).

## Versions

| Where | Tag | For |
| --- | --- | --- |
| `dev` | `v1.1.2-beta.18`: version, stage, build | Test builds (pre-releases) |
| `main` | `v1.1.0` (`v0.4.0-alpha` and the like before 1.0.0) | A version that's been tested: marked Latest on GitHub |

The project is in its **beta**: invited testers, with accounts, uploads, the website and the Apple apps. Test builds are `v<version>-beta.<build>`, built with `--beta` (the build switch for accounts and uploads). A fix gets the next patch version (1.1.1 → 1.1.2) and new features the next minor one (1.1 → 1.2). Every build, on either branch, gets a new build number.

## A full release (from `main`)

When a test release from `dev` has been tried and is good:

1. Merge `dev` into `main` on GitHub (a pull request), then `git checkout main` and `git pull`.
2. `pnpm release:github --beta --skip-build`. This makes `v1.1.2`, marked Latest, from the APKs of the test release you tried (they're in `dist/play/`; leave out `--skip-build` to build them again). Its notes cover everything since the last full release.
3. The iPhone build is already in TestFlight: nothing to do.
4. `git checkout dev`. For a fix after a release, set `"version"` in `version.json` to the next patch (e.g. `1.1.3`), bump the build, and carry on with a test release.

## If something fails

| Problem | What to do |
| --- | --- |
| `pnpm release:github` says the tag already exists | That build number was used: bump it again (step 1). |
| It says there are uncommitted or unpushed changes | Commit and `git push`, then run it again. |
| App Store Connect refuses the build number | It has seen that build for this version: bump it, commit, push, `pnpm release:ios` again. Android can skip that number. |
| The iPhone build fails | Send Claude the build ID from the output; it can read the log. |
