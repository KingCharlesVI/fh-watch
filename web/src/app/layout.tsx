import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/session";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";
import "./globals.css";

// Variable in width as well as weight: scores and section titles use it condensed, page titles wide.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_GB" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf0eb" },
    { media: "(prefers-color-scheme: dark)", color: "#07110c" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    // next-themes sets the theme class before React hydrates.
    <html lang="en-GB" className={cn("font-sans", archivo.variable, jetbrainsMono.variable)} suppressHydrationWarning>
      <body className="flex min-h-svh flex-col">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
            Skip to content
          </a>
          <SiteHeader user={user} />
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-20 sm:px-6">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
