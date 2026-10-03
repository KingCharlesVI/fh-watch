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

Replace `9` with the next build number, and `0.4.0` with the version in `version.json`.

**1. Bump the build.** In `version.json`, set `"build"` to one more than the last release:

```json
{ "version": "0.4.0", "build": 9 }
```

**2. Add the changelog entry.** It lists the commits since the last release. To see it first, without changing anything:

```powershell
git-cliff --unreleased --tag v0.4.0-alpha.9 -o -
```

Then add it to the top of `CHANGELOG.md`:

```powershell
git-cliff --unreleased --tag v0.4.0-alpha.9 --prepend CHANGELOG.md -o -
```

Always keep the `-o -`. `cliff.toml` names `CHANGELOG.md` as git-cliff's output, so without it git-cliff rewrites the whole file (and with `--unreleased`, down to just the new entry). If that happens, `git checkout -- CHANGELOG.md` puts it back.

**3. Commit and push:**

```powershell
git add version.json CHANGELOG.md
git commit -m "chore(release): prepare for v0.4.0-alpha.9"
git push
```

(Commits named `chore(release): prepare for …` are left out of the notes.)

**4. Android: build the APKs and publish the GitHub release:**

```powershell
pnpm release:github
```

This makes the pre-release `v0.4.0-alpha.9`, with the phone and watch APKs and the same notes. Add `--dry-run` to build and see the notes without publishing.

**5. Google Play: upload the same build to internal testing** (needs the one-time setup in [play-store.md](play-store.md#5-uploading-from-the-command-line)):

```powershell
pnpm release:play
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
| `dev` | `v0.4.1-alpha.10`: version, stage, build | Test builds (pre-releases) |
| `main` | `v0.4.0-alpha` before 1.0.0; `v1.0.0` from then on | A version that's been tested: marked Latest on GitHub |

`dev` is working towards **1.0.0**, the public release, with no public beta in between: accounts, uploads, the website and the Apple apps included. Test builds until then are `v1.0.0-alpha.<build>`, then `v1.0.0-beta.<build>` once the phone app is built with `--beta` (the build switch for accounts and uploads). From 1.0.0, a fix gets the next patch version (1.0.0 → 1.0.1) and new features the next minor one (1.0 → 1.1). Every build, on either branch, gets a new build number.

## A full release (from `main`)

When a test release from `dev` has been tried and is good:

1. Merge `dev` into `main` on GitHub (a pull request), then `git checkout main` and `git pull`.
2. `pnpm release:github --skip-build`. This makes `v0.4.0-alpha`, marked Latest, from the APKs of the test release you tried (they're in `dist/play/`; leave out `--skip-build` to build them again). Its notes cover everything since the last full release.
3. The iPhone build is already in TestFlight: nothing to do.
4. `git checkout dev`. For a fix after a release, set `"version"` in `version.json` to the next patch (e.g. `1.0.1`), bump the build, and carry on with a test release.

## If something fails

| Problem | What to do |
| --- | --- |
| `pnpm release:github` says the tag already exists | That build number was used: bump it again (step 1). |
| It says there are uncommitted or unpushed changes | Commit and `git push`, then run it again. |
| App Store Connect refuses the build number | It has seen that build for this version: bump it, commit, push, `pnpm release:ios` again. Android can skip that number. |
| The iPhone build fails | Send Claude the build ID from the output; it can read the log. |
