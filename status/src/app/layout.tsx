import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { Container } from "@/components/ui";
import { SITE } from "@/lib/site";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} status`, template: `%s · ${SITE.name} status` },
  description: `Whether ${SITE.name}'s apps, website and API are working, and what's happened lately.`,
  openGraph: { title: `${SITE.name} status`, type: "website" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={geist.variable}>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <header className="border-b">
          <Container className="flex h-14 items-center justify-between">
            <a href="/" className="font-semibold tracking-tight no-underline">
              {SITE.name} <span className="text-muted-foreground">status</span>
            </a>
            <nav className="flex items-center gap-5 text-sm text-muted-foreground">
              <a href="/history" className="hover:text-foreground">
                History
              </a>
              <a href={SITE.landingUrl} className="hover:text-foreground">
                Home
              </a>
              <a href={`${SITE.landingUrl}/support`} className="font-medium text-foreground hover:text-primary">
                Support
              </a>
            </nav>
          </Container>
        </header>
        {children}
        <footer className="mt-16 border-t py-8 text-sm text-muted-foreground">
          <Container className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Checked from this page, not reported by the servers themselves. Times are {SITE.timeZoneLabel}.
            </span>
            <nav className="flex flex-wrap gap-4">
              <a href="/api/status" className="hover:text-foreground">
                JSON
              </a>
              <a href="/feed.xml" className="hover:text-foreground">
                RSS
              </a>
              <a href={SITE.landingUrl} className="hover:text-foreground">
                {SITE.name}
              </a>
            </nav>
          </Container>
        </footer>
      </body>
    </html>
  );
}
