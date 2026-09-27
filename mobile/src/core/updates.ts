/**
 * Update notices: whether GitHub has a newer phone or watch app than the ones
 * installed. Releases come from `pnpm release:github`, whose APKs are named
 * fh-match-centre-phone-<version>-<build>-<stage>.apk and
 * fh-match-centre-watch-<version>-<build>.apk. The build number is what's compared.
 */

export const RELEASES_URL = "https://api.github.com/repos/KingCharlesVI/fh-watch/releases?per_page=10";

/** The parts of a release the GitHub API returns that matter here. */
export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

export interface AppDownload {
  build: number;
  url: string;
}

export interface Release {
  tag: string;
  /** "0.4.0 alpha 9", or "0.4.0" for a full release. */
  name: string;
  prerelease: boolean;
  pageUrl: string;
  phone: AppDownload | null;
  watch: AppDownload | null;
}

const PHONE_APK = /^fh-match-centre-phone-[\d.]+-(\d+)-\w+\.apk$/;
const WATCH_APK = /^fh-match-centre-watch-[\d.]+-(\d+)\.apk$/;

function download(assets: GitHubRelease["assets"], pattern: RegExp): AppDownload | null {
  for (const a of assets) {
    const match = pattern.exec(a.name);
    if (match) return { build: Number(match[1]), url: a.browser_download_url };
  }
  return null;
}

/** GitHub's release list, newest first, as releases with APKs. Anything else is skipped. */
export function readReleases(json: unknown): Release[] {
  if (!Array.isArray(json)) return [];
  const out: Release[] = [];
  for (const r of json as GitHubRelease[]) {
    if (!r || r.draft || typeof r.tag_name !== "string" || !Array.isArray(r.assets)) continue;
    const phone = download(r.assets, PHONE_APK);
    const watch = download(r.assets, WATCH_APK);
    if (!phone && !watch) continue;
    out.push({
      tag: r.tag_name,
      name: r.tag_name.replace(/^v/, "").replace(/-(\w+)\.(\d+)$/, " $1 $2"),
      prerelease: !!r.prerelease,
      pageUrl: r.html_url,
      phone,
      watch,
    });
  }
  return out;
}

export interface Installed {
  /** The phone app's build, or null in a development build (never told about updates). */
  phone: number | null;
  /** The watch app's build on each watch that has told the phone. */
  watches: number[];
}

export interface Update {
  release: Release;
  /** A newer phone app to download. */
  phone: AppDownload | null;
  /** A newer watch app: installed from a computer, so this links to the release page. */
  watch: AppDownload | null;
}

/**
 * The newest release (pre-releases only when asked for) if it has a newer phone or watch
 * app than the ones installed. Null when everything is up to date.
 */
export function findUpdate(releases: Release[], installed: Installed, includePreReleases: boolean): Update | null {
  const release = releases.find((r) => includePreReleases || !r.prerelease);
  if (!release) return null;
  const phone = release.phone && installed.phone !== null && release.phone.build > installed.phone ? release.phone : null;
  const watch = release.watch && installed.watches.some((b) => b < release.watch!.build) ? release.watch : null;
  return phone || watch ? { release, phone, watch } : null;
}
