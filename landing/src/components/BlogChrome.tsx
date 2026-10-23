import type { ReactNode } from "react";
import { GITHUB_URL, SITE } from "@/content";
import { Container, GitHubIcon, Logo } from "./parts";

/** The header and footer of the blog's pages, around whatever they show. */
export function BlogChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b">
        <Container className="flex h-14 items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo size={28} /> {SITE.name}
          </a>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <a href="/blog" className="hover:text-foreground">
              Blog
            </a>
            <a href={SITE.docsUrl} className="hover:text-foreground">
              Docs
            </a>
            <a href="/#download" className="font-medium text-foreground hover:text-primary">
              Download
            </a>
          </nav>
        </Container>
      </header>

      <main>{children}</main>

      <footer className="border-t py-10">
        <Container className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Logo size={20} /> {SITE.name}
          </span>
          <nav className="flex flex-wrap gap-5">
            <a href="/" className="hover:text-foreground">
              Home
            </a>
            <a href="/blog" className="hover:text-foreground">
              Blog
            </a>
            <a href="/changelog" className="hover:text-foreground">
              Changelog
            </a>
            <a href={SITE.docsUrl} className="hover:text-foreground">
              Docs
            </a>
            <a href="/support" className="hover:text-foreground">
              Support
            </a>
            <a href={GITHUB_URL} className="flex items-center gap-1.5 hover:text-foreground">
              <GitHubIcon size={15} /> GitHub
            </a>
            <a href="/privacy" className="hover:text-foreground">
              Privacy
            </a>
          </nav>
        </Container>
      </footer>
    </>
  );
}
