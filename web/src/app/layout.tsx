import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { GitHubIcon } from "@/components/GitHubIcon";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/session";
import { DOCS_URL, GITHUB_URL, LANDING_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    // next-themes sets the theme class before React hydrates.
    <html lang="en-GB" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className="flex min-h-svh flex-col bg-muted/40">
        <Providers>
          <SiteHeader user={user} />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-16">{children}</main>
          <footer className="border-t py-6 text-sm text-muted-foreground">
            <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
              <span>Results recorded by umpires on the pitch.</span>
              <nav aria-label="Other sites" className="flex flex-wrap gap-4">
                <a href={LANDING_URL} className="hover:text-foreground">
                  About the apps
                </a>
                <a href={DOCS_URL} className="hover:text-foreground">
                  Docs
                </a>
                <a href={GITHUB_URL} className="flex items-center gap-1.5 hover:text-foreground">
                  <GitHubIcon className="size-3.5" /> GitHub
                </a>
                <a href={`${LANDING_URL}/privacy`} className="hover:text-foreground">
                  Privacy
                </a>
              </nav>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
