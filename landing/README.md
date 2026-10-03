# Landing page

The project's public front page: what FH Match Centre is, which stage it's in, and download links for the alpha, beta and public release. It's separate from the main website (`web/`), which runs on your own server; this one is a static site for Vercel.

Also serves the app's privacy policy at `/privacy`, the public address Google Play asks for, and support at `/support`: how to report a problem, where the guides are, and where the work is tracked.

`/changelog` is the repository's own `CHANGELOG.md`, read and parsed when the site is built (`src/changelog.ts`), so a release that updates it updates the page on the next deploy. Nothing to edit, and if the file can't be read the page points at the GitHub releases instead.

## Editing

Almost everything that changes lives in [`src/content.ts`](src/content.ts):

- `CURRENT_STAGE`: which stage is open (`alpha`, `beta` or `release`). One line, and the stepper, the hero badge and the download cards all follow it: finished stages get a tick and drop out of the download section, and the current one is highlighted.
- `DOWNLOADS`: each stage's links. A link left as `null` shows as "Coming soon". For the alpha, paste the Google Play internal testing link (Play Console → Internal testing → Testers → "Join on Android"). The APK buttons (`latest: "phone"` / `"watch"`) need no editing: when the page opens, they look up the newest release of `SITE.githubRepo` on GitHub, pre-releases included, and link to its APKs with the version and size beside them (`src/components/LatestApk.tsx`). So publishing a release with `pnpm release:github` (see the main README) updates them, without redeploying this site. The repository must be public for visitors to download them; until the lookup finishes, or if GitHub can't be reached, the buttons open the releases page. An APK link can also be a fixed URL instead: set `href` and `detail` and leave out `latest`. With APK links, the card shows install steps (in `ApkInstructions`, `src/components/parts.tsx`).
- `SITE.contactEmail`: where "Ask to join" and the privacy policy's contact point to. Set it before sharing the page.
- `TESTIMONIALS`: what umpires say. Only real quotes, with their permission and however they want to be credited; while it's empty the page says the testing is private rather than showing anything invented.
- `FAQS`: the questions on the page, which also become its `FAQPage` structured data for search engines.
- `PROJECT_BOARD_URL`: the repository's Projects tab by default. Point it at one board instead if you'd rather link straight to it.

The screenshots are in `public/screens/`, taken from the apps on the emulators. The privacy policy text is `src/app/privacy/page.tsx`; keep it the same as `docs/privacy-policy.md`.

```sh
pnpm --filter @fh/landing dev     # http://localhost:3002
pnpm --filter @fh/landing build   # the static site, in landing/out
```

## Deploying on Vercel (once)

1. In Vercel, **Add New → Project**, and import the GitHub repository.
2. Set **Root Directory** to `landing`, and leave **Framework Preset** as Next.js and **Output Directory** empty (the default). Vercel picks up the rest from `landing/vercel.json`, which installs only this site's packages. Vercel handles the static export (`output: "export"` in `next.config.ts`) itself: setting the output directory to `out` makes the deploy fail with "routes-manifest.json couldn't be found".
3. Deploy. Every push to `main` then redeploys it.
4. **Domain:** in the project's Settings → Domains, add `fhmatchcentre.com` (and `www.fhmatchcentre.com`, redirecting to it). The DNS is on Cloudflare (see docs/deployment.md): add the records Vercel shows there, set to **DNS only** (grey cloud). The other sites have their own subdomains: the website `app.fhmatchcentre.com` (from the beta) and the docs `docs.fhmatchcentre.com` (a second Vercel project, see [docs-site/README.md](../docs-site/README.md)). The landing page links to both, set in `SITE` in `src/content.ts`.
