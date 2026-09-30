#!/usr/bin/env node
// Builds the documentation site into docs-site/dist: this folder's pages, plus the technical
// documents from docs/ (so they're written once), with their links to the rest of the
// repository pointed at GitHub. No dependencies: docsify renders the Markdown in the browser.
//
//   node docs-site/build.mjs           build (Vercel runs this)
//   node docs-site/build.mjs --serve   build, then serve it at http://localhost:3003

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, posix } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SITE, "..");
const OUT = join(SITE, "dist");
const GITHUB = "https://github.com/KingCharlesVI/fh-watch/blob/main";

/** Documents in docs/ published under technical/, by file name. */
const IMPORTED = ["design.md", "deployment.md", "releasing.md", "play-store.md", "privacy-policy.md"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const entry of readdirSync(SITE)) {
  if (["dist", "build.mjs", "vercel.json", "node_modules"].includes(entry)) continue;
  cpSync(join(SITE, entry), join(OUT, entry), { recursive: true });
}
cpSync(join(ROOT, "landing", "src", "app", "icon.png"), join(OUT, "assets", "icon.png"));

/**
 * Rewrites a copied document's relative links: to another imported document, it stays a
 * docs page; to anything else in the repository, it goes to GitHub.
 */
function rewriteLinks(markdown) {
  return markdown.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_, target) => {
    const [path, anchor] = target.split("#");
    const resolved = posix.normalize(posix.join("docs", path));
    const name = posix.basename(resolved);
    // docsify links to a heading as page.md?id=heading.
    if (resolved.startsWith("docs/") && IMPORTED.includes(name)) return `](technical/${name}${anchor ? `?id=${anchor}` : ""})`;
    return `](${GITHUB}/${resolved}${anchor ? `#${anchor}` : ""})`;
  });
}

mkdirSync(join(OUT, "technical"), { recursive: true });
for (const name of IMPORTED) {
  const text = readFileSync(join(ROOT, "docs", name), "utf8");
  const note = `> This page is [docs/${name}](${GITHUB}/docs/${name}) in the repository.\n\n`;
  writeFileSync(join(OUT, "technical", name), note + rewriteLinks(text));
}
console.log(`Built the docs into ${OUT}`);

if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html", ".md": "text/markdown", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };
  createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(OUT, path || "index.html");
    if (!file.startsWith(OUT) || !existsSync(file)) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  }).listen(3003, () => console.log("Serving the docs at http://localhost:3003 (Ctrl+C stops it)"));
}
