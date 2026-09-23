import type { Browser } from "playwright-core";

export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
  close(): Promise<void>;
}

/**
 * Prints HTML to PDF with headless Chromium. The browser starts on first use
 * and is reused; each render gets its own page. Install Chromium with
 * `npx playwright-core install --only-shell chromium`.
 */
export function chromiumPdfRenderer(): PdfRenderer {
  let browser: Promise<Browser> | undefined;

  const launch = () => {
    const launching = import("playwright-core").then(({ chromium }) => chromium.launch({ headless: true }));
    // A failed launch shouldn't stick; the next render tries again.
    launching.catch(() => {
      if (browser === launching) browser = undefined;
    });
    return launching;
  };

  /** The running browser, relaunched if it has crashed or been closed. */
  const connected = async () => {
    browser ??= launch();
    const b = await browser;
    if (b.isConnected()) return b;
    browser = launch();
    return browser;
  };

  return {
    async render(html) {
      const page = await (await connected()).newPage({ javaScriptEnabled: false });
      try {
        await page.setContent(html, { waitUntil: "load" });
        return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      } finally {
        await page.close();
      }
    },
    async close() {
      if (browser) await (await browser.catch(() => undefined))?.close();
      browser = undefined;
    },
  };
}

/** Tests: records the HTML and returns a stub PDF. */
export function fakePdfRenderer(): PdfRenderer & { rendered: string[] } {
  const rendered: string[] = [];
  return {
    rendered,
    async render(html) {
      rendered.push(html);
      return Buffer.from("%PDF-1.7 fake");
    },
    async close() {},
  };
}
