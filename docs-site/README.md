# Documentation site

The user guide and technical documentation at **docs.fhmatchcentre.com**, built with [docsify](https://docsify.js.org): Markdown pages rendered in the browser, with no build tools or dependencies.

| File | |
| --- | --- |
| `index.html` | docsify and its settings and plugins: search, copy code, pagination, Mermaid diagrams, [edit on GitHub](https://github.com/njleonzhang/docsify-edit-on-github) (pages copied from `docs/` link to their files there) and the [sidebar footer](https://github.com/markbattistella/docsify-sidebar-footer) |
| `assets/github.css` | The [GitHub theme](https://github.com/w3teal/docsify-theme-github), kept here as its README advises |
| `assets/github-dark.css` | That theme in GitHub's dark colours: the site is always dark |
| `assets/theme.css` | The logo, table layout and footer spacing |
| `home.md` | The front page |
| `_sidebar.md`, `_navbar.md` | The sidebar, and the links to the other sites at the top |
| `guide/` | The user guide |
| `technical/` | The technical pages written for the site |
| `build.mjs` | Copies the site to `dist/`, adding the documents from `docs/` (design, releasing, Google Play, deployment, privacy policy) under `technical/`, with their links into the repository pointed at GitHub |

So those five documents are written once: edit them in `docs/`, not here.

```sh
node docs-site/build.mjs --serve   # build, then http://localhost:3003
```

## Deploying on Vercel (once)

1. In Vercel, **Add New → Project**, and import the same `fh-watch` repository again. Vercel allows several projects from one repository, each with its own root directory: this is a second one, beside the landing page's.
2. Set **Root Directory** to `docs-site`. Leave everything else: `docs-site/vercel.json` sets the build (`node build.mjs`, nothing to install) and the output (`dist`).
3. Deploy. Every push to `main` redeploys it, unless nothing it uses changed: `ignoreCommand` in `vercel.json` skips the build when `docs-site/`, `docs/` and the icon are the same as in the commit before.
4. **Domain:** Settings → Domains → add `docs.fhmatchcentre.com`. In Cloudflare, add the CNAME record Vercel shows, set to **DNS only** (grey cloud).

The build reads `../docs` and `../landing` (for the icon), which Vercel has because it clones the whole repository.

## The other sites

| | |
| --- | --- |
| `fhmatchcentre.com` | The landing page (`landing/`) |
| `app.fhmatchcentre.com` | The website and API (`web/`, `api/`) |
| `docs.fhmatchcentre.com` | This |

Each links to the others: here in `_navbar.md` and `home.md`, on the landing page through `SITE` in `landing/src/content.ts`, and on the website through `web/src/lib/site.ts`.
