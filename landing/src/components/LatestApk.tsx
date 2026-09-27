"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { SITE } from "@/content";

/** The APK files `pnpm release:github` attaches to each release, by app. */
const ASSET = { phone: /^fh-match-centre-phone-.*\.apk$/, watch: /^fh-match-centre-watch-.*\.apk$/ } as const;

export type App = keyof typeof ASSET;

interface Release {
  tag_name: string;
  draft: boolean;
  assets: { name: string; size: number; browser_download_url: string }[];
}

interface Found {
  href: string;
  detail: string;
}

// One request for every button on the page. GitHub allows 60 an hour per visitor without signing in.
let releases: Promise<Release[]> | null = null;
const fetchReleases = () =>
  (releases ??= fetch(`https://api.github.com/repos/${SITE.githubRepo}/releases?per_page=10`, {
    headers: { Accept: "application/vnd.github+json" },
  }).then((r): Promise<Release[]> | Release[] => (r.ok ? r.json() : [])));

/** The app's APK in the newest release that has one, pre-releases included (GitHub lists them newest first). */
async function latest(app: App): Promise<Found | null> {
  for (const release of await fetchReleases()) {
    if (release.draft) continue;
    const asset = release.assets.find((a) => ASSET[app].test(a.name));
    if (asset) {
      // "v0.3.0-alpha.7" reads as "0.3.0 alpha 7".
      const version = release.tag_name.replace(/^v/, "").replace(/-(\w+)\.(\d+)$/, " $1 $2");
      return { href: asset.browser_download_url, detail: `${version} · ${Math.round(asset.size / 1_000_000)} MB` };
    }
  }
  return null;
}

/**
 * A download button for an app's APK from the newest GitHub release. Until the release is found
 * (or if GitHub can't be reached) it links to the releases page, where the files are too.
 */
export function LatestApk({ app, label }: { app: App; label: string }) {
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    latest(app).then(setFound, () => {});
  }, [app]);

  return (
    <a
      href={found?.href ?? `https://github.com/${SITE.githubRepo}/releases`}
      className="flex h-11 items-center justify-between gap-3 rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
    >
      <span className="inline-flex items-center gap-2">
        <Download className="size-4" /> {label}
      </span>
      {found && <span className="text-xs text-muted-foreground">{found.detail}</span>}
    </a>
  );
}
