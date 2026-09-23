import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/session";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
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
            <div className="mx-auto max-w-5xl px-4">Results recorded by umpires on the pitch.</div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
