#!/usr/bin/env node
// Renders the phone app's icons from mobile/assets/icon-source.svg, using the Chromium the API
// already has for PDF reports (npx playwright-core install --only-shell chromium):
//
//   node scripts/render-icons.mjs
//
// icon.png                  1024², artwork on green: the store listing and iOS
// adaptive-icon.png         1024², artwork only (transparent): Android's adaptive icon foreground
// adaptive-monochrome.png   the same, for Android 13+ themed icons
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "mobile", "assets");
/** The website's primary green (web/src/app/globals.css). */
export const ICON_BACKGROUND = "#106C3E";

const svg = readFileSync(join(ASSETS, "icon-source.svg"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const page = (background) => `<html><body style="margin:0;background:${background}">
  <div style="width:1024px;height:1024px">${svg.replace("<svg ", '<svg width="1024" height="1024" ')}</div></body></html>`;

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const [file, background] of [
    ["icon.png", ICON_BACKGROUND],
    ["adaptive-icon.png", "transparent"],
    ["adaptive-monochrome.png", "transparent"],
  ]) {
    await tab.setContent(page(background));
    await tab.screenshot({ path: join(ASSETS, file), omitBackground: background === "transparent" });
    console.log(`wrote mobile/assets/${file}`);
  }
} finally {
  await browser.close();
}
