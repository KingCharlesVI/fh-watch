# Blog posts

Each `.md` file here is a post on the landing page's blog (`/blog`), built into the site when it deploys, so pushing a new file to `main` publishes it. This README isn't a post.

The file name is the post's address: `first-match.md` becomes `/blog/first-match`. Keep it short, lower case, with hyphens, and don't rename it once it's out: links to it would break.

Start each post with its front matter:

```md
---
title: Our first match on the watch
date: 2026-10-23
summary: One or two sentences, shown in the list of posts and to search engines.
author: The FH Match Centre team
---

The post itself, in Markdown.
```

- `title` and `date` (`YYYY-MM-DD`) are needed; the build stops with a message if either is missing.
- `summary` and `author` are optional.
- `draft: true` keeps a post out of the site until you remove it.

Posts are listed newest first; the three newest also appear on the front page.

The body is ordinary Markdown: headings (start at `##`, the title is the `#`), links, lists, quotes, code, tables and images. Put images in `landing/public/blog/` and link them as `/blog/your-image.png`.

`src/blog.ts` reads the files; `src/app/blog/` shows them.
