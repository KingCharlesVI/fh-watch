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
//   play-feature-graphic.png  1024x500, the banner at the top of the Play listing
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

/** Geist from the repo, embedded, so the banner renders the same wherever it's built. */
const font = (file, weight) =>
  `@font-face{font-family:Geist;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(join(ASSETS, "fonts", file)).toString("base64")})}`;

/**
 * The feature graphic: the artwork and the name on the brand green. Everything stays
 * well inside the edges, because Play crops this one on some screens.
 */
const banner = () => `<html><head><style>
  ${font("Geist_600SemiBold.ttf", 600)}
  ${font("Geist_400Regular.ttf", 400)}
</style></head><body style="margin:0">
  <div style="width:1024px;height:500px;box-sizing:border-box;padding:0 72px;background:${ICON_BACKGROUND};
              display:flex;align-items:center;justify-content:center;gap:52px;font-family:Geist;color:#fff">
    <div style="flex:none;width:236px;height:236px">${svg.replace("<svg ", '<svg width="236" height="236" ')}</div>
    <div>
      <div style="font-weight:600;font-size:62px;letter-spacing:-0.03em;line-height:1;white-space:nowrap">FH Match Centre</div>
      <div style="margin-top:20px;font-weight:400;font-size:30px;line-height:1.35;color:rgba(255,255,255,0.82)">
        Umpire from your wrist.<br />The match writes itself.
      </div>
    </div>
  </div></body></html>`;
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

  await tab.setViewportSize({ width: 1024, height: 500 });
  await tab.setContent(banner());
  // Fonts are embedded, but give the layout a moment to settle before the shot.
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(STORE, "play-feature-graphic.png") });
  console.log("wrote dist/screens/play-feature-graphic.png");
} finally {
  await browser.close();
}
