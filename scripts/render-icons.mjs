#!/usr/bin/env node
// Renders the phone app's icons from mobile/assets/icon-source.svg, using the Chromium the API
// already has for PDF reports (npx playwright-core install --only-shell chromium):
//
//   node scripts/render-icons.mjs
//
// mobile/assets/
//   icon.png                  1024², artwork on green: the app icon and iOS
//   adaptive-icon.png         1024², artwork only (transparent): Android's adaptive icon foreground
//   adaptive-monochrome.png   the same, for Android 13+ themed icons
// dist/screens/
//   play-icon-512.png         512², on green and with no transparency: Google Play's store icon,
//                             which it wants at exactly that size and under 1 MB
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "mobile", "assets");
/** Where the store listing's files are gathered, with the screenshots. */
const STORE = join(ROOT, "dist", "screens");
/** The website's primary green (web/src/app/globals.css). */
export const ICON_BACKGROUND = "#106C3E";

const svg = readFileSync(join(ASSETS, "icon-source.svg"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const page = (background, size) => `<html><body style="margin:0;background:${background}">
  <div style="width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</div></body></html>`;

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  mkdirSync(STORE, { recursive: true });
  for (const [dir, file, background, size] of [
    [ASSETS, "icon.png", ICON_BACKGROUND, 1024],
    [ASSETS, "adaptive-icon.png", "transparent", 1024],
    [ASSETS, "adaptive-monochrome.png", "transparent", 1024],
    // Drawn at 512 rather than shrunk from 1024, so the edges stay crisp.
    [STORE, "play-icon-512.png", ICON_BACKGROUND, 512],
  ]) {
    await tab.setViewportSize({ width: size, height: size });
    await tab.setContent(page(background, size));
    await tab.screenshot({ path: join(dir, file), omitBackground: background === "transparent" });
    console.log(`wrote ${dir === ASSETS ? "mobile/assets" : "dist/screens"}/${file}`);
  }
} finally {
  await browser.close();
}
