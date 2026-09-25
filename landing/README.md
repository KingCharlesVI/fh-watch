# Landing page

The project's public front page: what FH Match Centre is, the roadmap, and download links for the alpha, beta and public release. It's separate from the main website (`web/`), which runs on your own server; this one is a static site for Vercel.

Also serves the app's privacy policy at `/privacy`, the public address Google Play asks for.

## Editing

Almost everything that changes lives in [`src/content.ts`](src/content.ts):

- `CURRENT_STAGE`: which stage is open (`alpha`, `beta` or `release`). It's highlighted on the page.
- `DOWNLOADS`: each stage's links. A link left as `null` shows as "Coming soon". For the alpha, paste the Google Play internal testing link (Play Console → Internal testing → Testers → "Join on Android"), and the public URLs of the phone and watch APKs (build them with `pnpm release:android --apk`, see the main README). Set each APK's `detail` too, e.g. `"0.2.0 · 112 MB"`, and update both for every new build. With APK links set, the card shows install steps (in `ApkInstructions`, `src/components/parts.tsx`).
- `SITE.contactEmail`: where "Ask to join" and the privacy policy's contact point to. Set it before sharing the page.
- `ROADMAP`: the stages and what each brings.

The screenshots are in `public/screens/`, taken from the apps on the emulators. The privacy policy text is `src/app/privacy/page.tsx`; keep it the same as `docs/privacy-policy.md`.

```sh
pnpm --filter @fh/landing dev     # http://localhost:3002
pnpm --filter @fh/landing build   # the static site, in landing/out
```

## Deploying on Vercel (once)

1. In Vercel, **Add New → Project**, and import the GitHub repository.
2. Set **Root Directory** to `landing`, and leave **Framework Preset** as Next.js and **Output Directory** empty (the default). Vercel picks up the rest from `landing/vercel.json`, which installs only this site's packages. Vercel handles the static export (`output: "export"` in `next.config.ts`) itself: setting the output directory to `out` makes the deploy fail with "routes-manifest.json couldn't be found".
3. Deploy. Every push to `main` then redeploys it.
4. **Domain** (optional): in the project's Settings → Domains, add the address you want. Your domain's DNS is on Cloudflare (see docs/deployment.md), so add the record Vercel shows there, set to **DNS only** (grey cloud). If the main website will later take `fhmatchcentre.com`, a subdomain such as `www` or `about` keeps the two apart; or give the landing page the main domain now and move the website to `app.fhmatchcentre.com` for the beta.
