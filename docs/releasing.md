# Releasing: quick reference

The commands for a new build, in order. The README has the details ([Publishing a GitHub release](../README.md#publishing-a-github-release), [iPhone builds](../README.md#iphone-builds-testflight)).

Every app uses the version and build in `version.json`: the Android phone and Wear OS apps (GitHub release APKs) and the iPhone app with the Apple Watch app inside (TestFlight). Every release needs a new build number, on both platforms.

## Once, on a new PC

```powershell
winget install GitHub.cli      # then open a new terminal
gh auth login                  # GitHub, for the release
cd mobile; npx eas-cli login   # Expo, for the iPhone build
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

**5. iPhone and Apple Watch: build and send to TestFlight:**

```powershell
pnpm release:ios
```

Run it in your own terminal: it can ask you to log in to Apple. It builds in Expo's cloud (10 to 20 minutes), uploads to App Store Connect, and reaches TestFlight after Apple's processing (another 10 to 30 minutes).

## A full release (from `main`)

When a test release has been tried and is good:

1. Merge `dev` into `main` on GitHub, then `git checkout main` and `git pull`.
2. `pnpm release:github`. This makes `v0.4.0`, marked Latest, from the same build. Nothing to bump, and the changelog already has it.
3. The iPhone build is already in TestFlight: nothing to do.
4. Back on `dev`, start the next version: set `"version"` in `version.json` (e.g. `0.5.0`) and commit `chore: start 0.5.0`.

## If something fails

| Problem | What to do |
| --- | --- |
| `pnpm release:github` says the tag already exists | That build number was used: bump it again (step 1). |
| It says there are uncommitted or unpushed changes | Commit and `git push`, then run it again. |
| App Store Connect refuses the build number | It has seen that build for this version: bump it, commit, push, `pnpm release:ios` again. Android can skip that number. |
| The iPhone build fails | Send Claude the build ID from the output; it can read the log. |
